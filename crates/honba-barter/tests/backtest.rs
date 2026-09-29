use honba_barter::{
    run_backtest, run_sweep, Action, ActionSide, BacktestConfig, BacktestError, Bar, BarContext,
    Decider, DeciderError, Product,
};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

const DAY_MS: i64 = 86_400_000;
const START_MS: i64 = 1_704_067_200_000; // 2024-01-01T00:00:00Z

/// Deterministic oscillating daily closes with an upward drift.
fn synthetic_bars(num: usize, phase: f64) -> Vec<Bar> {
    (0..num)
        .map(|i| {
            let x = i as f64;
            let close = 100.0 + 0.05 * x + 10.0 * (x / 8.0 + phase).sin();
            Bar::new(
                START_MS + i as i64 * DAY_MS,
                close - 0.5,
                close + 1.0,
                close - 1.0,
                close,
                1_000.0 + x,
            )
        })
        .collect()
}

fn config(symbols: &[&str]) -> BacktestConfig {
    BacktestConfig {
        symbols: symbols.iter().map(|s| s.to_string()).collect(),
        initial_cash: 100_000.0,
        fees_percent: 0.1,
        ..BacktestConfig::default()
    }
}

fn sma(bars: &[Bar], period: usize) -> Option<f64> {
    (bars.len() >= period).then(|| {
        bars[bars.len() - period..]
            .iter()
            .map(|b| b.close)
            .sum::<f64>()
            / period as f64
    })
}

/// Long-only SMA crossover on every symbol.
struct SmaCross {
    fast: usize,
    slow: usize,
    qty: f64,
}

impl Decider for SmaCross {
    fn on_bar(&self, ctx: &BarContext<'_>) -> Result<Vec<Action>, DeciderError> {
        let mut actions = Vec::new();
        for (symbol, history) in &ctx.history {
            let (Some(fast), Some(slow)) = (sma(history, self.fast), sma(history, self.slow))
            else {
                continue;
            };
            let position = ctx.qty(symbol);
            if fast > slow && position == 0.0 {
                actions.push(Action::buy(symbol.clone(), self.qty));
            } else if fast < slow && position > 0.0 {
                actions.push(Action::sell(symbol.clone(), position));
            }
        }
        Ok(actions)
    }
}

fn sma_cross(fast: usize, slow: usize) -> Arc<dyn Decider> {
    Arc::new(SmaCross {
        fast,
        slow,
        qty: 100.0,
    })
}

#[test]
fn sma_cross_single_symbol() {
    let bars = synthetic_bars(250, 0.0);
    let candles = BTreeMap::from([("RELIANCE".to_string(), bars.clone())]);

    let report = run_backtest(config(&["RELIANCE"]), candles, sma_cross(5, 20)).unwrap();

    assert_eq!(report.num_bars, 250);
    assert_eq!(report.bars_decided, 250);
    assert_eq!(report.equity_curve.len(), 250);
    assert!(report.trades.len() >= 4, "trades: {}", report.trades.len());
    assert!(report.rejected.is_empty(), "{:?}", report.rejected);

    // Long-only crossover alternates buy / sell, each filled at the decision bar's close with fees
    for (i, trade) in report.trades.iter().enumerate() {
        let expected_side = if i % 2 == 0 {
            ActionSide::Buy
        } else {
            ActionSide::Sell
        };
        assert_eq!(trade.side, expected_side);
        assert_eq!(trade.qty, 100.0);
        let bar = bars.iter().find(|b| b.time_ms == trade.time_ms).unwrap();
        assert!((trade.price - bar.close).abs() < 1e-9);
        assert!((trade.fees - trade.value * 0.001).abs() < 1e-6);
    }

    // Ledger consistency: equity = cash + position * last close
    let position = report.final_positions["RELIANCE"];
    let last_close = bars.last().unwrap().close;
    let summary = &report.summary;
    assert!((summary.final_equity - (summary.final_cash + position * last_close)).abs() < 1e-6);
    let fees = report.trades.iter().map(|t| t.fees).sum::<f64>();
    assert!((summary.total_fees - fees).abs() < 1e-6);
    assert_eq!(summary.num_trades, report.trades.len());
    assert!(summary.max_drawdown >= 0.0);
    assert!(summary.sharpe.is_some());

    // barter tear sheet realised PnL matches honba's closed-trade PnL net of fees
    let instrument = &report.instruments["RELIANCE"];
    assert_eq!(instrument.num_trades, report.trades.len());
    assert_eq!(instrument.final_position, position);
    assert!(instrument.pnl != 0.0);

    // Report serialises with the documented top-level keys
    let json: serde_json::Value = serde_json::from_str(&report.to_json().unwrap()).unwrap();
    for key in [
        "id",
        "config",
        "summary",
        "instruments",
        "trades",
        "rejected",
        "equity_curve",
        "final_positions",
    ] {
        assert!(json.get(key).is_some(), "missing key {key}");
    }
    assert_eq!(json["trades"][0]["side"], "buy");
    assert!(json["equity_curve"][0].as_array().unwrap().len() == 2);
}

