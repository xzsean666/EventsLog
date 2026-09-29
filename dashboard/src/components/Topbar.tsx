import React from 'react';
import { RefreshCw, Search } from 'lucide-react';

interface TopbarProps {
  title: string;
  onRefresh?: () => void;
  isLoading?: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  title,
  onRefresh,
  isLoading = false,
  searchQuery,
  onSearchChange,
}) => {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-white tracking-tight">{title}</h2>
      </div>

      <div className="flex items-center gap-3">
        {onSearchChange !== undefined && (
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search functions or traces..."
              value={searchQuery ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs bg-slate-800/80 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-64 transition-colors"
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
