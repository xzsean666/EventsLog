use axum::extract::{Path, State};
use axum::Json;
use eventslog_common::ApiError;
use eventslog_schema::ExecutionRow;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use crate::router::AppState;

/// Node in an execution trace hierarchy tree.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TraceNode {
    pub span_id: String,
    #[serde(default)]
    pub parent_span_id: String,
    pub service_name: String,
    #[serde(default)]
    pub module: String,
    #[serde(default)]
    pub class_name: String,
    pub function_name: String,
    pub status: String,
    pub duration_ms: f64,
    pub timestamp: String,
    pub execution: ExecutionRow,
    pub children: Vec<TraceNode>,
}

/// Full reconstructed trace tree response.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TraceResponse {
    pub trace_id: String,
    pub roots: Vec<TraceNode>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub root_spans: Vec<TraceNode>,
    pub total_spans: usize,
    #[serde(default)]
    pub total_duration_ms: f64,
}

/// Wrapper providing both nested `{ trace: ... }` and flat trace fields for client compatibility.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TraceEnvelope {
    pub trace: TraceResponse,
    #[serde(flatten)]
    pub direct: TraceResponse,
}

/// Reconstructs a hierarchical tree from a flat list of execution spans.
/// Handles broken, cyclic or sampled traces by promoting orphaned spans to root nodes.
pub fn build_trace_tree(trace_id: String, spans: Vec<ExecutionRow>) -> TraceResponse {
    let total_spans = spans.len();
    if spans.is_empty() {
        return TraceResponse {
            trace_id,
            roots: Vec::new(),
            root_spans: Vec::new(),
            total_spans: 0,
            total_duration_ms: 0.0,
        };
    }

    // Index all spans by span_id
    let known_spans: HashSet<String> = spans.iter().map(|s| s.span_id.clone()).collect();

    // Map parent_span_id -> Vec<child_span_id>
    let mut children_map: HashMap<String, Vec<String>> = HashMap::new();
    let mut span_lookup: HashMap<String, ExecutionRow> = HashMap::new();
    let mut root_ids = Vec::new();

    for span in spans {
        let span_id = span.span_id.clone();
        let parent_id = span.parent_span_id.clone();

        // If parent is empty, self-referential, or sampled out, treat as root
        if parent_id.is_empty() || parent_id == span_id || !known_spans.contains(&parent_id) {
            root_ids.push(span_id.clone());
        } else {
            children_map
                .entry(parent_id)
                .or_default()
                .push(span_id.clone());
        }

        span_lookup.insert(span_id, span);
    }

    // Helper to recursively assemble TraceNode
    fn assemble_node(
        span_id: &str,
        span_lookup: &mut HashMap<String, ExecutionRow>,
        children_map: &HashMap<String, Vec<String>>,
    ) -> Option<TraceNode> {
        let execution = span_lookup.remove(span_id)?;
        let child_ids = children_map.get(span_id).cloned().unwrap_or_default();

        let mut children = Vec::new();
        for child_id in child_ids {
            if let Some(child_node) = assemble_node(&child_id, span_lookup, children_map) {
                children.push(child_node);
            }
        }

        // Sort children chronologically by timestamp
        children.sort_by(|a, b| a.execution.timestamp.cmp(&b.execution.timestamp));

        Some(TraceNode {
            span_id: execution.span_id.clone(),
            parent_span_id: execution.parent_span_id.clone(),
            service_name: execution.service_name.clone(),
            module: execution.module_name.clone(),
            class_name: execution.class_name.clone(),
            function_name: execution.function_name.clone(),
            status: execution.status.clone(),
            duration_ms: execution.duration_ms,
            timestamp: execution.timestamp.to_rfc3339(),
            execution,
            children,
        })
    }

    let mut roots = Vec::new();
    for root_id in root_ids {
        if let Some(root_node) = assemble_node(&root_id, &mut span_lookup, &children_map) {
            roots.push(root_node);
        }
    }

    // Promote any remaining orphaned or cyclic spans into roots to prevent data loss
    let remaining_ids: Vec<String> = span_lookup.keys().cloned().collect();
    for rem_id in remaining_ids {
        if let Some(rem_node) = assemble_node(&rem_id, &mut span_lookup, &children_map) {
            roots.push(rem_node);
        }
    }

    // Sort roots chronologically
    roots.sort_by(|a, b| a.execution.timestamp.cmp(&b.execution.timestamp));

    let total_duration_ms = roots
        .iter()
        .map(|r| r.duration_ms)
        .fold(0.0_f64, f64::max);

    let root_spans = Vec::new();

    TraceResponse {
        trace_id,
        roots,
        root_spans,
        total_spans,
        total_duration_ms,
    }
}

