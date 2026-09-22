"""Command-line entry points.

The progressive validation pipeline is expressed here as verb ordering
rather than enforced gates — a discipline, not a state machine:

    honba screen       statistical significance of an entry rule (cheap)
    honba backtest     single run, real Indian costs
    honba montecarlo   trade-order shuffle (single-instrument only)
    honba optimize     Optuna walk-forward, purged + embargoed
    honba paper        live data, simulated fills

Each stage costs more than the last, so bad ideas die cheaply. Note that
significance testing is a *diagnostic, not a gate*: a strategy can fail
it and still be profitable, because the edge may live entirely in the
exit/stop structure rather than entry timing.

See ``docs/research/build-vs-extend.md`` §8.
"""
