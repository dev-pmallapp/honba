//! Exchange trading sessions (hours, holidays, MIS square-off time).

use crate::{config::SessionConfig, data::Bar};
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

    /// Timestamps of the bars at which MIS positions are squared off, per trading date: the
    /// first in-session bar whose interval covers or follows `mis_square_off` (bars are
    /// stamped with their start; the interval is the series' smallest intraday spacing), or,
    /// if no bar of that date gets there (early data end / daily bars), its last in-session
    /// bar.
    pub fn square_off_bars(&self, bars: &[Bar]) -> HashSet<i64> {
        let Some(square_off) = self.square_off else {
            return HashSet::new();
        };
        let in_session = bars
            .iter()
            .filter(|bar| self.is_open(bar.time_ms))
            .map(|bar| (bar.time_ms, self.local(bar.time_ms)))
            .collect::<Vec<_>>();
        let step_ms = in_session
            .windows(2)
            .filter(|pair| pair[0].1.date() == pair[1].1.date())
            .map(|pair| pair[1].0 - pair[0].0)
            .filter(|step| *step > 0)
            .min();

        let mut due = HashSet::new();
        for day in in_session.chunk_by(|a, b| a.1.date() == b.1.date()) {
            let covering = day.iter().find(|(time_ms, local)| {
                local.time() >= square_off
                    || step_ms.is_some_and(|step| {
                        (*local + chrono::TimeDelta::milliseconds(step)).time() > square_off
                            || self.local(time_ms + step).date() != local.date()
                    })
            });
            if let Some((time_ms, _)) = covering.or(day.last()) {
                due.insert(*time_ms);
            }
        }
        due
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

        let bar = |t: &str| Bar::new(ms(t), 1.0, 1.0, 1.0, 1.0, 1.0);
        // 15m bars: the 15:15 bar covers 15:20
        let quarter = ["2025-10-20 15:00", "2025-10-20 15:15", "2025-10-22 09:15"];
        let due = session.square_off_bars(&quarter.map(bar));
        assert_eq!(
            due,
            HashSet::from([ms("2025-10-20 15:15"), ms("2025-10-22 09:15")])
        );
        // Hourly bars: 15:15 covers it; data ending early: last bar of the day
        let hourly = ["2025-10-20 13:15", "2025-10-20 14:15", "2025-10-20 15:15"];
        assert_eq!(
            session.square_off_bars(&hourly.map(bar)),
            HashSet::from([ms("2025-10-20 15:15")])
        );
        let early = ["2025-10-20 10:00", "2025-10-20 10:05"];
        assert_eq!(
            session.square_off_bars(&early.map(bar)),
            HashSet::from([ms("2025-10-20 10:05")])
        );
    }
}
