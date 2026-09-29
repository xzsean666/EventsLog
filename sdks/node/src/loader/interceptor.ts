import * as path from 'node:path';
import { Module } from 'node:module';
import { patchModule } from '../instrumentation/patcher.js';
import type { EventsLogConfig } from '../config/types.js';
import type { EventSink } from '../instrumentation/wrapper.js';

let isHookInstalled = false;

/**
 * Normalizes a filename to a clean module identifier.
 */
function getModuleIdentifier(filename: string, cwd: string): string {
  const relative = path.relative(cwd, filename);
  return relative.replace(/\\/g, '/').replace(/\.[^/.]+$/, '');
}

/**
 * Installs module compilation hooks in the Node.js runtime to automatically
 * intercept and instrument exported functions and classes on load.
 */
export function installModuleHook(config: EventsLogConfig, sink: EventSink): void {
  if (isHookInstalled) {
    return;
  }
  isHookInstalled = true;

  const originalCompile = (Module.prototype as any)._compile;
  const cwd = process.cwd();

  (Module.prototype as any)._compile = function (content: string, filename: string) {
    // Execute standard compilation
    const result = originalCompile.call(this, content, filename);

    // Skip node_modules and internal EventsLog SDK files by default
    const normalized = filename.replace(/\\/g, '/');
    if (normalized.includes('/node_modules/') || normalized.includes('/sdks/node/')) {
      return result;
    }

    try {
      const moduleName = getModuleIdentifier(filename, cwd);
      if (this.exports) {
        this.exports = patchModule(this.exports, moduleName, config, sink);
      }
    } catch (err) {
      // Do not allow instrumentation errors to break module loading
      console.warn(`[EventsLog] Failed to instrument module ${filename}:`, err);
    }

    return result;
  };
}
