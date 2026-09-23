use crate::event::{FillEvent, OrderEvent};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ExecutionError {
    #[error("Order rejected by broker: {0}")]
    BrokerRejected(String),
    #[error("Network connection failure: {0}")]
    Network(String),
    #[error("Liquidity constraint: no match found")]
    NoLiquidity,
}

#[async_trait::async_trait]
pub trait ExecutionEngine: Send + Sync {
    async fn execute_order(&mut self, order: OrderEvent) -> Result<FillEvent, ExecutionError>;
}
