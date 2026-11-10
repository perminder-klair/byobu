// What byobud has said so far: a snapshot, kept up to date from its updates, and the questions
// the screen asks of it. The same job as shell/src/store.ts.
use crate::clock;
use crate::protocol::{AgendaEvent, KeyedData, Snapshot, Tile, Update, readable_list};

#[derive(Default)]
pub struct Store {
    pub connected: bool,
    pub snapshot: Option<Snapshot>,
}

// A tile and the plugin its actions go back to.
pub struct Placed<'a> {
    pub plugin: &'a str,
    pub tile: &'a Tile,
}

pub struct Room<'a> {
    pub name: String,
    pub tiles: Vec<Placed<'a>>,
}

impl Store {
    pub fn apply(&mut self, update: Update) {
        let Some(snapshot) = &mut self.snapshot else { return };
        match update {
            Update::Plugins { plugins } => snapshot.plugins = plugins,
            Update::Panel { panel } => snapshot.panel = panel,
            Update::Data { plugin, key, id, value } => {
                let data = snapshot.data.entry(plugin).or_default();
                // Something this version can't read is left as it was rather than dropped.
                let _ = apply_data(data, &key, id, value);
            }
            Update::Other => {}
        }
    }

    // Each plugin's data, in the order byobud lists the plugins.
    fn entries(&self) -> impl Iterator<Item = (&str, &KeyedData)> {
        self.snapshot.iter().flat_map(|snapshot| {
            snapshot.plugins.iter().filter_map(|plugin| Some((plugin.id.as_str(), snapshot.data.get(&plugin.id)?)))
        })
    }

    pub fn tiles(&self) -> impl Iterator<Item = Placed<'_>> {
        self.entries().flat_map(|(plugin, data)| data.tiles.values().map(move |tile| Placed { plugin, tile }))
    }

    pub fn find_tile(&self, plugin: &str, id: &str) -> Option<&Tile> {
        self.snapshot.as_ref()?.data.get(plugin)?.tiles.get(id)
    }

    // One room per name, in the order plugins gave them, then whatever isn't in one.
    pub fn rooms(&self) -> Vec<Room<'_>> {
        let mut names: Vec<String> = Vec::new();
        for (_, data) in self.entries() {
            for name in &data.rooms {
                if !names.contains(name) {
                    names.push(name.clone());
                }
            }
        }
        let known = names.len();
        let controls: Vec<Placed> =
            self.tiles().filter(|placed| matches!(placed.tile.kind.as_deref(), None | Some("media"))).collect();
        for placed in &controls {
            if let Some(room) = &placed.tile.room {
                if !names.contains(room) {
                    names.push(room.clone());
                }
            }
        }
        let mut rooms: Vec<Room> = names.into_iter().map(|name| Room { name, tiles: Vec::new() }).collect();
        let mut loose = Room { name: if known > 0 { "Other" } else { "Everything" }.into(), tiles: Vec::new() };
        for placed in controls {
            let room = placed.tile.room.as_ref().and_then(|name| rooms.iter_mut().find(|room| &room.name == name));
            room.unwrap_or(&mut loose).tiles.push(placed);
        }
        rooms.push(loose);
        rooms.retain(|room| !room.tiles.is_empty());
        rooms
    }

    pub fn agenda(&self) -> Vec<&AgendaEvent> {
        let mut events: Vec<&AgendaEvent> = self.entries().flat_map(|(_, data)| &data.agenda).collect();
        // By the moment each starts, as the shell does, since calendars write times with different
        // offsets. Anything unreadable goes last.
        events.sort_by_key(|event| clock::instant(&event.start).map_or((1, 0), |at| (0, at)));
        events
    }

    // Something the screen should say out loud, like a lost connection.
    pub fn problem(&self) -> Option<String> {
        let Some(snapshot) = &self.snapshot else { return Some("Starting…".into()) };
        if !self.connected {
            return Some("Reconnecting to byobud…".into());
        }
        snapshot.plugins.iter().find(|plugin| plugin.enabled && plugin.status.state == "error").and_then(|plugin| plugin.status.message.clone())
    }
}

