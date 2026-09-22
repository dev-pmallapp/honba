"""Strategy layer — strategy definitions, triggers, risk, execution.

Consolidates the former ``sakata``, ``tenkan``, ``kumo`` and ``dojima``
packages:

    Sakata  (酒田)  strategy engine — Strategy subclasses, the progressive
                   validation pipeline's execution stages
    Tenkan  (転換)  triggers — turns factor scores / ML predictions /
                   regime labels into trade signals
    Kumo     (雲)   risk — position limits, exposure, VaR, circuit breakers
    Dojima  (堂島)  execution & F&O — order routing, expiry handling,
                   physical settlement, margin

Boundary rule
-------------
This is one of only three places permitted to import ``nautilus_trader``
(actual ``Strategy`` subclasses must). Keep that import surface as thin
as possible: v2 renamed ``Actor``->``DataActor`` and
``ExecAlgorithm``->``ExecutionAlgorithm``, moved ``StrategyConfig`` from
a msgspec Struct to a PyO3 type, and removed all ``Importable*ModelConfig``
factories — each rc bump touches this package.

Explicitly out of scope: live order routing to real NSE/BSE accounts.
v2 deleted the public Python networking API (``HttpClient``,
``WebSocketClient``, ``SocketClient``), so a broker adapter is now a Rust
project. Staying research-only is what neutralises that risk.

The SEBI transaction cost model belongs here as a Python ``FeeModel`` —
custom fee and fill models remain Python-subclassable in v2 (custom
margin and latency models do not).

See ``docs/research/build-vs-extend.md`` §6e.
"""