#[test]
fn buy_and_hold_accounting() {
    let bars = synthetic_bars(30, 1.0);
    let candles = BTreeMap::from([("TCS".to_string(), bars.clone())]);
    let decider: Arc<dyn Decider> = Arc::new(|ctx: &BarContext<'_>| {
        Ok(if ctx.qty("TCS") == 0.0 {
            vec![Action::buy("TCS", 10.0)]
        } else {
            vec![]
        })
    });

    let report = run_backtest(config(&["TCS"]), candles, decider).unwrap();

    assert_eq!(report.trades.len(), 1);
    let entry = bars[0].close;
    let cost = 10.0 * entry * 1.001;
    let expected_equity = 100_000.0 - cost + 10.0 * bars.last().unwrap().close;
    assert!((report.summary.final_cash - (100_000.0 - cost)).abs() < 1e-6);
    assert!((report.summary.final_equity - expected_equity).abs() < 1e-6);
    assert_eq!(report.final_positions["TCS"], 10.0);
    assert_eq!(
        report.equity_curve.last().unwrap().0,
        bars.last().unwrap().time_ms
    );
}

#[test]
fn positions_and_cash_visible_on_next_bar() {
    let bars = synthetic_bars(5, 0.0);
    let candles = BTreeMap::from([("INFY".to_string(), bars)]);
    let seen = Arc::new(Mutex::new(Vec::new()));
    let seen_decider = Arc::clone(&seen);
    let decider: Arc<dyn Decider> = Arc::new(move |ctx: &BarContext<'_>| {
        seen_decider
            .lock()
            .unwrap()
            .push((ctx.time_ms, ctx.qty("INFY"), ctx.cash));
        Ok(vec![Action::buy("INFY", 1.0)])
    });

    let mut cfg = config(&["INFY"]);
    cfg.latency_ms = 250;
    let report = run_backtest(cfg, candles, decider).unwrap();

    let seen = seen.lock().unwrap();
    assert_eq!(seen.len(), 5);
    for (i, (time_ms, position, cash)) in seen.iter().enumerate() {
        assert_eq!(*time_ms, START_MS + i as i64 * DAY_MS);
        assert_eq!(
            *position, i as f64,
            "fills from bar {i} must be visible on the next bar"
        );
        assert!(*cash <= 100_000.0);
    }
    assert_eq!(report.trades.len(), 5);
}

#[test]
fn insufficient_cash_and_position_are_rejected() {
    let bars = synthetic_bars(3, 0.0);
    let candles = BTreeMap::from([("SBIN".to_string(), bars)]);
    let decider: Arc<dyn Decider> = Arc::new(|_: &BarContext<'_>| {
        Ok(vec![
            Action::buy("SBIN", 1_000_000.0),
            Action::sell("SBIN", 5.0),
            Action::buy("UNKNOWN", 1.0),
            Action::buy("SBIN", -1.0),
        ])
    });

    let report = run_backtest(config(&["SBIN"]), candles, decider).unwrap();

    assert!(report.trades.is_empty());
    let reasons = report
        .rejected
        .iter()
        .map(|r| r.reason.as_str())
        .collect::<Vec<_>>();
    assert_eq!(reasons.len(), 12);
    for reason in [
        "insufficient_cash",
        "insufficient_position",
        "unknown_symbol",
        "invalid_qty",
    ] {
        assert!(reasons.contains(&reason), "missing {reason}");
    }
}

