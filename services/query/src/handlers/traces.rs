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
    pub execution: ExecutionRow,
    pub children: Vec<TraceNode>,
}

/// Full reconstructed trace tree response.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TraceResponse {
    pub trace_id: String,
    pub roots: Vec<TraceNode>,
    pub total_spans: usize,
}

/// Reconstructs a hierarchical tree from a flat list of execution spans.
/// Handles broken or sampled traces by promoting orphaned spans to root nodes.
pub fn build_trace_tree(trace_id: String, spans: Vec<ExecutionRow>) -> TraceResponse {
    let total_spans = spans.len();
    if spans.is_empty() {
        return TraceResponse {
            trace_id,
            roots: Vec::new(),
            total_spans: 0,
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

        // If parent is empty, or parent does not exist in known spans (sampled out), treat as root
        if parent_id.is_empty() || !known_spans.contains(&parent_id) {
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

        Some(TraceNode { execution, children })
    }

    let mut roots = Vec::new();
    for root_id in root_ids {
        if let Some(root_node) = assemble_node(&root_id, &mut span_lookup, &children_map) {
            roots.push(root_node);
        }
    }

    // Sort roots chronologically
    roots.sort_by(|a, b| a.execution.timestamp.cmp(&b.execution.timestamp));

    TraceResponse {
        trace_id,
        roots,
        total_spans,
    }
}

/// Handler for `GET /v1/traces/{trace_id}`.
pub async fn get_trace(
    State(state): State<AppState>,
    Path(trace_id): Path<String>,
) -> Result<Json<TraceResponse>, ApiError> {
    let spans = state
        .storage
        .query_trace(&trace_id)
        .await
        .map_err(|e| ApiError::Internal(format!("Failed to query trace: {e}")))?;

    if spans.is_empty() {
        return Err(ApiError::NotFound(format!("Trace '{trace_id}' not found")));
    }

    let response = build_trace_tree(trace_id, spans);
    Ok(Json(response))
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
}
