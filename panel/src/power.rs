// What the screen does as a room goes quiet, as shell/src/power.ts does it: it falls back to the
// far view, then dims, then turns the backlight off, and a touch brings it all back. The touch
// that wakes a dim or blank screen is only a wake, so it never presses what's under the finger.
// This panel has no far view yet, so far looks the same as near for now.
use crate::protocol::PanelSettings;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

const FAR: Duration = Duration::from_secs(45);
const DIM: Duration = Duration::from_secs(5 * 60);
const DIM_FACTOR: f64 = 0.3;
const NIGHT_BRIGHTNESS: f64 = 8.0;
// From 22:00 until 07:00.
const NIGHT_FROM: u32 = 22;
const NIGHT_TO: u32 = 7;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum State {
    Near,
    Far,
    Dim,
    Blank,
}

impl State {
    pub fn name(self) -> &'static str {
        match self {
            State::Near => "near",
            State::Far => "far",
            State::Dim => "dim",
            State::Blank => "blank",
        }
    }
}

// When the screen was last touched, written from wherever touches are seen. It's only a time, so
// noting a touch never changes what that same touch lands on.
static STARTED: OnceLock<Instant> = OnceLock::new();
static TOUCHED: AtomicU64 = AtomicU64::new(0);

fn started() -> Instant {
    *STARTED.get_or_init(Instant::now)
}

pub fn touched() {
    TOUCHED.store(started().elapsed().as_millis() as u64, Ordering::Relaxed);
}

fn idle() -> Duration {
    started().elapsed().saturating_sub(Duration::from_millis(TOUCHED.load(Ordering::Relaxed)))
}

pub fn night(setting: &str, hour: u32) -> bool {
    match setting {
        "on" => true,
        "off" => false,
        _ => hour >= NIGHT_FROM || hour < NIGHT_TO,
    }
}

// `close` stays false from going far until something wakes the screen, so looking away and back
// doesn't bring the near view back by itself.
pub fn state(idle: Duration, close: bool, blank_after_minutes: f64) -> State {
    if blank_after_minutes > 0.0 && idle.as_secs_f64() >= blank_after_minutes * 60.0 {
        State::Blank
    } else if idle >= DIM {
        State::Dim
    } else if close && idle < FAR {
        State::Near
    } else {
        State::Far
    }
}

// The backlight as a percentage, which byobud turns into the panel's own levels.
pub fn backlight(state: State, night: bool, brightness: f64) -> u32 {
    let bright = if night { brightness.min(NIGHT_BRIGHTNESS) } else { brightness };
    match state {
        State::Blank => 0,
        State::Dim => (bright * DIM_FACTOR).round() as u32,
        _ => bright.round() as u32,
    }
}

pub struct Power {
    pub state: State,
    pub night: bool,
    close: bool,
    backlight: Option<u32>,
}

// What changed in a refresh: whether the screen needs drawing again, and a backlight to set.
pub struct Change {
    pub redraw: bool,
    pub backlight: Option<u32>,
}

impl Default for Power {
    fn default() -> Self {
        started();
        touched();
        Power { state: State::Near, night: false, close: true, backlight: None }
    }
}

impl Power {
    // Anything as good as a tap brings the near view back.
    pub fn wake(&mut self) {
        touched();
        self.close = true;
    }

    pub fn refresh(&mut self, settings: &PanelSettings, hour: u32) -> Change {
        self.refresh_after(idle(), settings, hour)
    }

    fn refresh_after(&mut self, idle: Duration, settings: &PanelSettings, hour: u32) -> Change {
        let state = state(idle, self.close, settings.blank_after);
        if state == State::Far {
            self.close = false;
        }
        let night = night(&settings.night, hour);
        let redraw = state != self.state || night != self.night;
        (self.state, self.night) = (state, night);
        let level = backlight(state, night, settings.brightness);
        let backlight = (self.backlight != Some(level)).then_some(level);
        self.backlight = Some(level);
        Change { redraw, backlight }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(blank_after: f64) -> PanelSettings {
        PanelSettings { brightness: 50.0, night: "off".into(), blank_after, ..Default::default() }
    }

    const MINUTE: Duration = Duration::from_secs(60);

    #[test]
    fn a_quiet_room_goes_far_then_dim_then_blank() {
        assert_eq!(state(Duration::ZERO, true, 30.0), State::Near);
        assert_eq!(state(MINUTE, true, 30.0), State::Far);
        assert_eq!(state(6 * MINUTE, true, 30.0), State::Dim);
        assert_eq!(state(30 * MINUTE, true, 30.0), State::Blank);
        // 0 leaves the screen on.
        assert_eq!(state(600 * MINUTE, true, 0.0), State::Dim);
    }

    #[test]
    fn night_is_from_ten_until_seven_unless_set() {
        assert!(night("auto", 22) && night("auto", 6) && !night("auto", 7) && !night("auto", 12));
        assert!(night("on", 12) && !night("off", 23));
    }

    #[test]
    fn the_backlight_dims_caps_at_night_and_goes_off() {
        assert_eq!(backlight(State::Near, false, 50.0), 50);
        assert_eq!(backlight(State::Dim, false, 50.0), 15);
        assert_eq!(backlight(State::Near, true, 50.0), 8);
        assert_eq!(backlight(State::Near, true, 5.0), 5);
        assert_eq!(backlight(State::Blank, false, 50.0), 0);
    }

    #[test]
    fn the_backlight_is_set_once_on_starting_and_then_only_on_a_change() {
        let mut power = Power::default();
        let first = power.refresh_after(Duration::ZERO, &settings(30.0), 12);
        assert_eq!(first.backlight, Some(50));
        assert!(power.refresh_after(Duration::from_secs(1), &settings(30.0), 12).backlight.is_none());
        let dim = power.refresh_after(6 * MINUTE, &settings(30.0), 12);
        assert!(dim.redraw);
        assert_eq!(dim.backlight, Some(15));
    }

    #[test]
    fn once_far_it_stays_far_until_woken() {
        let mut power = Power::default();
        power.refresh_after(MINUTE, &settings(30.0), 12);
        assert_eq!(power.state, State::Far);
        // A touch that isn't a wake keeps it far, as a swipe through the far faces does.
        power.refresh_after(Duration::ZERO, &settings(30.0), 12);
        assert_eq!(power.state, State::Far);
        power.wake();
        power.refresh_after(Duration::ZERO, &settings(30.0), 12);
        assert_eq!(power.state, State::Near);
    }
}
