use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Represents an onboarded application or service project.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Request payload to create a new project.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub description: Option<String>,
}

/// Represents an authentication API key associated with a project.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApiKey {
    pub id: String,
    pub key: String,
    pub project_id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

/// Request payload to create a new API key for a project.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CreateApiKeyRequest {
    pub name: String,
}
