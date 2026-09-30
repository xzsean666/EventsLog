import type { EventsLogBrowserClient } from '../client';
import type { ExecutionRow, FunctionSummary } from '../protocol/types';

export interface DevToolsOptions {
  container?: HTMLElement;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  autoOpenOnError?: boolean;
}

export interface DevToolsController {
  open(): void;
  close(): void;
  toggle(): void;
  destroy(): void;
  refresh(): Promise<void>;
  isOpen(): boolean;
}

/**
 * Mounts an in-page floating DevTools drawer widget for zero-server local debugging.
 */
export function mountDevTools(
  client: EventsLogBrowserClient,
  options: DevToolsOptions = {}
): DevToolsController {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return {
      open: () => {},
      close: () => {},
      toggle: () => {},
      destroy: () => {},
      refresh: async () => {},
      isOpen: () => false,
    };
  }

  let isDrawerOpen = false;
  let executions: ExecutionRow[] = [];
  let functions: FunctionSummary[] = [];
  let selectedExecution: ExecutionRow | null = null;
  let activeTab: 'executions' | 'functions' = 'executions';

  // Create Root Wrapper
  const root = document.createElement('div');
  root.id = 'eventslog-devtools-root';
  root.style.cssText = `
    position: fixed;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #f1f5f9;
  `;

  // Trigger Button
  const btn = document.createElement('button');
  btn.id = 'eventslog-devtools-trigger';
  const pos = options.position || 'bottom-right';

  let posCss = 'bottom: 20px; right: 20px;';
  if (pos === 'bottom-left') posCss = 'bottom: 20px; left: 20px;';
  else if (pos === 'top-right') posCss = 'top: 20px; right: 20px;';
  else if (pos === 'top-left') posCss = 'top: 20px; left: 20px;';

  btn.style.cssText = `
    position: fixed;
    ${posCss}
    z-index: 1000000;
    display: flex;
    align-items: center;
    gap: 6px;
    background: #0f172a;
    color: #38bdf8;
    border: 1px solid #334155;
    padding: 7px 14px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(0,0,0,0.5);
    transition: all 0.2s ease;
  `;
  btn.innerHTML = `<span>⚡ EventsLog</span><span id="eventslog-badge" style="background:#1e293b; color:#94a3b8; padding:1px 6px; border-radius:9999px; font-size:11px;">0</span>`;

  // Drawer Container
  const drawer = document.createElement('div');
  drawer.id = 'eventslog-devtools-drawer';
  drawer.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 400px;
    background: #0b0f17;
    border-top: 1px solid #1e293b;
    box-shadow: 0 -8px 24px rgba(0,0,0,0.7);
    display: none;
    flex-direction: column;
    z-index: 999999;
  `;

  // Drawer Header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 10px 16px;
    border-bottom: 1px solid #1e293b;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #0f172a;
  `;
  header.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px;">
      <span style="font-weight:700; color:#38bdf8; font-size:13px; display:flex; align-items:center; gap:6px;">
        ⚡ EventsLog DevTools
        <span style="font-size:10px; font-weight:normal; background:#1e293b; color:#10b981; border:1px solid #065f46; padding:1px 6px; border-radius:4px;">IndexedDB Local</span>
      </span>
      <div style="display:flex; gap:4px; margin-left:8px;">
        <button id="tab-execs" style="background:#1e293b; color:#fff; border:none; padding:4px 10px; border-radius:4px; font-size:11px; cursor:pointer;">Executions</button>
        <button id="tab-funcs" style="background:transparent; color:#94a3b8; border:none; padding:4px 10px; border-radius:4px; font-size:11px; cursor:pointer;">Functions</button>
      </div>
    </div>
    <div style="display:flex; align-items:center; gap:8px;">
      <button id="btn-refresh" style="background:#1e293b; color:#cbd5e1; border:1px solid #334155; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">🔄 Refresh</button>
      <button id="btn-clear" style="background:#1e293b; color:#f87171; border:1px solid #334155; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">🗑️ Clear</button>
      <button id="btn-close" style="background:transparent; color:#94a3b8; border:none; font-size:16px; cursor:pointer; padding:0 4px;">✕</button>
    </div>
  `;

  // Drawer Content Body
  const content = document.createElement('div');
  content.id = 'eventslog-devtools-content';
  content.style.cssText = `
    flex: 1;
    display: flex;
    overflow: hidden;
  `;

  drawer.appendChild(header);
  drawer.appendChild(content);
  root.appendChild(btn);
  root.appendChild(drawer);

  const container = options.container || document.body;
  container.appendChild(root);

  // Render functions
  const render = () => {
    const badge = btn.querySelector('#eventslog-badge');
    if (badge) {
      badge.textContent = String(executions.length);
    }

    if (!isDrawerOpen) return;

    const tabExecs = header.querySelector('#tab-execs') as HTMLElement;
    const tabFuncs = header.querySelector('#tab-funcs') as HTMLElement;

    if (activeTab === 'executions') {
      tabExecs.style.background = '#334155';
      tabExecs.style.color = '#fff';
      tabFuncs.style.background = 'transparent';
      tabFuncs.style.color = '#94a3b8';

      content.innerHTML = `
        <div style="flex:1; overflow-y:auto; border-right:1px solid #1e293b;">
          ${
            executions.length === 0
              ? '<div style="padding:24px; text-align:center; color:#64748b; font-size:12px;">No recorded executions yet. Call functions or triggers to observe.</div>'
              : `<table style="width:100%; border-collapse:collapse; font-size:12px; font-family:monospace;">
                  <thead style="background:#0f172a; position:sticky; top:0; color:#94a3b8; text-align:left;">
                    <tr>
                      <th style="padding:8px 12px; border-bottom:1px solid #1e293b;">Status</th>
                      <th style="padding:8px 12px; border-bottom:1px solid #1e293b;">Function</th>
                      <th style="padding:8px 12px; border-bottom:1px solid #1e293b;">Duration</th>
                      <th style="padding:8px 12px; border-bottom:1px solid #1e293b;">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${executions
                      .map(
                        (e) => `
                      <tr data-id="${e.event_id}" style="border-bottom:1px solid #1e293b; cursor:pointer; background:${selectedExecution?.event_id === e.event_id ? '#1e293b' : 'transparent'};">
                        <td style="padding:8px 12px;">
                          <span style="background:${e.status === 'error' ? '#ef4444' : '#10b981'}; color:#fff; padding:2px 6px; border-radius:3px; font-size:10px; font-weight:bold;">
                            ${e.status.toUpperCase()}
                          </span>
                        </td>
                        <td style="padding:8px 12px; color:#f8fafc; font-weight:600;">
                          ${e.class_name ? `${e.class_name}.` : ''}${e.function_name}
                        </td>
                        <td style="padding:8px 12px; color:#cbd5e1;">${e.duration_ms.toFixed(1)} ms</td>
                        <td style="padding:8px 12px; color:#64748b; font-size:11px;">${new Date(e.timestamp).toLocaleTimeString()}</td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>`
          }
        </div>
        <div id="exec-detail-pane" style="flex:1; overflow-y:auto; padding:16px; font-size:12px; background:#070b11;">
          ${
            selectedExecution
              ? `
              <div style="margin-bottom:12px;">
                <div style="font-weight:bold; font-size:14px; color:#f8fafc; margin-bottom:4px;">
                  ${selectedExecution.function_name}
                </div>
                <div style="color:#64748b; font-family:monospace; font-size:11px;">
                  Trace: ${selectedExecution.trace_id} | Span: ${selectedExecution.span_id}
                </div>
              </div>
              ${
                selectedExecution.error_message
                  ? `<div style="background:#450a0a; border:1px solid #991b1b; padding:10px; border-radius:6px; margin-bottom:12px; color:#fca5a5;">
                      <div style="font-weight:bold;">${selectedExecution.error_type || 'Error'}: ${selectedExecution.error_message}</div>
                      ${selectedExecution.error_stack ? `<pre style="margin-top:6px; font-size:10px; overflow-x:auto;">${selectedExecution.error_stack}</pre>` : ''}
                    </div>`
                  : ''
              }
              <div style="margin-bottom:12px;">
                <div style="color:#94a3b8; font-weight:600; margin-bottom:4px; font-size:11px;">Input Arguments</div>
                <pre style="background:#0f172a; padding:8px; border-radius:4px; overflow-x:auto; color:#38bdf8;">${selectedExecution.input_json || '(none)'}</pre>
              </div>
              <div>
                <div style="color:#94a3b8; font-weight:600; margin-bottom:4px; font-size:11px;">Return Output</div>
                <pre style="background:#0f172a; padding:8px; border-radius:4px; overflow-x:auto; color:#a7f3d0;">${selectedExecution.output_json || '(none)'}</pre>
              </div>
            `
              : '<div style="color:#64748b; text-align:center; padding-top:40px;">Select an execution on the left to inspect inputs, outputs, and errors.</div>'
          }
        </div>
      `;

      // Bind row clicks
      content.querySelectorAll('tr[data-id]').forEach((row) => {
        row.addEventListener('click', () => {
          const id = row.getAttribute('data-id');
          selectedExecution = executions.find((e) => e.event_id === id) || null;
          render();
        });
      });
    } else {
      tabFuncs.style.background = '#334155';
      tabFuncs.style.color = '#fff';
      tabExecs.style.background = 'transparent';
      tabExecs.style.color = '#94a3b8';

      content.innerHTML = `
        <div style="flex:1; overflow-y:auto; padding:12px;">
          ${
            functions.length === 0
              ? '<div style="padding:24px; text-align:center; color:#64748b; font-size:12px;">No functions recorded yet.</div>'
              : `<table style="width:100%; border-collapse:collapse; font-size:12px;">
                  <thead style="background:#0f172a; color:#94a3b8; text-align:left;">
                    <tr>
                      <th style="padding:8px 12px; border-bottom:1px solid #1e293b;">Function</th>
                      <th style="padding:8px 12px; border-bottom:1px solid #1e293b;">Module</th>
                      <th style="padding:8px 12px; border-bottom:1px solid #1e293b;">Invocations</th>
                      <th style="padding:8px 12px; border-bottom:1px solid #1e293b;">Errors</th>
                      <th style="padding:8px 12px; border-bottom:1px solid #1e293b;">Avg Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${functions
                      .map(
                        (f) => `
                      <tr style="border-bottom:1px solid #1e293b;">
                        <td style="padding:8px 12px; color:#f8fafc; font-weight:600; font-family:monospace;">${f.function_name}</td>
                        <td style="padding:8px 12px; color:#94a3b8;">${f.module_name || f.module}</td>
                        <td style="padding:8px 12px; color:#38bdf8; font-weight:bold;">${f.call_count}</td>
                        <td style="padding:8px 12px; color:${f.error_count > 0 ? '#f87171' : '#64748b'};">${f.error_count}</td>
                        <td style="padding:8px 12px; color:#cbd5e1;">${f.avg_duration_ms.toFixed(1)} ms</td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>`
          }
        </div>
      `;
    }
  };

  const refreshData = async () => {
    try {
      executions = await client.storage.listExecutions({ limit: 100 });
      functions = await client.storage.listFunctions({ limit: 50 });
      if (selectedExecution) {
        selectedExecution =
          executions.find((e) => e.event_id === selectedExecution!.event_id) || null;
      }
      render();
    } catch {
      // safe fallback
    }
  };

  const openDrawer = () => {
    isDrawerOpen = true;
    drawer.style.display = 'flex';
    void refreshData();
  };

  const closeDrawer = () => {
    isDrawerOpen = false;
    drawer.style.display = 'none';
  };

  const toggleDrawer = () => {
    if (isDrawerOpen) closeDrawer();
    else openDrawer();
  };

  // Event handlers
  btn.addEventListener('click', toggleDrawer);
  header.querySelector('#btn-close')?.addEventListener('click', closeDrawer);
  header.querySelector('#btn-refresh')?.addEventListener('click', () => void refreshData());
  header.querySelector('#btn-clear')?.addEventListener('click', async () => {
    await client.storage.clear();
    selectedExecution = null;
    await refreshData();
  });

  header.querySelector('#tab-execs')?.addEventListener('click', () => {
    activeTab = 'executions';
    render();
  });
  header.querySelector('#tab-funcs')?.addEventListener('click', () => {
    activeTab = 'functions';
    render();
  });

  // Initial load
  void refreshData();

  return {
    open: openDrawer,
    close: closeDrawer,
    toggle: toggleDrawer,
    destroy: () => {
      root.remove();
    },
    refresh: refreshData,
    isOpen: () => isDrawerOpen,
  };
}
