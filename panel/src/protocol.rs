// The part of byobud's contract this panel draws so far, mirroring byobud/src/protocol.ts by hand.
// Fields it doesn't know are skipped, so byobud can run ahead of it.
use indexmap::IndexMap;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Action {
    pub id: String,
    pub data: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Tile {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub tone: String,
    pub active: bool,
    pub detail: String,
    #[serde(default)]
    pub unavailable: bool,
    pub room: Option<String>,
    pub kind: Option<String>,
    pub tap: Option<Action>,
    // One line for the sheet's title, like "On".
    pub state: Option<String>,
    #[serde(rename = "changedAt")]
    pub changed_at: Option<String>,
    // A sheet this version can't read is left off rather than costing the tile.
    #[serde(default, deserialize_with = "readable")]
    pub sheet: Option<Sheet>,
}

// What a tap with no action of its own, or a long press, opens.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Sheet {
    pub tone: Option<String>,
    // An on/off button by the name, for things whose controls don't already say on or off.
    pub power: Option<Power>,
    // Kinds of section this version doesn't draw are left out.
    #[serde(deserialize_with = "readable_sections")]
    pub sections: Vec<Section>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Power {
    pub on: bool,
    pub action: Action,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Button {
    pub icon: String,
    pub label: String,
    #[serde(default)]
    pub selected: bool,
    pub action: Action,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Choice {
    pub value: String,
    pub label: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Setpoint {
    pub label: String,
    pub value: f64,
    pub min: f64,
    pub max: f64,
    pub step: f64,
    pub action: Action,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Section {
    Slider {
        label: String,
        value: Option<f64>,
        min: f64,
        max: f64,
        step: Option<f64>,
        // How the value reads, like "%". Unset shows no value.
        suffix: Option<String>,
        // Words for particular values, like 0 reading "Off".
        #[serde(default)]
        names: std::collections::HashMap<String, String>,
        // A gradient to pick a point on, instead of a bar that fills up.
        gradient: Option<String>,
        action: Action,
    },
    Choices {
        label: String,
        options: Vec<Choice>,
        value: Option<String>,
        action: Action,
    },
    Buttons {
        buttons: Vec<Button>,
    },
    Setpoints {
        setpoints: Vec<Setpoint>,
        reading: Option<String>,
    },
    Media {
        title: Option<String>,
        by: Option<String>,
        controls: Vec<Button>,
    },
}

fn readable<'de, D: Deserializer<'de>, T: DeserializeOwned>(from: D) -> Result<Option<T>, D::Error> {
    Ok(Option::<Value>::deserialize(from)?.and_then(|value| serde_json::from_value(value).ok()))
}

fn readable_sections<'de, D: Deserializer<'de>>(from: D) -> Result<Vec<Section>, D::Error> {
    Ok(readable_list(Vec::<Value>::deserialize(from)?))
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct AgendaEvent {
    pub id: String,
    pub start: String,
    pub summary: String,
}

// One plugin's data. Lists keyed by id keep the order byobud sent them in.
#[derive(Clone, Debug, Default, Deserialize)]
pub struct KeyedData {
    #[serde(default, deserialize_with = "readable_tiles")]
    pub tiles: IndexMap<String, Tile>,
    #[serde(default)]
    pub rooms: Vec<String>,
    #[serde(default, deserialize_with = "readable_agenda")]
    pub agenda: Vec<AgendaEvent>,
}

// Plugins aren't checked at run time, so one could publish a tile missing a field. Leaving that
// one out keeps a single bad tile from costing the whole snapshot, as updates already do.
fn readable_tiles<'de, D: Deserializer<'de>>(from: D) -> Result<IndexMap<String, Tile>, D::Error> {
    let tiles = IndexMap::<String, Value>::deserialize(from)?;
    Ok(tiles.into_iter().filter_map(|(id, tile)| Some((id, serde_json::from_value(tile).ok()?))).collect())
}

fn readable_agenda<'de, D: Deserializer<'de>>(from: D) -> Result<Vec<AgendaEvent>, D::Error> {
    Ok(readable_list(Vec::<Value>::deserialize(from)?))
}

pub fn readable_list<T: DeserializeOwned>(values: Vec<Value>) -> Vec<T> {
    values.into_iter().filter_map(|value| serde_json::from_value(value).ok()).collect()
}

#[derive(Clone, Debug, Deserialize)]
pub struct PluginStatus {
    pub state: String,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct PluginSummary {
    pub id: String,
    pub enabled: bool,
    pub status: PluginStatus,
}

// Missing fields take byobud's own defaults from settings.ts, which also stand in until byobud
// has answered.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct PanelSettings {
    pub theme: String,
    pub theme_stamp: f64,
    pub brightness: f64,
    // "auto", "on" or "off".
    pub night: String,
    // Minutes without a touch before the screen turns off, or 0 to leave it on.
    pub blank_after: f64,
}

impl Default for PanelSettings {
    fn default() -> Self {
        PanelSettings { theme: String::new(), theme_stamp: 0.0, brightness: 50.0, night: "auto".into(), blank_after: 30.0 }
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct Snapshot {
    pub plugins: Vec<PluginSummary>,
    pub data: IndexMap<String, KeyedData>,
    pub panel: PanelSettings,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Update {
    Data {
        plugin: String,
        key: String,
        id: Option<String>,
        // Left out of the JSON when something is removed.
        value: Option<Value>,
    },
    Plugins {
        plugins: Vec<PluginSummary>,
    },
    Panel {
        panel: PanelSettings,
    },
    // Outputs, clients and show, which nothing here draws yet.
    #[serde(other)]
    Other,
}
