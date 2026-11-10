// Works the screen without a finger, for checking it where there's nothing to touch, and for
// taking pictures of it. BYOBU_SCRIPT holds steps separated by semicolons, run a moment apart:
//
//   BYOBU_SCRIPT="wait; swipe 1000 400 300 400; tap 500 150; save panel.png; quit"
use crate::Panel;
use slint::platform::{PointerEventButton, WindowEvent};
use slint::{ComponentHandle, LogicalPosition, Timer};
use std::collections::VecDeque;
use std::time::Duration;

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
            _ => eprintln!("Skipping a step that isn't a tap, swipe, wait, save or quit: {step}"),
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
