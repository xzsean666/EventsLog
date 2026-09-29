import React from 'react';
import type { ExecutionRecord } from '../api/types.js';
import { X, CheckCircle2, XCircle, Clock, ExternalLink } from 'lucide-react';

interface ExecutionDetailModalProps {
  execution: ExecutionRecord | null;
  onClose: () => void;
  onViewTrace?: (traceId: string) => void;
}

export const ExecutionDetailModal: React.FC<ExecutionDetailModalProps> = ({
  execution,
  onClose,
  onViewTrace,
}) => {
  if (!execution) return null;

  const isSuccess = execution.status === 'success';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            {isSuccess ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white font-mono">
                  {execution.class_name
                    ? `${execution.class_name}.${execution.function_name}`
                    : execution.function_name}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    isSuccess
                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                      : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                  }`}
                >
                  {execution.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{execution.execution_id}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metadata summary bar */}
        <div className="px-5 py-3 bg-slate-950/40 border-b border-slate-800/80 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Service</span>
            <span className="text-slate-300 font-sans">{execution.service_name}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Environment</span>
            <span className="text-slate-300 font-sans">{execution.environment}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Duration</span>
            <span className="text-indigo-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {execution.duration_ms.toFixed(2)} ms
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Trace</span>
            {onViewTrace ? (
              <button
                onClick={() => onViewTrace(execution.trace_id)}
                className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 underline truncate max-w-full"
              >
                <span>View Graph</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            ) : (
              <span className="text-slate-400 truncate">{execution.trace_id}</span>
            )}
          </div>
        </div>

        {/* Payloads Scrollable Area */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Error Banner */}
          {execution.error && (
            <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/40 space-y-2">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-xs font-mono">
                <span>{execution.error.type_name}:</span>
                <span>{execution.error.message}</span>
              </div>
              {execution.error.stack_trace && (
                <pre className="p-3 bg-slate-950/80 rounded-lg text-[11px] font-mono text-rose-300/90 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {execution.error.stack_trace}
                </pre>
              )}
            </div>
          )}

          {/* Input Payload */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Input Arguments (Sanitized)
            </span>
            <pre className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">
              {execution.input_payload !== undefined
                ? JSON.stringify(execution.input_payload, null, 2)
                : 'null'}
            </pre>
          </div>

          {/* Output Payload */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Return Value
            </span>
            <pre className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">
              {execution.output_payload !== undefined
                ? JSON.stringify(execution.output_payload, null, 2)
                : 'null'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
