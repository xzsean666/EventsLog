import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar, type TabType } from './components/Sidebar.js';
import { Topbar } from './components/Topbar.js';
import { FunctionsView } from './views/FunctionsView.js';
import { TraceTreeView } from './views/TraceTreeView.js';
import { ExecutionDetailModal } from './views/ExecutionDetailModal.js';
import { defaultProviderRegistry } from './api/provider.js';
import type { ServiceStats, FunctionSummary, TraceTree, ExecutionRecord } from './api/types.js';
import { Activity, AlertTriangle, Clock, Zap } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [providerId, setProviderId] = useState<string>(() =>
    defaultProviderRegistry.getActiveProviderId()
  );
  const currentProvider =
    defaultProviderRegistry.getProvider(providerId) || defaultProviderRegistry.getActiveProvider();

  const [stats, setStats] = useState<ServiceStats | null>(null);
  const [functions, setFunctions] = useState<FunctionSummary[]>([]);
  const [activeTrace, setActiveTrace] = useState<TraceTree | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionRecord | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const provider =
        defaultProviderRegistry.getProvider(providerId) || defaultProviderRegistry.getActiveProvider();
      const [statsData, funcsData] = await Promise.all([
        provider.fetchStats().catch((err) => {
          console.warn('Failed to fetch stats:', err);
          return null;
        }),
        provider.fetchFunctions().catch((err) => {
          console.warn('Failed to fetch functions:', err);
          return [];
        }),
      ]);
      setStats(statsData);
      setFunctions(funcsData);

      // Auto-load most recent trace dynamically if none is selected
      if (!activeTrace && funcsData.length > 0) {
        try {
          const sampleExecs = await provider.fetchFunctionExecutions(funcsData[0].function_id, 1);
          if (sampleExecs.length > 0 && sampleExecs[0].trace_id) {
            const initialTrace = await provider.fetchTrace(sampleExecs[0].trace_id);
            setActiveTrace(initialTrace);
          }
        } catch {
          // Gracefully omit active trace if not available
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard telemetry:', err);
    } finally {
      setIsLoading(false);
    }
  }, [providerId, activeTrace]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="flex h-screen bg-[#0b0f17] text-slate-200 overflow-hidden font-sans">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          title={
            activeTab === 'overview'
              ? 'Cluster Overview'
              : activeTab === 'functions'
                ? 'Observed Functions'
                : 'Distributed Traces'
          }
          onRefresh={loadData}
          isLoading={isLoading}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeProviderId={providerId}
          onProviderChange={(newId) => {
            setProviderId(newId);
            defaultProviderRegistry.setActiveProvider(newId);
          }}
          providers={defaultProviderRegistry.getProviders()}
        />

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stat Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      Executions
                    </span>
                    <Zap className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {stats ? stats.total_executions.toLocaleString() : '---'}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Observed function invocations</p>
                </div>

                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Errors</span>
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {stats ? stats.total_errors.toLocaleString() : '---'}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Rate: {stats ? (stats.error_rate * 100).toFixed(3) : '0'}%
                  </p>
                </div>

                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      p50 Latency
                    </span>
                    <Clock className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {stats ? `${stats.p50_duration_ms.toFixed(1)} ms` : '---'}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Median execution duration</p>
                </div>

                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      p95 Latency
                    </span>
                    <Activity className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {stats ? `${stats.p95_duration_ms.toFixed(1)} ms` : '---'}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    p99: {stats ? `${stats.p99_duration_ms.toFixed(1)} ms` : '---'}
                  </p>
                </div>
              </div>

              {/* Observed Functions Preview */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                  <h3 className="font-semibold text-white text-sm">Top Functions by Activity</h3>
                  <button
                    onClick={() => setActiveTab('functions')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    View All →
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-800/50 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-3">Function</th>
                        <th className="p-3">Service</th>
                        <th className="p-3">Invocations</th>
                        <th className="p-3">Errors</th>
                        <th className="p-3">Avg Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {functions.slice(0, 5).map((fn) => (
                        <tr
                          key={fn.function_id}
                          onClick={() => setActiveTab('functions')}
                          className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                        >
                          <td className="p-3 text-slate-200 font-semibold">
                            {fn.class_name ? `${fn.class_name}.${fn.function_name}` : fn.function_name}
                          </td>
                          <td className="p-3 text-slate-400 font-sans">{fn.service_name}</td>
                          <td className="p-3 text-white font-sans font-medium">
                            {fn.total_executions.toLocaleString()}
                          </td>
                          <td className="p-3 font-sans">
                            <span className={fn.total_errors > 0 ? 'text-amber-400 font-medium' : 'text-slate-500'}>
                              {fn.total_errors}
                            </span>
                          </td>
                          <td className="p-3 text-slate-300">{fn.avg_duration_ms.toFixed(1)} ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'functions' && (
            <FunctionsView
              functions={functions}
              searchQuery={searchQuery}
              onSelectExecution={setSelectedExecution}
              provider={currentProvider}
            />
          )}

          {activeTab === 'traces' && (
            activeTrace ? (
              <TraceTreeView
                trace={activeTrace}
                onSelectSpan={setSelectedExecution}
              />
            ) : (
              <div className="p-12 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-xl">
                <Clock className="w-8 h-8 mx-auto mb-3 opacity-40 text-indigo-400" />
                <p className="font-semibold text-slate-300 text-sm">No Active Trace Selected</p>
                <p className="text-xs text-slate-500 mt-1">Select an execution record from the Functions view and click &quot;View Trace&quot; to inspect its execution hierarchy.</p>
              </div>
            )
          )}
        </main>
      </div>

      {/* Execution Detail Modal */}
      <ExecutionDetailModal
        execution={selectedExecution}
        onClose={() => setSelectedExecution(null)}
        onViewTrace={async (traceId) => {
          setSelectedExecution(null);
          setActiveTab('traces');
          if (traceId) {
            try {
              const trace = await currentProvider.fetchTrace(traceId);
              setActiveTrace(trace);
            } catch (err) {
              console.warn('Failed to load clicked trace:', err);
            }
          }
        }}
      />
    </div>
  );
};
