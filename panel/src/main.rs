// Byōbu's panel drawn natively with Slint, in place of Chromium showing the shell. It's a client
// of byobud like any other: it follows /api/events, draws what plugins publish and sends taps back
// to the plugin that owns them, so byobud and the plugins don't know which of the two is showing.
mod blocks;
mod clock;
mod net;
mod power;
mod protocol;
mod script;
mod sheet;
mod store;
mod theme;
mod touch;

use chrono::{Local, Timelike};
use net::{Api, Event};
use power::Power;
use slint::{ComponentHandle, Image, Model, ModelRc, Rgba8Pixel, SharedPixelBuffer, SharedString, Timer, TimerMode, VecModel};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use store::{Placed, Store};
use theme::{Palette, Rgb};

slint::include_modules!();

const RETRY: Duration = Duration::from_secs(2);
// A sheet left open closes by itself, so the panel goes back to what was under it.
const SHEET_IDLE: Duration = Duration::from_secs(30);
const AGENDA_ON_FACE: usize = 5;
// The Touch Display 2's size. A pushed theme's wallpaper can be far bigger, and every pixel of it
// would sit in memory.
const WALLPAPER: (u32, u32) = (1280, 720);

// What the threads share. Only the event loop's thread touches the screen itself.
struct Shared {
    api: Api,
    store: Mutex<Store>,
    palette: Mutex<Palette>,
    power: Mutex<Power>,
    // The tile whose sheet is open.
    sheet: Mutex<Option<sheet::Open>>,
    // Posts to byobud, sent in order on a thread of their own.
    actions: Sender<(String, serde_json::Value)>,
    // Set while a redraw is already on its way, so a burst of updates costs one.
    pending: AtomicBool,
    panel: slint::Weak<Panel>,
}

fn colour(Rgb { r, g, b }: Rgb) -> slint::Color {
    slint::Color::from_rgb_u8(r, g, b)
}

// Brings a model in line with new rows, touching only the rows that changed, so one light
// switching redraws one tile.
fn sync<T: Clone + PartialEq + 'static>(model: &ModelRc<T>, rows: Vec<T>) {
    let Some(model) = model.as_any().downcast_ref::<VecModel<T>>() else { return };
    for index in (rows.len()..model.row_count()).rev() {
        model.remove(index);
    }
    for (index, row) in rows.into_iter().enumerate() {
        if index >= model.row_count() {
            model.push(row);
        } else if model.row_data(index).as_ref() != Some(&row) {
            model.set_row_data(index, row);
        }
    }
}

fn tile_data(Placed { plugin, tile }: &Placed, palette: &Palette) -> TileData {
    let tone = palette.tone(&tile.tone);
    TileData {
        plugin: (*plugin).into(),
        id: tile.id.as_str().into(),
        name: tile.name.as_str().into(),
        detail: tile.detail.as_str().into(),
        icon: tile.icon.as_str().into(),
        tone: colour(tone),
        fill: colour(palette.tinted(tone)),
        active: tile.active,
        unavailable: tile.unavailable,
    }
}

