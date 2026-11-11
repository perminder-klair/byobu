// A tile's sheet: what the screen shows of it, and what pressing its controls sends back. The
// sheet itself comes from the plugin each time, so a light switched elsewhere changes here too,
// and the sheet closes if its tile goes.
use crate::clock;
use crate::protocol::{Action, Section, Tile};
use crate::theme::{Palette, mix, parse_colour};
use crate::{ButtonData, ChoiceData, SectionData, SetpointData, Stops};
use slint::{Color, ModelRc, SharedString, VecModel};

// What's open: the tile, by its plugin and id.
#[derive(Clone, Debug, PartialEq)]
pub struct Open {
    pub plugin: String,
    pub id: String,
}

pub struct Colours {
    pub tone: Color,
    pub selected: Color,
    pub fill: Color,
}

fn colour(rgb: crate::theme::Rgb) -> Color {
    Color::from_rgb_u8(rgb.r, rgb.g, rgb.b)
}

// The tone a sheet is drawn in, and what styles.css mixes from it.
pub fn colours(tile: &Tile, palette: &Palette) -> Colours {
    let tone = palette.tone(tile.sheet.as_ref().and_then(|sheet| sheet.tone.as_deref()).unwrap_or(&tile.tone));
    Colours { tone: colour(tone), selected: colour(mix(palette.raised(), tone, 0.5)), fill: colour(mix(palette.raised(), tone, 0.65)) }
}

// "Living Room · On · 5 minutes ago".
pub fn subtitle(tile: &Tile) -> String {
    let when = tile.changed_at.as_deref().and_then(|time| clock::since(time, &chrono::Local::now()));
    [tile.room.clone(), tile.state.clone(), when].into_iter().flatten().filter(|part| !part.is_empty()).collect::<Vec<_>>().join(" · ")
}

fn buttons(buttons: &[crate::protocol::Button]) -> ModelRc<ButtonData> {
    let rows = buttons.iter().map(|button| ButtonData { icon: button.icon.as_str().into(), label: button.label.as_str().into(), selected: button.selected });
    ModelRc::new(VecModel::from_iter(rows))
}

pub fn section_data(section: &Section) -> SectionData {
    let mut data = SectionData::default();
    match section {
        Section::Slider { label, value, min, max, step, gradient, .. } => {
            data.kind = "slider".into();
            data.label = label.as_str().into();
            data.value = value.unwrap_or(*min) as f32;
            data.known = value.is_some();
            (data.min, data.max, data.step) = (*min as f32, *max as f32, step.unwrap_or(1.0) as f32);
            if let Some(brush) = gradient.as_deref().and_then(gradient_brush) {
                data.gradient = brush;
                data.has_gradient = true;
            }
        }
        Section::Choices { label, options, value, .. } => {
            data.kind = "choices".into();
            data.label = label.as_str().into();
            let rows = options.iter().map(|option| ChoiceData { value: option.value.as_str().into(), label: option.label.as_str().into() });
            data.options = ModelRc::new(VecModel::from_iter(rows));
            data.chosen = value.as_deref().unwrap_or_default().into();
        }
        Section::Buttons { buttons: list } => {
            data.kind = "buttons".into();
            data.buttons = buttons(list);
        }
        Section::Setpoints { setpoints, reading } => {
            data.kind = "setpoints".into();
            let rows = setpoints.iter().map(|setpoint| SetpointData {
                label: setpoint.label.as_str().into(),
                value: setpoint.value as f32,
                min: setpoint.min as f32,
                max: setpoint.max as f32,
                step: setpoint.step as f32,
            });
            data.setpoints = ModelRc::new(VecModel::from_iter(rows));
            data.reading = reading.as_deref().unwrap_or_default().into();
        }
        Section::Media { title, by, controls } => {
            data.kind = "media".into();
            data.title = title.as_deref().unwrap_or_default().into();
            data.by = by.as_deref().unwrap_or_default().into();
            data.buttons = buttons(controls);
        }
    }
    data
}

// How a slider's value reads: a word for it, or the number with its suffix, or nothing.
pub fn format(section: Option<&Section>, value: f32) -> SharedString {
    let Some(Section::Slider { suffix, names, .. }) = section else { return SharedString::new() };
    let rounded = value.round() as i64;
    if let Some(name) = names.get(&rounded.to_string()).filter(|_| (value - rounded as f32).abs() < f32::EPSILON) {
        return name.as_str().into();
    }
    suffix.as_ref().map(|suffix| format!("{rounded}{suffix}")).unwrap_or_default().into()
}

// The action behind a press, and the value it carries, by section and item as the screen numbers
// them.
pub enum Input<'a> {
    Pressed(usize),
    Chose(&'a str),
    Set(usize, f32),
}

