//! Honba Dhan: Dhan HQ API v2 client and OS Keyring credential storage.

use keyring::Entry;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DhanError {
    #[error("Authentication error: {0}")]
    Auth(String),
    #[error("Keyring error: {0}")]
    Keyring(String),
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
}

pub struct DhanVault;

impl DhanVault {
    const SERVICE_NAME: &'static str = "honba-dhanhq";

    /// Stores Dhan HQ access token in OS hardware keyring
    pub fn store_access_token(client_id: &str, token: &str) -> Result<(), DhanError> {
        let entry = Entry::new(Self::SERVICE_NAME, client_id)
            .map_err(|e| DhanError::Keyring(e.to_string()))?;
        entry
            .set_password(token)
            .map_err(|e| DhanError::Keyring(e.to_string()))?;
        Ok(())
    }

    /// Retrieves Dhan HQ access token from OS hardware keyring
    pub fn get_access_token(client_id: &str) -> Result<String, DhanError> {
        let entry = Entry::new(Self::SERVICE_NAME, client_id)
            .map_err(|e| DhanError::Keyring(e.to_string()))?;
        entry
            .get_password()
            .map_err(|e| DhanError::Keyring(e.to_string()))
    }
}

pub struct DhanClient {
    pub client_id: String,
    pub access_token: String,
    pub http: reqwest::Client,
}

impl DhanClient {
    pub fn new(client_id: String, access_token: String) -> Self {
        Self {
            client_id,
            access_token,
            http: reqwest::Client::new(),
        }
    }
}
