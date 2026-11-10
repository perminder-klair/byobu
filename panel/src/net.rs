// Talking to byobud: its event stream, the pictures it serves, and actions going back. On the
// panel this is localhost, which byobud answers without pairing.
use crate::protocol::{Snapshot, Update};
use std::error::Error;
use std::io::{BufRead, BufReader, Read};
use std::time::Duration;

const CONNECT: Duration = Duration::from_secs(5);
const ANSWER: Duration = Duration::from_secs(15);
// byobud writes to the event stream at least every 30 seconds, so this long without a word means
// the connection went quietly, like a byobud on another machine dropping off the network.
const SILENCE: Duration = Duration::from_secs(90);
// A theme's wallpaper is the largest thing fetched, and byobud takes at most 4 MB of one.
const MOST_BYTES: u64 = 16 * 1024 * 1024;

pub type Result<T> = std::result::Result<T, Box<dyn Error + Send + Sync>>;

pub enum Event {
    Snapshot(Box<Snapshot>),
    Update(Update),
}

pub struct Api {
    base: String,
    agent: ureq::Agent,
}

impl Api {
    // BYOBU_URL points a panel being developed at a byobud somewhere else.
    pub fn from_env() -> Api {
        let base = std::env::var("BYOBU_URL").unwrap_or_else(|_| "http://127.0.0.1:8080".into());
        Api { base: base.trim_end_matches('/').to_string(), agent: ureq::AgentBuilder::new().timeout_connect(CONNECT).timeout_read(SILENCE).build() }
    }

    pub fn get(&self, path: &str) -> Result<Vec<u8>> {
        let response = self.agent.get(&format!("{}{path}", self.base)).timeout(ANSWER).call()?;
        let mut bytes = Vec::new();
        response.into_reader().take(MOST_BYTES).read_to_end(&mut bytes)?;
        Ok(bytes)
    }

    // byobud only takes JSON, which is what keeps cross-site forms out.
    pub fn send(&self, method: &str, path: &str, body: &serde_json::Value) -> Result<()> {
        let request = self.agent.request(method, &format!("{}{path}", self.base)).timeout(ANSWER);
        request.set("Content-Type", "application/json").send_string(&body.to_string())?;
        Ok(())
    }

    // Follows the event stream until it ends, which it only does when the connection is lost.
    pub fn events(&self, mut on_event: impl FnMut(Event)) -> Result<()> {
        let response = self.agent.get(&format!("{}/api/events", self.base)).call()?;
        let mut parser = Parser::default();
        for line in BufReader::new(response.into_reader()).lines() {
            let Some((name, data)) = parser.line(&line?) else { continue };
            match name.as_str() {
                "snapshot" => on_event(Event::Snapshot(serde_json::from_str(&data)?)),
                // One message this version can't read shouldn't cost the connection.
                _ => match serde_json::from_str(&data) {
                    Ok(update) => on_event(Event::Update(update)),
                    Err(error) => eprintln!("Skipping an update: {error}"),
                },
            }
        }
        Ok(())
    }
}

// Server-sent events: `event:` and `data:` lines, with a blank line ending each message.
#[derive(Default)]
struct Parser {
    name: String,
    data: String,
}

impl Parser {
    fn line(&mut self, line: &str) -> Option<(String, String)> {
        if line.is_empty() {
            let name = std::mem::take(&mut self.name);
            let data = std::mem::take(&mut self.data);
            return (!data.is_empty()).then_some((name, data));
        }
        let (field, value) = line.split_once(':').unwrap_or((line, ""));
        let value = value.strip_prefix(' ').unwrap_or(value);
        match field {
            "event" => self.name = value.to_string(),
            "data" => {
                if !self.data.is_empty() {
                    self.data.push('\n');
                }
                self.data.push_str(value);
            }
            _ => {}
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn messages_end_at_a_blank_line_and_only_some_are_named() {
        let mut parser = Parser::default();
        let lines = ["event: snapshot", "data: {\"a\":1}", "", ": a comment", "data: one", "data: two", "", ""];
        let messages: Vec<_> = lines.iter().filter_map(|line| parser.line(line)).collect();
        assert_eq!(messages, [("snapshot".to_string(), "{\"a\":1}".to_string()), (String::new(), "one\ntwo".to_string())]);
    }
}
