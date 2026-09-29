import React from 'react';
import { Activity, Code2, Network, ShieldCheck } from 'lucide-react';

export type TabType = 'overview' | 'functions' | 'traces';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const navItems: { id: TabType; label: string; icon: React.ReactNode }[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: <Activity className="w-5 h-5" />,
    },
    {
      id: 'functions',
      label: 'Functions',
      icon: <Code2 className="w-5 h-5" />,
    },
    {
      id: 'traces',
      label: 'Traces',
      icon: <Network className="w-5 h-5" />,
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between h-screen select-none">
      <div>
        {/* Brand header */}
        <div className="p-5 flex items-center gap-3 border-b border-slate-800">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-white text-base leading-tight tracking-wide">
              EventsLog
            </h1>
            <p className="text-xs text-slate-400 font-medium">Observability</p>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer system status */}
      <div className="p-4 border-t border-slate-800 text-xs text-slate-400 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <div>
          <span className="font-semibold text-slate-300">Cluster Status:</span> Healthy
        </div>
      </div>
    </aside>
  );
};
