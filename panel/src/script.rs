// Works the screen without a finger, for checking it where there's nothing to touch, and for
// taking pictures of it. BYOBU_SCRIPT holds steps separated by semicolons, run a moment apart:
//
//   BYOBU_SCRIPT="wait; swipe 1000 400 300 400; tap 500 150; hold 500 300; save panel.png; quit"
use crate::Panel;
use slint::platform::{PointerEventButton, WindowEvent};
use slint::{ComponentHandle, LogicalPosition, RenderingState, Timer};
use std::collections::VecDeque;
use std::time::{Duration, Instant};

// Long enough for data to arrive and anything moving to settle.
const BETWEEN_STEPS: Duration = Duration::from_millis(900);
const BETWEEN_MOVES: Duration = Duration::from_millis(16);
const MOVES: usize = 12;

type Step = (Duration, Box<dyn FnOnce(&Panel)>);

fn pointer(event: fn(LogicalPosition) -> WindowEvent, x: f32, y: f32) -> Box<dyn FnOnce(&Panel)> {
    Box::new(move |panel| panel.window().dispatch_event(event(LogicalPosition::new(x, y))))
}

fn pressed(position: LogicalPosition) -> WindowEvent {
    WindowEvent::PointerPressed { position, button: PointerEventButton::Left }
}

fn released(position: LogicalPosition) -> WindowEvent {
    WindowEvent::PointerReleased { position, button: PointerEventButton::Left }
}

fn moved(position: LogicalPosition) -> WindowEvent {
    WindowEvent::PointerMoved { position }
}

fn steps(script: &str) -> VecDeque<Step> {
    let mut steps: VecDeque<Step> = VecDeque::new();
    for step in script.split(';') {
        let words: Vec<&str> = step.split_whitespace().collect();
        let numbers: Vec<f32> = words.iter().skip(1).filter_map(|word| word.parse().ok()).collect();
        match (words.first().copied(), numbers.as_slice()) {
            (Some("tap"), &[x, y]) => {
                steps.push_back((BETWEEN_STEPS, pointer(pressed, x, y)));
                // Held for as long as a quick finger would.
                steps.push_back((BETWEEN_MOVES * 6, pointer(released, x, y)));
            }
            // A long press, held past the half second that opens a tile's sheet.
            (Some("hold"), &[x, y]) => {
                steps.push_back((BETWEEN_STEPS, pointer(pressed, x, y)));
                steps.push_back((Duration::from_millis(700), pointer(released, x, y)));
            }
            (Some("swipe"), &[x, y, to_x, to_y]) => {
                steps.push_back((BETWEEN_STEPS, pointer(pressed, x, y)));
                for i in 1..=MOVES {
                    let part = i as f32 / MOVES as f32;
                    steps.push_back((BETWEEN_MOVES, pointer(moved, x + (to_x - x) * part, y + (to_y - y) * part)));
                }
                steps.push_back((BETWEEN_MOVES, pointer(released, to_x, to_y)));
            }
            (Some("save"), _) if words.len() == 2 => {
                let path = words[1].to_string();
                steps.push_back((BETWEEN_STEPS, Box::new(move |panel| save(panel, &path))));
            }
            (Some("wait"), _) => steps.push_back((BETWEEN_STEPS, Box::new(|_| {}))),
            (Some("quit"), _) => steps.push_back((BETWEEN_STEPS, Box::new(|_| slint::quit_event_loop().unwrap_or_default()))),
            (None, _) => {}
            _ => eprintln!("Skipping a step that isn't a tap, hold, swipe, wait, save or quit: {step}"),
        }
    }
    steps
}

fn save(panel: &Panel, path: &str) {
    let saved = panel.window().take_snapshot().map_err(|error| error.to_string()).and_then(|picture| {
        image::save_buffer(path, picture.as_bytes(), picture.width(), picture.height(), image::ColorType::Rgba8).map_err(|error| error.to_string())
    });
    if let Err(error) = saved {
        eprintln!("Couldn't save {path}: {error}");
    }
}

fn run(panel: slint::Weak<Panel>, mut steps: VecDeque<Step>) {
    let Some((wait, step)) = steps.pop_front() else { return };
    Timer::single_shot(wait, move || {
        let Some(strong) = panel.upgrade() else { return };
        step(&strong);
        run(panel, steps);
    });
}

pub fn start(panel: &Panel) {
    if let Ok(script) = std::env::var("BYOBU_SCRIPT") {
        run(panel.as_weak(), steps(&script));
    }
}

// BYOBU_FRAMES reports how smoothly things move: for each burst of drawing, how many frames there
// were, the average and the longest time between them, and the longest a single frame took to
// draw. A Pi has about 16 ms a frame. Nothing is printed while the screen is still, and a burst is
// reported when the next one starts.
pub fn count_frames(panel: &Panel) {
    if std::env::var_os("BYOBU_FRAMES").is_none() {
        return;
    }
    // Slint 1.18's GPU renderer sizes its canvas to the window rather than the screen once anything
    // listens for frames, which on a rotated screen pushes the picture sideways by the difference
    // and puts every tap off by as much.
    if std::env::var("SLINT_KMS_ROTATION").is_ok_and(|rotation| rotation.trim() != "0") {
        eprintln!("Not counting frames: on a rotated screen that would move the picture");
        return;
    }
    // A pause this long ends a burst rather than counting as a slow frame.
    const STILL: Duration = Duration::from_millis(250);
    let mut started = None;
    let mut previous: Option<Instant> = None;
    let mut first = None;
    let (mut frames, mut slowest_gap, mut slowest_draw) = (0u32, Duration::ZERO, Duration::ZERO);
    let report = |frames: u32, first: Instant, last: Instant, gap: Duration, draw: Duration| {
        if frames > 1 {
            let average = (last - first) / (frames - 1);
            eprintln!("{frames} frames: {average:.1?} apart on average, {gap:.1?} at most, slowest draw {draw:.1?}");
        }
    };
    let set = panel.window().set_rendering_notifier(move |state, _| match state {
        RenderingState::BeforeRendering => started = Some(Instant::now()),
        RenderingState::AfterRendering => {
            let now = Instant::now();
            if let Some(began) = started.take() {
                slowest_draw = slowest_draw.max(now - began);
            }
            match previous {
                Some(last) if now - last < STILL => {
                    slowest_gap = slowest_gap.max(now - last);
                    frames += 1;
                }
                _ => {
                    if let (Some(start), Some(last)) = (first, previous) {
                        report(frames, start, last, slowest_gap, slowest_draw);
                    } else {
                        // The journal's timestamps then give the time from starting to a picture.
                        eprintln!("First frame drawn");
                    }
                    (frames, slowest_gap, slowest_draw, first) = (1, Duration::ZERO, Duration::ZERO, Some(now));
                }
            }
            previous = Some(now);
        }
        _ => {}
    });
    if let Err(error) = set {
        eprintln!("Can't count frames with this renderer: {error:?}");
    }
}