fn render(panel: &Panel, shared: &Shared) {
    // Cleared first, so anything arriving while this runs asks for another.
    shared.pending.store(false, Ordering::SeqCst);
    let palette = if shared.power.lock().unwrap().night { Palette::night() } else { shared.palette.lock().unwrap().clone() };
    let store = shared.store.lock().unwrap();

    let theme = panel.global::<Theme>();
    theme.set_background(colour(palette.background));
    theme.set_foreground(colour(palette.foreground));
    theme.set_accent(colour(palette.accent));
    theme.set_raised(colour(palette.raised()));
    theme.set_border(colour(palette.border()));
    theme.set_text_dim(colour(palette.text_dim()));

    let rooms = store.rooms();
    // A room can go, like one whose last device was removed.
    let chosen = panel.get_current_room();
    let current = rooms.iter().find(|room| room.name == chosen.as_str()).or(rooms.first());
    panel.set_current_room(current.map(|room| room.name.as_str()).unwrap_or_default().into());
    sync(&panel.get_rooms(), rooms.iter().map(|room| SharedString::from(room.name.as_str())).collect());
    sync(&panel.get_tiles(), current.map(|room| room.tiles.iter().map(|placed| tile_data(placed, &palette)).collect()).unwrap_or_default());

    let now = Local::now();
    let agenda = store.agenda().into_iter().take(AGENDA_ON_FACE);
    sync(&panel.get_agenda(), agenda.map(|event| AgendaRow { when: clock::event_time(&event.start, &now).into(), what: event.summary.as_str().into() }).collect());
    panel.set_status(store.problem().unwrap_or_default().into());

    let open = shared.sheet.lock().unwrap().clone();
    match open.as_ref().and_then(|open| store.find_tile(&open.plugin, &open.id)) {
        Some(tile) => {
            let colours = sheet::colours(tile, &palette);
            let sheet_colours = panel.global::<SheetColours>();
            sheet_colours.set_tone(colours.tone);
            sheet_colours.set_selected(colours.selected);
            sheet_colours.set_fill(colours.fill);
            panel.set_sheet_title(tile.name.as_str().into());
            panel.set_sheet_subtitle(sheet::subtitle(tile).into());
            panel.set_sheet_power(tile.sheet.as_ref().and_then(|sheet| sheet.power.as_ref()).map_or(-1, |power| power.on as i32));
            let sections = tile.sheet.as_ref().map(|sheet| sheet.sections.iter().map(sheet::section_data).collect()).unwrap_or_default();
            sync(&panel.get_sheet_sections(), sections);
            panel.set_sheet_open(true);
        }
        // Closed, or its tile has gone.
        None => {
            if open.is_some() {
                *shared.sheet.lock().unwrap() = None;
            }
            panel.set_sheet_open(false);
        }
    }
}

// Sends an action to the plugin that owns it, with the value a control picked.
fn act(shared: &Shared, plugin: &str, action: &protocol::Action, value: Option<serde_json::Value>) {
    let mut body = serde_json::json!({ "data": action.data });
    if let Some(value) = value {
        body["value"] = value;
    }
    let _ = shared.actions.send((format!("/api/plugins/{plugin}/actions/{}", action.id), body));
}

fn open_sheet(shared: &Shared, plugin: &str, id: &str) {
    *shared.sheet.lock().unwrap() = Some(sheet::Open { plugin: plugin.into(), id: id.into() });
    if let Some(panel) = shared.panel.upgrade() {
        render(&panel, shared);
    }
}

// The open sheet's tile and one of its sections, as they are now.
fn with_section<T>(shared: &Shared, index: i32, then: impl FnOnce(&str, Option<&protocol::Section>) -> T) -> Option<T> {
    let open = shared.sheet.lock().unwrap().clone()?;
    let store = shared.store.lock().unwrap();
    let tile = store.find_tile(&open.plugin, &open.id)?;
    let section = tile.sheet.as_ref().and_then(|sheet| sheet.sections.get(usize::try_from(index).ok()?));
    Some(then(&open.plugin, section))
}

fn sheet_input(shared: &Shared, index: i32, input: sheet::Input) {
    power::touched();
    let found = with_section(shared, index, |plugin, section| Some((plugin.to_string(), sheet::action(section?, input)?)));
    if let Some(Some((plugin, (action, value)))) = found {
        act(shared, &plugin, &action, value);
    }
}

fn request_render(shared: &Arc<Shared>) {
    if shared.pending.swap(true, Ordering::SeqCst) {
        return;
    }
    let shared = shared.clone();
    let _ = slint::invoke_from_event_loop(move || {
        if let Some(panel) = shared.panel.upgrade() {
            render(&panel, &shared);
        }
    });
}

// Once a minute, on the minute, rather than every second to see whether it has changed.
fn tick(shared: Arc<Shared>) {
    let Some(panel) = shared.panel.upgrade() else { return };
    let now = Local::now();
    let glyphs = blocks::glyphs(&clock::time(&now)).into_iter().map(|glyph| Glyph { columns: glyph.columns as i32, commands: glyph.path.into() });
    panel.set_time(ModelRc::new(VecModel::from_iter(glyphs)));
    panel.set_date(clock::date(&now).into());
    panel.set_bar_time(format!("{} {}", clock::weekday(&now), clock::time(&now)).into());
    // "today" in the agenda is a matter of time as well.
    request_render(&shared);
    Timer::single_shot(Duration::from_millis(clock::millis_to_next_minute(&now)), move || tick(shared));
}