fn apply_data(data: &mut KeyedData, key: &str, id: Option<String>, value: Option<serde_json::Value>) -> serde_json::Result<()> {
    let value = value.filter(|value| !value.is_null());
    match (key, id) {
        ("tiles", Some(id)) => match value {
            Some(value) => {
                data.tiles.insert(id, serde_json::from_value(value)?);
            }
            // Keeps the others in order, as the shell's object does.
            None => {
                data.tiles.shift_remove(&id);
            }
        },
        ("rooms", None) => data.rooms = value.map(serde_json::from_value).transpose()?.unwrap_or_default(),
        ("agenda", None) => data.agenda = value.map(serde_json::from_value).transpose()?.map(readable_list).unwrap_or_default(),
        _ => {}
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn tile(id: &str, room: Option<&str>, active: bool) -> serde_json::Value {
        json!({ "id": id, "name": id, "icon": "M0 0", "tone": "yellow", "active": active, "detail": "", "room": room })
    }

    fn store() -> Store {
        let snapshot = json!({
            "plugins": [
                { "id": "timers", "enabled": true, "status": { "state": "ok" } },
                { "id": "home", "enabled": true, "status": { "state": "ok" } },
            ],
            "data": {
                "home": {
                    "rooms": ["Kitchen", "Hall"],
                    "tiles": { "light.hall": tile("light.hall", Some("Hall"), false), "light.kitchen": tile("light.kitchen", Some("Kitchen"), true), "scene.away": tile("scene.away", None, false) },
                    "weather": { "condition": "sunny" },
                },
                "timers": { "tiles": { "preset.1": { "id": "preset.1", "name": "1 min", "icon": "", "tone": "accent", "active": false, "detail": "Start", "kind": "timer" } } },
            },
            "panel": { "theme": "", "themeStamp": 0, "brightness": 50 },
            "themes": [],
        });
        Store { connected: true, snapshot: Some(serde_json::from_value(snapshot).unwrap()) }
    }

    fn update(value: serde_json::Value) -> Update {
        serde_json::from_value(value).unwrap()
    }

    #[test]
    fn rooms_follow_the_plugins_order_and_leave_out_other_kinds() {
        let store = store();
        let rooms = store.rooms();
        let names: Vec<&str> = rooms.iter().map(|room| room.name.as_str()).collect();
        assert_eq!(names, ["Kitchen", "Hall", "Other"]);
        assert_eq!(rooms[2].tiles[0].tile.id, "scene.away");
        assert_eq!(rooms[0].tiles[0].plugin, "home");
    }

    #[test]
    fn an_update_changes_one_tile_and_a_missing_value_removes_it() {
        let mut store = store();
        store.apply(update(json!({ "type": "data", "plugin": "home", "key": "tiles", "id": "light.hall", "value": tile("light.hall", Some("Hall"), true) })));
        assert!(store.find_tile("home", "light.hall").unwrap().active);
        store.apply(update(json!({ "type": "data", "plugin": "home", "key": "tiles", "id": "light.hall" })));
        assert!(store.find_tile("home", "light.hall").is_none());
        assert_eq!(store.rooms().iter().map(|room| room.name.as_str()).collect::<Vec<_>>(), ["Kitchen", "Other"]);
    }

    #[test]
    fn updates_it_cannot_draw_are_ignored() {
        let mut store = store();
        store.apply(update(json!({ "type": "show", "face": "clock" })));
        store.apply(update(json!({ "type": "data", "plugin": "home", "key": "weather", "value": { "condition": "rainy" } })));
        store.apply(update(json!({ "type": "data", "plugin": "home", "key": "tiles", "id": "bad", "value": { "id": "bad" } })));
        assert_eq!(store.tiles().count(), 4);
    }

    #[test]
    fn a_bad_tile_or_event_in_the_snapshot_costs_only_itself() {
        let snapshot = json!({
            "plugins": [{ "id": "home", "enabled": true, "status": { "state": "ok" } }],
            "data": { "home": {
                "tiles": { "light.hall": tile("light.hall", Some("Hall"), false), "bad": { "id": "bad", "name": "No detail" } },
                "agenda": [{ "id": "a", "start": "2026-01-02T10:00:00Z", "summary": "Dentist" }, { "id": "b" }],
            } },
            "panel": { "theme": "", "themeStamp": 0 },
        });
        let store = Store { connected: true, snapshot: Some(serde_json::from_value(snapshot).unwrap()) };
        assert_eq!(store.tiles().map(|placed| placed.tile.id.as_str()).collect::<Vec<_>>(), ["light.hall"]);
        assert_eq!(store.agenda().len(), 1);
    }

    #[test]
    fn the_agenda_is_in_time_order_whatever_the_offsets() {
        let mut store = store();
        let events = json!([
            { "id": "a", "start": "2026-11-10T09:30:00+00:00", "summary": "Later" },
            { "id": "b", "start": "2026-11-10T10:00:00+01:00", "summary": "Sooner" },
            { "id": "c", "start": "2026-11-10", "summary": "All day" },
            { "id": "d", "start": "soon", "summary": "Unknown" },
        ]);
        store.apply(update(json!({ "type": "data", "plugin": "home", "key": "agenda", "value": events })));
        let order: Vec<&str> = store.agenda().iter().map(|event| event.summary.as_str()).collect();
        assert_eq!(order, ["All day", "Sooner", "Later", "Unknown"]);
    }

    #[test]
    fn a_new_plugin_can_publish_before_it_is_listed() {
        let mut store = store();
        store.apply(update(json!({ "type": "data", "plugin": "late", "key": "agenda", "value": [{ "id": "a", "start": "2026-01-02T10:00:00Z", "summary": "Dentist" }] })));
        assert!(store.agenda().is_empty());
        store.apply(update(json!({ "type": "plugins", "plugins": [{ "id": "late", "enabled": true, "status": { "state": "error", "message": "No route" } }] })));
        assert_eq!(store.agenda()[0].summary, "Dentist");
        assert_eq!(store.problem().as_deref(), Some("No route"));
    }
}
