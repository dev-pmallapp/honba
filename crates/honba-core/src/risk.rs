use crate::event::{OrderEvent, Signal};
use crate::position::PortfolioState;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RiskError {
    #[error("Maximum allowable drawdown breached: {0}")]
    DrawdownBreached(String),
    #[error("Insufficient margin for order: required {required}, available {available}")]
    InsufficientMargin { required: String, available: String },
    #[error("Intraday order blocked outside permitted hours: {0}")]
    MarketClosed(String),
}

pub trait RiskGuard: Send + Sync {
    fn evaluate_signal(
        &self,
        signal: &Signal,
        portfolio: &PortfolioState,
    ) -> Result<Option<OrderEvent>, RiskError>;
}