// The palette and wallpaper sit beside the page on byobud, so the panel changes theme without a
// rebuild. Without them the fallback palette stays, over a plain background.
fn load_theme(shared: &Arc<Shared>) {
    let shared = shared.clone();
    thread::spawn(move || {
        if let Ok(css) = shared.api.get("/theme.css") {
            *shared.palette.lock().unwrap() = Palette::from_css(&String::from_utf8_lossy(&css));
            request_render(&shared);
        }
        let picture = shared.api.get("/wallpaper.jpg").ok().and_then(|bytes| image::load_from_memory(&bytes).ok()).map(|picture| {
            let (width, height) = WALLPAPER;
            let fitted = if picture.width() > width { picture.resize_to_fill(width, height, image::imageops::FilterType::Triangle) } else { picture };
            let pixels = fitted.into_rgba8();
            SharedPixelBuffer::<Rgba8Pixel>::clone_from_slice(pixels.as_raw(), pixels.width(), pixels.height())
        });
        let panel = shared.panel.clone();
        let _ = panel.upgrade_in_event_loop(move |panel| panel.set_wallpaper(picture.map(Image::from_rgba8).unwrap_or_default()));
    });
}

// Once a second as the shell does, and straight away when something wakes the screen. The
// backlight goes through byobud, which owns it, as the shell's does.
fn refresh_power(panel: &Panel, shared: &Shared) {
    let settings = shared.store.lock().unwrap().snapshot.as_ref().map(|snapshot| snapshot.panel.clone()).unwrap_or_default();
    let mut power = shared.power.lock().unwrap();
    let change = power.refresh(&settings, Local::now().hour());
    let (state, night) = (power.state, power.night);
    drop(power);
    if let Some(percent) = change.backlight {
        let _ = shared.actions.send(("/api/backlight".into(), serde_json::json!({ "percent": percent })));
    }
    let idle_sheet = shared.sheet.lock().unwrap().is_some() && power::idle() >= SHEET_IDLE;
    if idle_sheet {
        *shared.sheet.lock().unwrap() = None;
        render(panel, shared);
    }
    if change.redraw {
        panel.set_power(state.name().into());
        panel.set_night(night);
        render(panel, shared);
    }
}

// Follows byobud for as long as the panel runs. It sends everything on connecting, so a lost
// connection needs nothing but another try.
fn follow(shared: Arc<Shared>) {
    // Only a new theme is worth fetching again, not a change of brightness.
    let mut theme: Option<(String, f64)> = None;
    loop {
        let result = shared.api.events(|event| {
            let mut store = shared.store.lock().unwrap();
            match event {
                Event::Snapshot(snapshot) => store.snapshot = Some(*snapshot),
                Event::Update(update) => store.apply(update),
            }
            store.connected = true;
            let panel = store.snapshot.as_ref().map(|snapshot| (snapshot.panel.theme.clone(), snapshot.panel.theme_stamp));
            drop(store);
            if panel != theme {
                theme = panel;
                load_theme(&shared);
            }
            request_render(&shared);
        });
        if let Err(error) = result {
            eprintln!("Lost byobud: {error}");
        }
        shared.store.lock().unwrap().connected = false;
        request_render(&shared);
        thread::sleep(RETRY);
    }
}

// Actions go out on a thread of their own, in order, so a slow plugin never holds up a frame.
fn start_actions(shared: Arc<Shared>, receiver: Receiver<(String, serde_json::Value)>) {
    thread::spawn(move || {
        for (path, body) in receiver {
            if let Err(error) = shared.api.send("POST", &path, &body) {
                eprintln!("POST {path} failed: {error}");
            }
        }
    });
}