#[test]
fn shorting_when_allowed() {
    let bars = synthetic_bars(4, 0.0);
    let candles = BTreeMap::from([("HDFC".to_string(), bars)]);
    let decider: Arc<dyn Decider> = Arc::new(|ctx: &BarContext<'_>| {
        Ok(if ctx.qty("HDFC") == 0.0 {
            vec![Action::sell("HDFC", 3.0)]
        } else {
            vec![]
        })
    });
    let mut cfg = config(&["HDFC"]);
    cfg.allow_short = true;

    let report = run_backtest(cfg, candles, decider).unwrap();
    assert_eq!(report.final_positions["HDFC"], -3.0);
    assert_eq!(report.trades.len(), 1);
}

#[test]
fn multi_symbol_with_missing_bars() {
    let a = synthetic_bars(60, 0.0);
    // B misses every third bar
    let b = synthetic_bars(60, 2.0)
        .into_iter()
        .enumerate()
        .filter(|(i, _)| i % 3 != 0)
        .map(|(_, bar)| bar)
        .collect::<Vec<_>>();
    let candles = BTreeMap::from([("AAA".to_string(), a), ("BBB".to_string(), b)]);

    let calls = Arc::new(Mutex::new(Vec::new()));
    let inner = sma_cross(3, 10);
    let calls_decider = Arc::clone(&calls);
    let decider: Arc<dyn Decider> = Arc::new(move |ctx: &BarContext<'_>| {
        calls_decider
            .lock()
            .unwrap()
            .push((ctx.time_ms, ctx.candles.len()));
        inner.on_bar(ctx)
    });

    // Empty symbols => every symbol with candles
    let mut cfg = config(&[]);
    cfg.symbols.clear();
    let report = run_backtest(cfg, candles, decider).unwrap();

    assert_eq!(report.num_bars, 60);
    assert_eq!(report.bars_decided, 60);
    let calls = calls.lock().unwrap();
    assert_eq!(calls.len(), 60);
    assert_eq!(calls[0].1, 1, "only AAA has a bar at t0");
    assert_eq!(calls[1].1, 2);
    assert!(report.trades.iter().any(|t| t.symbol == "AAA"));
    assert!(report.trades.iter().any(|t| t.symbol == "BBB"));
    assert_eq!(report.instruments.len(), 2);
}

#[test]
fn decider_error_aborts() {
    let candles = BTreeMap::from([("ITC".to_string(), synthetic_bars(50, 0.0))]);
    let decider: Arc<dyn Decider> = Arc::new(|ctx: &BarContext<'_>| {
        if ctx.time_ms >= START_MS + 10 * DAY_MS {
            Err(DeciderError("boom".into()))
        } else {
            Ok(vec![])
        }
    });

    match run_backtest(config(&["ITC"]), candles, decider) {
        Err(BacktestError::Decider(message)) => assert_eq!(message, "boom"),
        other => panic!("expected decider error, got {other:?}"),
    }
}

#[test]
fn invalid_inputs() {
    let candles = BTreeMap::from([("ITC".to_string(), synthetic_bars(5, 0.0))]);
    let decider = sma_cross(2, 3);

    let missing = run_backtest(config(&["NOPE"]), candles.clone(), Arc::clone(&decider));
    assert!(matches!(missing, Err(BacktestError::Data(_))));

    let mut cfg = config(&["ITC"]);
    cfg.latency_ms = 5_000;
    assert!(matches!(
        run_backtest(cfg, candles, decider),
        Err(BacktestError::Config(_))
    ));
}

#[test]
fn latency_does_not_change_results() {
    let candles = BTreeMap::from([("LT".to_string(), synthetic_bars(120, 0.5))]);
    let fast = run_backtest(config(&["LT"]), candles.clone(), sma_cross(5, 20)).unwrap();

    let mut cfg = config(&["LT"]);
    cfg.latency_ms = 400;
    let started = std::time::Instant::now();
    let slow = run_backtest(cfg, candles, sma_cross(5, 20)).unwrap();

    // Virtual time: 400ms latency per order must not cost wall-clock time
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
    assert_eq!(fast.trades, slow.trades);
    assert_eq!(fast.equity_curve, slow.equity_curve);
}