pub fn action(section: &Section, input: Input) -> Option<(Action, Option<serde_json::Value>)> {
    use serde_json::json;
    match (section, input) {
        (Section::Buttons { buttons }, Input::Pressed(item)) | (Section::Media { controls: buttons, .. }, Input::Pressed(item)) => {
            Some((buttons.get(item)?.action.clone(), None))
        }
        (Section::Choices { action, .. }, Input::Chose(value)) => Some((action.clone(), Some(json!(value)))),
        (Section::Slider { action, .. }, Input::Set(_, value)) => Some((action.clone(), Some(json!(value)))),
        (Section::Setpoints { setpoints, .. }, Input::Set(item, value)) => Some((setpoints.get(item)?.action.clone(), Some(json!(value)))),
        _ => None,
    }
}

// A CSS linear-gradient running left to right, as plugins send for colour temperature and hue.
// Stops with no position share out the space between those that have one, as in CSS.
pub fn gradient_stops(css: &str) -> Option<Vec<(f32, crate::theme::Rgb)>> {
    let inside = css.trim().strip_prefix("linear-gradient(")?.strip_suffix(')')?;
    let mut parts = Vec::new();
    let (mut depth, mut start) = (0, 0);
    for (i, c) in inside.char_indices() {
        match c {
            '(' => depth += 1,
            ')' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(&inside[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    parts.push(&inside[start..]);
    let mut stops: Vec<(Option<f32>, crate::theme::Rgb)> = Vec::new();
    for part in parts.iter().map(|part| part.trim()) {
        if part.starts_with("to ") || part.ends_with("deg") {
            continue;
        }
        let (colour, at) = match part.rsplit_once(' ') {
            Some((colour, at)) if at.ends_with('%') && !colour.ends_with(',') => (colour, at.trim_end_matches('%').parse::<f32>().ok().map(|at| at / 100.0)),
            _ => (part, None),
        };
        stops.push((at, parse_colour(colour)?));
    }
    if stops.len() < 2 {
        return None;
    }
    let last = stops.len() - 1;
    stops[0].0.get_or_insert(0.0);
    stops[last].0.get_or_insert(1.0);
    let mut placed = Vec::with_capacity(stops.len());
    let mut i = 0;
    while i <= last {
        let from = stops[i].0.unwrap();
        let next = (i + 1..=last).find(|&j| stops[j].0.is_some()).unwrap_or(last);
        let to = stops[next].0.unwrap();
        for (k, j) in (i..next).enumerate() {
            placed.push((from + (to - from) * k as f32 / (next - i) as f32, stops[j].1));
        }
        if next == last {
            placed.push((to, stops[last].1));
            break;
        }
        i = next;
    }
    Some(placed)
}

// Seven stops are what the screen has room for, as many as the hue slider uses. More are left out.
fn gradient_brush(css: &str) -> Option<Stops> {
    let mut stops = gradient_stops(css)?;
    stops.truncate(7);
    let last = *stops.last()?;
    stops.resize(7, last);
    let at = |i: usize| (colour(stops[i].1), stops[i].0);
    let mut out = Stops::default();
    ((out.c0, out.p0), (out.c1, out.p1), (out.c2, out.p2), (out.c3, out.p3)) = (at(0), at(1), at(2), at(3));
    ((out.c4, out.p4), (out.c5, out.p5), (out.c6, out.p6)) = (at(4), at(5), at(6));
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::theme::Rgb;

    #[test]
    fn spreads_gradient_stops_as_css_does() {
        let stops = gradient_stops("linear-gradient(to right, #ff9a3c, #ffd2a1 35%, #fff4e8 70%, #dce8ff)").unwrap();
        let at: Vec<f32> = stops.iter().map(|(at, _)| *at).collect();
        assert_eq!(at, [0.0, 0.35, 0.7, 1.0]);
        let hues = gradient_stops("linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)").unwrap();
        assert_eq!(hues.len(), 7);
        assert!((hues[3].0 - 0.5).abs() < 1e-6);
        assert_eq!(hues[0].1, Rgb { r: 255, g: 0, b: 0 });
        assert!(gradient_stops("radial-gradient(#fff, #000)").is_none());
    }

    #[test]
    fn a_slider_reads_as_its_name_or_its_suffix() {
        let slider: Section = serde_json::from_value(serde_json::json!({
            "type": "slider", "label": "Speed", "min": 0, "max": 100, "suffix": "%", "names": { "0": "Off" }, "action": { "id": "speed" }
        }))
        .unwrap();
        assert_eq!(format(Some(&slider), 0.0), "Off");
        assert_eq!(format(Some(&slider), 25.4), "25%");
        assert_eq!(format(None, 25.0), "");
    }

    #[test]
    fn presses_find_their_action_and_value() {
        let section: Section = serde_json::from_value(serde_json::json!({
            "type": "setpoints", "setpoints": [{ "label": "Target", "value": 20, "min": 7, "max": 30, "step": 0.5, "action": { "id": "target" } }]
        }))
        .unwrap();
        let (action, value) = action(&section, Input::Set(0, 21.5)).unwrap();
        assert_eq!((action.id.as_str(), value), ("target", Some(serde_json::json!(21.5))));
        assert!(super::action(&section, Input::Set(3, 1.0)).is_none());
        assert!(super::action(&section, Input::Pressed(0)).is_none());
    }
}
