//! Exchange trading sessions (hours, holidays, MIS square-off time).

use crate::config::SessionConfig;
use chrono::{DateTime, Datelike, FixedOffset, NaiveDate, NaiveDateTime, NaiveTime, Weekday};
use std::collections::HashSet;

/// India Standard Time (UTC+05:30).
pub const IST: FixedOffset = match FixedOffset::east_opt(5 * 3600 + 30 * 60) {
    Some(offset) => offset,
    None => panic!("valid offset"),
};

/// Parsed [`SessionConfig`].
#[derive(Debug, Clone, PartialEq)]
pub struct Session {
    pub offset: FixedOffset,
    pub open: NaiveTime,
    pub close: NaiveTime,
    pub square_off: Option<NaiveTime>,
    pub holidays: HashSet<NaiveDate>,
    pub trade_weekends: bool,
}

/// Parse a timezone: `Asia/Kolkata` / `IST`, `UTC`, or a fixed offset like `+05:30`.
pub fn parse_offset(tz: &str) -> Result<FixedOffset, String> {
    match tz {
        "Asia/Kolkata" | "Asia/Calcutta" | "IST" => return Ok(IST),
        "UTC" | "Etc/UTC" | "Z" => return Ok(FixedOffset::east_opt(0).expect("zero offset")),
        _ => {}
    }
    let (sign, rest) = match tz.as_bytes().first() {
        Some(b'+') => (1, &tz[1..]),
        Some(b'-') => (-1, &tz[1..]),
        _ => return Err(format!("unsupported timezone {tz:?}")),
    };
    let (hours, minutes) = rest.split_once(':').unwrap_or((rest, "0"));
    let (Ok(hours), Ok(minutes)) = (hours.parse::<i32>(), minutes.parse::<i32>()) else {
        return Err(format!("unsupported timezone {tz:?}"));
    };
    FixedOffset::east_opt(sign * (hours * 3600 + minutes * 60))
        .ok_or_else(|| format!("unsupported timezone {tz:?}"))
}

fn parse_time(field: &str, value: &str) -> Result<NaiveTime, String> {
    NaiveTime::parse_from_str(value, "%H:%M")
        .or_else(|_| NaiveTime::parse_from_str(value, "%H:%M:%S"))
        .map_err(|_| format!("session.{field}: expected HH:MM, got {value:?}"))
}

impl Session {
    pub fn from_config(config: &SessionConfig) -> Result<Self, String> {
        let session = Self {
            offset: parse_offset(&config.tz)?,
            open: parse_time("open", &config.open)?,
            close: parse_time("close", &config.close)?,
            square_off: config
                .mis_square_off
                .as_deref()
                .map(|value| parse_time("mis_square_off", value))
                .transpose()?,
            holidays: config
                .holidays
                .iter()
                .map(|date| {
                    NaiveDate::parse_from_str(date, "%Y-%m-%d")
                        .map_err(|_| format!("session.holidays: expected YYYY-MM-DD, got {date:?}"))
                })
                .collect::<Result<_, _>>()?,
            trade_weekends: config.trade_weekends,
        };
        if session.open >= session.close {
            return Err("session.open must be before session.close".into());
        }
        Ok(session)
    }

    pub fn local(&self, time_ms: i64) -> NaiveDateTime {
        DateTime::from_timestamp_millis(time_ms)
            .unwrap_or_default()
            .with_timezone(&self.offset)
            .naive_local()
    }

    pub fn is_trading_day(&self, date: NaiveDate) -> bool {
        let weekend = matches!(date.weekday(), Weekday::Sat | Weekday::Sun);
        (self.trade_weekends || !weekend) && !self.holidays.contains(&date)
    }

    /// Is the market open at `time_ms`.
    pub fn is_open(&self, time_ms: i64) -> bool {
        let local = self.local(time_ms);
        self.is_trading_day(local.date()) && local.time() >= self.open && local.time() < self.close
    }

    /// Minutes until the close while open.
    pub fn minutes_to_close(&self, time_ms: i64) -> Option<i64> {
        self.is_open(time_ms)
            .then(|| (self.close - self.local(time_ms).time()).num_minutes())
    }

    /// At or after the MIS square-off time on a trading day.
    pub fn past_square_off(&self, time_ms: i64) -> bool {
        let local = self.local(time_ms);
        self.square_off.is_some_and(|square_off| {
            self.is_trading_day(local.date()) && local.time() >= square_off
        })
    }

    /// At or after the close (on the same date).
    pub fn past_close(&self, time_ms: i64) -> bool {
        self.local(time_ms).time() >= self.close
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ms(local: &str) -> i64 {
        NaiveDateTime::parse_from_str(local, "%Y-%m-%d %H:%M")
            .unwrap()
            .and_local_timezone(IST)
            .unwrap()
            .timestamp_millis()
    }

    #[test]
    fn nse_session() {
        let session = Session::from_config(&SessionConfig {
            holidays: vec!["2025-10-21".into()],
            mis_square_off: Some("15:20".into()),
            ..SessionConfig::default()
        })
        .unwrap();
        assert!(session.is_open(ms("2025-10-20 09:15")));
        assert!(!session.is_open(ms("2025-10-20 09:14")));
        assert!(!session.is_open(ms("2025-10-20 15:30")));
        assert!(!session.is_open(ms("2025-10-21 10:00")), "holiday");
        assert!(!session.is_open(ms("2025-10-25 10:00")), "saturday");
        assert_eq!(session.minutes_to_close(ms("2025-10-20 13:25")), Some(125));
        assert!(session.past_square_off(ms("2025-10-20 15:20")));
        assert!(!session.past_square_off(ms("2025-10-20 15:15")));
        assert_eq!(parse_offset("+05:30").unwrap(), IST);
        assert!(parse_offset("Mars/Olympus").is_err());
    }
}