fn main() -> Result<(), slint::PlatformError> {
    touch::start()?;
    let panel = Panel::new()?;
    panel.set_rooms(ModelRc::new(VecModel::<SharedString>::default()));
    panel.set_tiles(ModelRc::new(VecModel::<TileData>::default()));
    panel.set_agenda(ModelRc::new(VecModel::<AgendaRow>::default()));
    panel.set_sheet_sections(ModelRc::new(VecModel::<SectionData>::default()));

    let (actions, receiver) = channel();
    let shared = Arc::new(Shared {
        api: Api::from_env(),
        store: Mutex::new(Store::default()),
        palette: Mutex::new(Palette::default()),
        power: Mutex::new(Power::default()),
        sheet: Mutex::new(None),
        actions,
        pending: AtomicBool::new(false),
        panel: panel.as_weak(),
    });

    start_actions(shared.clone(), receiver);
    panel.on_tile_tapped({
        let shared = shared.clone();
        move |plugin, id| {
            power::touched();
            let tap = shared.store.lock().unwrap().find_tile(&plugin, &id).and_then(|tile| tile.tap.clone());
            // With no tap of its own, a tile opens its sheet. That's how anything that shouldn't
            // happen by brushing the screen, like unlocking a door, is done.
            match tap {
                Some(action) => act(&shared, &plugin, &action, None),
                None => open_sheet(&shared, &plugin, &id),
            }
        }
    });
    panel.on_tile_held({
        let shared = shared.clone();
        move |plugin, id| {
            power::touched();
            open_sheet(&shared, &plugin, &id);
        }
    });
    panel.on_sheet_closed({
        let shared = shared.clone();
        move || {
            *shared.sheet.lock().unwrap() = None;
            if let Some(panel) = shared.panel.upgrade() {
                render(&panel, &shared);
            }
        }
    });
    panel.on_sheet_format({
        let shared = shared.clone();
        move |index, value| with_section(&shared, index, |_, section| sheet::format(section, value)).unwrap_or_default()
    });
    panel.on_sheet_pressed({
        let shared = shared.clone();
        move |index, item| sheet_input(&shared, index, sheet::Input::Pressed(item.max(0) as usize))
    });
    panel.on_sheet_chose({
        let shared = shared.clone();
        move |index, value| sheet_input(&shared, index, sheet::Input::Chose(&value))
    });
    panel.on_sheet_set({
        let shared = shared.clone();
        move |index, item, value| sheet_input(&shared, index, sheet::Input::Set(item.max(0) as usize, value))
    });
    panel.on_sheet_power_pressed({
        let shared = shared.clone();
        move || {
            power::touched();
            let found = with_section(&shared, 0, |plugin, _| plugin.to_string()).zip(
                shared.sheet.lock().unwrap().clone().and_then(|open| {
                    let store = shared.store.lock().unwrap();
                    store.find_tile(&open.plugin, &open.id)?.sheet.as_ref()?.power.as_ref().map(|power| power.action.clone())
                }),
            );
            if let Some((plugin, action)) = found {
                act(&shared, &plugin, &action, None);
            }
        }
    });
    panel.on_room_chosen({
        let shared = shared.clone();
        move |room| {
            power::touched();
            let Some(panel) = shared.panel.upgrade() else { return };
            panel.set_current_room(room);
            render(&panel, &shared);
        }
    });

    // The touch that wakes a dim or blank screen is taken by a cover over everything, so it only
    // wakes it.
    panel.on_woken({
        let shared = shared.clone();
        move || {
            let Some(panel) = shared.panel.upgrade() else { return };
            shared.power.lock().unwrap().wake();
            refresh_power(&panel, &shared);
        }
    });
    let power_timer = Timer::default();
    power_timer.start(TimerMode::Repeated, Duration::from_secs(1), {
        let shared = shared.clone();
        move || {
            if let Some(panel) = shared.panel.upgrade() {
                refresh_power(&panel, &shared);
            }
        }
    });
    refresh_power(&panel, &shared);

    tick(shared.clone());
    thread::spawn({
        let shared = shared.clone();
        move || follow(shared)
    });
    script::start(&panel);
    script::count_frames(&panel);
    panel.run()
}
