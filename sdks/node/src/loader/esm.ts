/**
 * Node.js ES Module Customization Hook for zero-code instrumentation.
 * Can be loaded via `node --loader @eventslog/node/loader` or `node --import @eventslog/node/register`.
 */
export async function resolve(specifier: string, context: any, nextResolve: any) {
  return nextResolve(specifier, context);
}

export async function load(url: string, context: any, nextLoad: any) {
  return nextLoad(url, context);
}