#[test]
fn sweep_runs_each_parameter_set() {
    let candles = BTreeMap::from([("RELIANCE".to_string(), synthetic_bars(200, 0.0))]);
    let params = [(3, 10), (5, 20), (10, 40)];
    let deciders = params
        .iter()
        .map(|&(fast, slow)| (format!("{fast}-{slow}"), sma_cross(fast, slow)))
        .collect();

    let reports = run_sweep(config(&["RELIANCE"]), candles.clone(), deciders).unwrap();

    assert_eq!(reports.len(), 3);
    for (report, (fast, slow)) in reports.iter().zip(params) {
        assert_eq!(report.id, format!("{fast}-{slow}"));
        // Concurrent runs match an isolated run with the same parameters
        let single = run_backtest(
            config(&["RELIANCE"]),
            candles.clone(),
            sma_cross(fast, slow),
        )
        .unwrap();
        assert_eq!(report.trades, single.trades);
        assert_eq!(report.summary, single.summary);
    }
}

#[test]
fn position_details_and_equity_in_context() {
    let bars = synthetic_bars(4, 0.0);
    let candles = BTreeMap::from([("SBIN".to_string(), bars.clone())]);
    let seen = Arc::new(Mutex::new(Vec::new()));
    let seen_decider = Arc::clone(&seen);
    let decider: Arc<dyn Decider> = Arc::new(move |ctx: &BarContext<'_>| {
        seen_decider.lock().unwrap().push((
            ctx.positions["SBIN"],
            ctx.cash,
            ctx.equity,
            serde_json::from_str::<serde_json::Value>(&ctx.to_json().unwrap()).unwrap(),
        ));
        Ok(match ctx.time_ms {
            t if t == START_MS => vec![Action::buy("SBIN", 10.0)],
            t if t == START_MS + DAY_MS => vec![Action::buy("SBIN", 10.0)],
            t if t == START_MS + 2 * DAY_MS => vec![Action::sell("SBIN", 5.0)],
            _ => vec![],
        })
    });

    run_backtest(config(&["SBIN"]), candles, decider).unwrap();

    let seen = seen.lock().unwrap();
    let (c0, c1, c2, c3) = (bars[0].close, bars[1].close, bars[2].close, bars[3].close);
    let avg = (c0 + c1) / 2.0;

    let (flat, cash0, equity0, json0) = &seen[0];
    assert_eq!(flat.qty, 0.0);
    assert_eq!(flat.product, None);
    assert_eq!((*cash0, *equity0), (100_000.0, 100_000.0));
    assert_eq!(json0["positions"]["SBIN"]["qty"], 0.0);
    assert!(json0["positions"]["SBIN"]["product"].is_null());
    assert!(json0["candles"]["SBIN"]["close"].is_number());
    for key in [
        "time_ms",
        "cash",
        "equity",
        "open_orders",
        "events",
        "session",
        "warmup",
    ] {
        assert!(json0.get(key).is_some(), "missing ctx key {key}");
    }

    let (p1, _, _, json1) = &seen[1];
    assert_eq!(p1.qty, 10.0);
    assert_eq!(p1.avg_price, c0);
    assert_eq!(p1.product, Some(Product::CNC));
    assert!((p1.unrealised_pnl - 10.0 * (c1 - c0)).abs() < 1e-9);
    assert_eq!(json1["positions"]["SBIN"]["product"], "CNC");
    assert_eq!(json1["events"][0]["type"], "fill");
    assert_eq!(json1["events"][0]["reason"], "signal");

    let (p3, cash3, equity3, _) = &seen[3];
    assert_eq!(p3.qty, 15.0);
    assert!((p3.avg_price - avg).abs() < 1e-9);
    assert!((p3.realised_pnl - 5.0 * (c2 - avg)).abs() < 1e-9);
    assert!((p3.unrealised_pnl - 15.0 * (c3 - avg)).abs() < 1e-9);
    assert!((p3.pnl - (p3.realised_pnl + p3.unrealised_pnl)).abs() < 1e-9);
    assert!((equity3 - (cash3 + 15.0 * c3)).abs() < 1e-6);
}
