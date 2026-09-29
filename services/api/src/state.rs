use chrono::Utc;
use eventslog_config::ServerConfig;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::models::{ApiKey, Project};

/// Thread-safe in-memory platform store.
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<ServerConfig>,
    pub projects: Arc<RwLock<HashMap<String, Project>>>,
    pub api_keys: Arc<RwLock<HashMap<String, ApiKey>>>,
}

impl AppState {
    /// Creates a new AppState instance.
    pub fn new(config: ServerConfig) -> Self {
        Self {
            config: Arc::new(config),
            projects: Arc::new(RwLock::new(HashMap::new())),
            api_keys: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Registers a new project.
    pub async fn create_project(&self, name: String, description: Option<String>) -> Project {
        let id = format!("prj_{}", Uuid::new_v4().simple());
        let project = Project {
            id: id.clone(),
            name,
            description,
            created_at: Utc::now(),
        };

        let mut lock = self.projects.write().await;
        lock.insert(id, project.clone());
        project
    }

    /// Lists all registered projects.
    pub async fn list_projects(&self) -> Vec<Project> {
        let lock = self.projects.read().await;
        let mut list: Vec<Project> = lock.values().cloned().collect();
        list.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        list
    }

    /// Retrieves project by ID.
    pub async fn get_project(&self, project_id: &str) -> Option<Project> {
        let lock = self.projects.read().await;
        lock.get(project_id).cloned()
    }

    /// Generates a new API key for a project. Returns None if project doesn't exist.
    pub async fn create_api_key(&self, project_id: &str, name: String) -> Option<ApiKey> {
        // Validate project exists
        if self.get_project(project_id).await.is_none() {
            return None;
        }

        let id = format!("key_{}", Uuid::new_v4().simple());
        let secret = format!("el_live_{}", Uuid::new_v4().simple());
        let key = ApiKey {
            id: id.clone(),
            key: secret,
            project_id: project_id.to_string(),
            name,
            created_at: Utc::now(),
        };

        let mut lock = self.api_keys.write().await;
        lock.insert(id, key.clone());
        Some(key)
    }

    /// Lists all API keys for a project.
    pub async fn list_api_keys(&self, project_id: &str) -> Vec<ApiKey> {
        let lock = self.api_keys.read().await;
        let mut list: Vec<ApiKey> = lock
            .values()
            .filter(|k| k.project_id == project_id)
            .cloned()
            .collect();
        list.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        list
    }
}
