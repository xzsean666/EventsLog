use std::collections::BTreeMap;
use std::ops::{Deref, DerefMut};
use serde::{Deserialize, Serialize};

/// Generic key-value attributes/metadata container with deterministic BTreeMap ordering.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Attributes(pub BTreeMap<String, serde_json::Value>);

impl Attributes {
    /// Creates a new empty `Attributes` map.
    pub fn new() -> Self {
        Self(BTreeMap::new())
    }

    /// Sets an attribute key-value pair.
    pub fn insert_val(&mut self, key: impl Into<String>, value: impl Into<serde_json::Value>) {
        self.0.insert(key.into(), value.into());
    }

    /// Gets a reference to the attribute value for a key.
    pub fn get_val(&self, key: &str) -> Option<&serde_json::Value> {
        self.0.get(key)
    }

    /// Returns true if there are no attributes.
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Returns the number of attributes.
    pub fn len(&self) -> usize {
        self.0.len()
    }
}

impl Deref for Attributes {
    type Target = BTreeMap<String, serde_json::Value>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for Attributes {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl From<BTreeMap<String, serde_json::Value>> for Attributes {
    fn from(map: BTreeMap<String, serde_json::Value>) -> Self {
        Self(map)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_attributes_serialization() {
        let mut attrs = Attributes::new();
        attrs.insert_val("env", json!("production"));
        attrs.insert_val("retry_count", json!(3));

        let json = serde_json::to_string(&attrs).expect("serialize attributes");
        let deserialized: Attributes = serde_json::from_str(&json).expect("deserialize attributes");

        assert_eq!(deserialized.get_val("env"), Some(&json!("production")));
        assert_eq!(deserialized.get_val("retry_count"), Some(&json!(3)));
        assert_eq!(deserialized.len(), 2);
    }
}
