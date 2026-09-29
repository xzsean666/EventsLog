import React, { useState } from 'react';
import type { FunctionSummary, ExecutionRecord } from '../api/types.js';
import { defaultApiClient } from '../api/client.js';
import { ArrowUpDown, ChevronRight } from 'lucide-react';

interface FunctionsViewProps {
  functions: FunctionSummary[];
  searchQuery: string;
  onSelectExecution: (execution: ExecutionRecord) => void;
}

type SortField = 'name' | 'invocations' | 'errors' | 'latency';

export const FunctionsView: React.FC<FunctionsViewProps> = ({
  functions,
  searchQuery,
  onSelectExecution,
}) => {
  const [selectedFunction, setSelectedFunction] = useState<FunctionSummary | null>(null);
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [isLoadingExecutions, setIsLoadingExecutions] = useState(false);
  const [sortField, setSortField] = useState<SortField>('invocations');
  const [sortAsc, setSortAsc] = useState(false);

  const handleFunctionClick = async (fn: FunctionSummary) => {
    setSelectedFunction(fn);
    setIsLoadingExecutions(true);
    try {
      const records = await defaultApiClient.fetchFunctionExecutions(fn.function_id);
      setExecutions(records);
    } catch (err) {
      console.error('Failed to fetch executions:', err);
    } finally {
      setIsLoadingExecutions(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const filtered = functions
    .filter((fn) => {
      const q = searchQuery.toLowerCase();
      return (
        fn.function_name.toLowerCase().includes(q) ||
        fn.module.toLowerCase().includes(q) ||
        (fn.class_name && fn.class_name.toLowerCase().includes(q)) ||
        fn.service_name.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortField === 'name') {
        comparison = a.function_name.localeCompare(b.function_name);
      } else if (sortField === 'invocations') {
        comparison = a.total_executions - b.total_executions;
      } else if (sortField === 'errors') {
        comparison = a.total_errors - b.total_errors;
      } else if (sortField === 'latency') {
        comparison = a.avg_duration_ms - b.avg_duration_ms;
      }
      return sortAsc ? comparison : -comparison;
    });

  return (
    <div className="space-y-6">
      {/* Functions List Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div>
            <h3 className="font-semibold text-white text-sm">Observed Functions</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Showing {filtered.length} functions matching filters
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/40 text-slate-400 border-b border-slate-800">
              <tr>
                <th
                  onClick={() => handleSort('name')}
                  className="p-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Function</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="p-3">Module</th>
                <th className="p-3">Service</th>
                <th
                  onClick={() => handleSort('invocations')}
                  className="p-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Invocations</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('errors')}
                  className="p-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Errors</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('latency')}
                  className="p-3 cursor-pointer hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Avg Duration</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filtered.map((fn) => {
                const isSelected = selectedFunction?.function_id === fn.function_id;
                return (
                  <tr
                    key={fn.function_id}
                    onClick={() => void handleFunctionClick(fn)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-950/30 text-indigo-300' : 'hover:bg-slate-800/30'
                    }`}
                  >
                    <td className="p-3 font-semibold text-slate-100">
                      {fn.class_name ? `${fn.class_name}.${fn.function_name}` : fn.function_name}
                    </td>
                    <td className="p-3 text-slate-400">{fn.module}</td>
                    <td className="p-3 text-slate-300 font-sans">{fn.service_name}</td>
                    <td className="p-3 text-white font-sans">{fn.total_executions.toLocaleString()}</td>
                    <td className="p-3 font-sans">
                      {fn.total_errors > 0 ? (
                        <span className="text-amber-400 font-medium">{fn.total_errors}</span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-300">{fn.avg_duration_ms.toFixed(1)} ms</td>
                    <td className="p-3 font-sans">
                      <span className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-xs">
                        History <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Function Executions Drilldown */}
      {selectedFunction && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm animate-in fade-in duration-200">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
            <div>
              <h4 className="font-semibold text-white text-sm">
                Recent Executions:{' '}
                <span className="text-indigo-400 font-mono">
                  {selectedFunction.class_name
                    ? `${selectedFunction.class_name}.${selectedFunction.function_name}`
                    : selectedFunction.function_name}
                </span>
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">Click an execution to inspect payloads</p>
            </div>
          </div>

          {isLoadingExecutions ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading execution records...</div>
          ) : executions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No recent executions recorded</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800/40 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">Execution ID</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Duration</th>
                    <th className="p-3">Trace ID</th>
                    <th className="p-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {executions.map((exec) => (
                    <tr
                      key={exec.execution_id}
                      onClick={() => onSelectExecution(exec)}
                      className="cursor-pointer hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="p-3 text-indigo-400 font-semibold">{exec.execution_id}</td>
                      <td className="p-3 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            exec.status === 'success'
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
                              : 'bg-rose-950/60 text-rose-400 border border-rose-800/50'
                          }`}
                        >
                          {exec.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-200">{exec.duration_ms.toFixed(1)} ms</td>
                      <td className="p-3 text-slate-400 truncate max-w-xs">{exec.trace_id}</td>
                      <td className="p-3 text-slate-500 font-sans">
                        {new Date(exec.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
