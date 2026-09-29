import React from 'react';
import type { TraceTree, TraceNode, ExecutionRecord } from '../api/types.js';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

interface TraceTreeViewProps {
  trace: TraceTree;
  onSelectSpan?: (execution: ExecutionRecord) => void;
}

export const TraceTreeView: React.FC<TraceTreeViewProps> = ({ trace, onSelectSpan }) => {
  const totalDuration = Math.max(1, trace.total_duration_ms);

  const renderNode = (node: TraceNode, depth: number) => {
    const isSuccess = node.status === 'success';
    const percentWidth = Math.max(4, Math.min(100, (node.duration_ms / totalDuration) * 100));

    const handleNodeClick = () => {
      if (onSelectSpan) {
        onSelectSpan({
          execution_id: node.span_id,
          trace_id: trace.trace_id,
          span_id: node.span_id,
          parent_span_id: node.parent_span_id,
          service_name: node.service_name,
          environment: 'production',
          module: node.module,
          class_name: node.class_name,
          function_name: node.function_name,
          status: isSuccess ? 'success' : 'error',
          duration_ms: node.duration_ms,
          timestamp: node.timestamp,
        });
      }
    };

    return (
      <div key={node.span_id} className="space-y-1">
        <div
          onClick={handleNodeClick}
          className="p-3 bg-slate-900 hover:bg-slate-800/60 border border-slate-800 rounded-xl transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono"
          style={{ marginLeft: `${depth * 24}px` }}
        >
          {/* Identity & Status */}
          <div className="flex items-center gap-2.5 min-w-0">
            {isSuccess ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-bold text-white truncate">
              {node.class_name ? `${node.class_name}.${node.function_name}` : node.function_name}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] shrink-0 font-sans">
              {node.service_name}
            </span>
          </div>

          {/* Waterfall Bar & Duration */}
          <div className="flex items-center gap-3 w-full md:w-64 shrink-0">
            <div className="flex-1 bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800/80">
              <div
                className={`h-full rounded-full ${
                  isSuccess ? 'bg-indigo-500' : 'bg-rose-500'
                }`}
                style={{ width: `${percentWidth}%` }}
              />
            </div>
            <span className="text-slate-300 w-16 text-right shrink-0">
              {node.duration_ms.toFixed(1)} ms
            </span>
          </div>
        </div>

        {/* Render child spans recursively */}
        {node.children && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5 shadow-sm">
      {/* Trace Summary Banner */}
      <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Distributed Trace
          </span>
          <h3 className="font-mono text-sm text-indigo-400 font-bold truncate max-w-xl">
            {trace.trace_id}
          </h3>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Spans:</span>
            <span className="font-bold text-white">{trace.total_spans}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-bold text-white">{trace.total_duration_ms.toFixed(1)} ms</span>
          </div>
        </div>
      </div>

      {/* Waterfall Spans */}
      <div className="space-y-2">
        {trace.root_spans.map((root) => renderNode(root, 0))}
      </div>
    </div>
  );
};
