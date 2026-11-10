// The time as the screen words it, lower case on a 24-hour clock like the shell. This follows the
// panel's own time zone and English names for now, where the shell asks a plugin for both.
use chrono::{DateTime, Local, NaiveDate, TimeZone};

pub fn time<Tz: TimeZone>(now: &DateTime<Tz>) -> String {
    now.naive_local().format("%H:%M").to_string()
}

// "tuesday 10 november"
pub fn date<Tz: TimeZone>(now: &DateTime<Tz>) -> String {
    now.naive_local().format("%A %-d %B").to_string().to_lowercase()
}

pub fn weekday<Tz: TimeZone>(now: &DateTime<Tz>) -> String {
    now.naive_local().format("%A").to_string().to_lowercase()
}

// "18:30" for today, otherwise "fri 18:30". All-day events only have a date.
pub fn event_time<Tz: TimeZone>(start: &str, now: &DateTime<Tz>) -> String {
    let today = now.naive_local().date();
    let short = |day: NaiveDate| day.format("%a").to_string().to_lowercase();
    if let Ok(day) = NaiveDate::parse_from_str(start, "%Y-%m-%d") {
        return if day == today { "today".into() } else { short(day) };
    }
    let Ok(when) = DateTime::parse_from_rfc3339(start) else { return String::new() };
    let when = when.with_timezone(&now.timezone()).naive_local();
    let time = when.format("%H:%M").to_string();
    if when.date() == today { time } else { format!("{} {time}", short(when.date())) }
}

// When an event starts, as milliseconds since 1970. A date alone is midnight UTC, which is how
// the shell's Date.parse reads one.
pub fn instant(start: &str) -> Option<i64> {
    if let Ok(day) = NaiveDate::parse_from_str(start, "%Y-%m-%d") {
        return Some(day.and_hms_opt(0, 0, 0)?.and_utc().timestamp_millis());
    }
    DateTime::parse_from_rfc3339(start).ok().map(|when| when.timestamp_millis())
}

pub fn millis_to_next_minute(now: &DateTime<Local>) -> u64 {
    60_000 - now.timestamp_millis().rem_euclid(60_000) as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::FixedOffset;

    fn now() -> DateTime<FixedOffset> {
        // A Tuesday, an hour ahead of UTC.
        DateTime::parse_from_rfc3339("2026-11-10T17:05:30+01:00").unwrap()
    }

    #[test]
    fn words_the_time_like_the_shell() {
        assert_eq!(time(&now()), "17:05");
        assert_eq!(date(&now()), "tuesday 10 november");
        assert_eq!(weekday(&now()), "tuesday");
    }

    #[test]
    fn events_today_have_no_weekday() {
        assert_eq!(event_time("2026-11-10T19:30:00Z", &now()), "20:30");
        assert_eq!(event_time("2026-11-13T18:30:00+01:00", &now()), "fri 18:30");
        // Late in the evening somewhere else is already tomorrow here.
        assert_eq!(event_time("2026-11-10T23:30:00Z", &now()), "wed 00:30");
    }

    #[test]
    fn all_day_events_only_have_a_day() {
        assert_eq!(event_time("2026-11-10", &now()), "today");
        assert_eq!(event_time("2026-11-14", &now()), "sat");
        assert_eq!(event_time("soon", &now()), "");
    }
}