/// Handler for `GET /v1/traces/{trace_id}`.
pub async fn get_trace(
    State(state): State<AppState>,
    _auth: crate::auth::AuthContext,
    Path(trace_id): Path<String>,
) -> Result<Json<TraceEnvelope>, ApiError> {
    let spans = state
        .storage
        .query_trace(&trace_id)
        .await
        .map_err(|e| ApiError::Internal(format!("Failed to query trace: {e}")))?;

    if spans.is_empty() {
        return Err(ApiError::NotFound(format!("Trace '{trace_id}' not found")));
    }

    let response = build_trace_tree(trace_id, spans);
    Ok(Json(TraceEnvelope {
        trace: response.clone(),
        direct: response,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn sample_span(span_id: &str, parent_id: &str, func: &str) -> ExecutionRow {
        ExecutionRow {
            event_id: span_id.to_string(),
            trace_id: "trace_1".to_string(),
            span_id: span_id.to_string(),
            parent_span_id: parent_id.to_string(),
            service_name: "test".to_string(),
            environment: "dev".to_string(),
            module_name: "mod".to_string(),
            class_name: "".to_string(),
            function_name: func.to_string(),
            file_path: "".to_string(),
            line_number: 0,
            input_json: "".to_string(),
            output_json: "".to_string(),
            duration_ms: 10.0,
            duration_nanos: 10_000_000,
            status: "success".to_string(),
            error_type: "".to_string(),
            error_message: "".to_string(),
            error_stack: "".to_string(),
            attributes_json: "".to_string(),
            timestamp: Utc::now(),
        }
    }

    #[test]
    fn test_build_trace_tree_hierarchy() {
        let root = sample_span("s1", "", "main");
        let child1 = sample_span("s2", "s1", "sub1");
        let child2 = sample_span("s3", "s1", "sub2");
        let grandchild = sample_span("s4", "s2", "sub1_sub");

        let spans = vec![root, child1, child2, grandchild];
        let tree = build_trace_tree("trace_1".to_string(), spans);

        assert_eq!(tree.total_spans, 4);
        assert_eq!(tree.roots.len(), 1);
        assert_eq!(tree.roots[0].execution.function_name, "main");
        assert_eq!(tree.roots[0].children.len(), 2);

        // s2 has child s4
        let s2_node = tree.roots[0]
            .children
            .iter()
            .find(|c| c.execution.span_id == "s2")
            .unwrap();
        assert_eq!(s2_node.children.len(), 1);
        assert_eq!(s2_node.children[0].execution.span_id, "s4");
    }

    #[test]
    fn test_orphan_span_promoted_to_root() {
        // Parent s99 does not exist in the spans slice
        let orphan = sample_span("s10", "s99", "independent_sub");
        let spans = vec![orphan];

        let tree = build_trace_tree("trace_orphan".to_string(), spans);
        assert_eq!(tree.roots.len(), 1);
        assert_eq!(tree.roots[0].execution.span_id, "s10");
    }

    #[test]
    fn test_cyclic_parent_spans_promoted_to_roots() {
        // s1 points to s2, and s2 points to s1 (cycle)
        let span1 = sample_span("s1", "s2", "func1");
        let span2 = sample_span("s2", "s1", "func2");
        let spans = vec![span1, span2];

        let tree = build_trace_tree("trace_cycle".to_string(), spans);
        assert_eq!(tree.total_spans, 2);
        // Cycle is broken safely: 1 root with 1 child, preserving both spans without infinite loop
        assert_eq!(tree.roots.len(), 1);
        assert_eq!(tree.roots[0].children.len(), 1);
    }
}
