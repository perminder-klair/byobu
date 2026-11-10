// Byōbu's panel drawn natively with Slint, in place of Chromium showing the shell. It's a client
// of byobud like any other: it follows /api/events, draws what plugins publish and sends taps back
// to the plugin that owns them, so byobud and the plugins don't know which of the two is showing.
mod blocks;
mod clock;
mod net;
mod protocol;
mod script;
mod store;
mod theme;

use chrono::Local;
use net::{Api, Event};
use protocol::PanelSettings;
use slint::{ComponentHandle, Image, Model, ModelRc, Rgba8Pixel, SharedPixelBuffer, SharedString, Timer, VecModel};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Sender, channel};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use store::{Placed, Store};
use theme::{Palette, Rgb};

slint::include_modules!();

const RETRY: Duration = Duration::from_secs(2);
const AGENDA_ON_FACE: usize = 5;
// The Touch Display 2's size. A pushed theme's wallpaper can be far bigger, and every pixel of it
// would sit in memory.
const WALLPAPER: (u32, u32) = (1280, 720);

// What the threads share. Only the event loop's thread touches the screen itself.
struct Shared {
    api: Api,
    store: Mutex<Store>,
    palette: Mutex<Palette>,
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
    let palette = shared.palette.lock().unwrap().clone();
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

// Follows byobud for as long as the panel runs. It sends everything on connecting, so a lost
// connection needs nothing but another try.
fn follow(shared: Arc<Shared>) {
    let mut theme: Option<PanelSettings> = None;
    loop {
        let result = shared.api.events(|event| {
            let mut store = shared.store.lock().unwrap();
            match event {
                Event::Snapshot(snapshot) => store.snapshot = Some(*snapshot),
                Event::Update(update) => store.apply(update),
            }
            store.connected = true;
            let panel = store.snapshot.as_ref().map(|snapshot| snapshot.panel.clone());
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
fn start_actions(shared: Arc<Shared>) -> Sender<(String, serde_json::Value)> {
    let (sender, receiver) = channel::<(String, serde_json::Value)>();
    thread::spawn(move || {
        for (path, body) in receiver {
            if let Err(error) = shared.api.send("POST", &path, &body) {
                eprintln!("POST {path} failed: {error}");
            }
        }
    });
    sender
}

fn main() -> Result<(), slint::PlatformError> {
    let panel = Panel::new()?;
    panel.set_rooms(ModelRc::new(VecModel::<SharedString>::default()));
    panel.set_tiles(ModelRc::new(VecModel::<TileData>::default()));
    panel.set_agenda(ModelRc::new(VecModel::<AgendaRow>::default()));

    let shared = Arc::new(Shared {
        api: Api::from_env(),
        store: Mutex::new(Store::default()),
        palette: Mutex::new(Palette::default()),
        pending: AtomicBool::new(false),
        panel: panel.as_weak(),
    });

    let actions = start_actions(shared.clone());
    panel.on_tile_tapped({
        let shared = shared.clone();
        move |plugin, id| {
            let store = shared.store.lock().unwrap();
            // With no tap of its own a tile opens its sheet, which isn't drawn here yet.
            let Some(action) = store.find_tile(&plugin, &id).and_then(|tile| tile.tap.clone()) else { return };
            let _ = actions.send((format!("/api/plugins/{plugin}/actions/{}", action.id), serde_json::json!({ "data": action.data })));
        }
    });
    panel.on_room_chosen({
        let shared = shared.clone();
        move |room| {
            let Some(panel) = shared.panel.upgrade() else { return };
            panel.set_current_room(room);
            render(&panel, &shared);
        }
    });

    tick(shared.clone());
    thread::spawn({
        let shared = shared.clone();
        move || follow(shared)
    });
    script::start(&panel);
    panel.run()
}
