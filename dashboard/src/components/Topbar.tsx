import React from 'react';
import { RefreshCw, Search, Database, Globe, HardDrive } from 'lucide-react';
import type { TelemetryDataProvider } from '../api/provider.js';

interface TopbarProps {
  title: string;
  onRefresh?: () => void;
  isLoading?: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  activeProviderId?: string;
  onProviderChange?: (providerId: string) => void;
  providers?: TelemetryDataProvider[];
}

export const Topbar: React.FC<TopbarProps> = ({
  title,
  onRefresh,
  isLoading = false,
  searchQuery,
  onSearchChange,
  activeProviderId,
  onProviderChange,
  providers = [],
}) => {
  const getProviderIcon = (type?: string) => {
    switch (type) {
      case 'http_remote':
        return <Globe className="w-3.5 h-3.5 text-sky-400" />;
      case 'http_local':
        return <Database className="w-3.5 h-3.5 text-emerald-400" />;
      case 'indexeddb':
        return <HardDrive className="w-3.5 h-3.5 text-indigo-400" />;
      default:
        return <Database className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const activeProvider = providers.find((p) => p.id === activeProviderId);

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-white tracking-tight">{title}</h2>
      </div>

      <div className="flex items-center gap-3">
        {/* Data Source Selector */}
        {providers.length > 0 && onProviderChange && (
          <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-slate-300">
            <span className="flex items-center gap-1.5 shrink-0">
              {getProviderIcon(activeProvider?.type)}
              <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">Source:</span>
            </span>
            <select
              value={activeProviderId}
              onChange={(e) => onProviderChange(e.target.value)}
              className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer text-xs"
              title="Select telemetry data provider"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {onSearchChange !== undefined && (
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search functions or traces..."
              value={searchQuery ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs bg-slate-800/80 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-56 lg:w-64 transition-colors"
            />
          </div>
        )}

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors disabled:opacity-50"
            title="Refresh telemetry data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        )}
      </div>
    </header>
  );
};

