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

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
pub struct PanelSettings {
    #[serde(default)]
    pub theme: String,
    #[serde(default, rename = "themeStamp")]
    pub theme_stamp: f64,
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
