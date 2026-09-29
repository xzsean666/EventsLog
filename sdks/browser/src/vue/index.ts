import { captureError, startSpan } from '../index';

export interface VueApp {
  config: {
    errorHandler?: (err: unknown, instance: unknown, info: string) => void;
  };
}

export interface VueRouter {
  beforeEach: (guard: (to: { path: string; name?: string }, from: { path: string; name?: string }, next?: () => void) => void) => void;
  afterEach: (hook: (to: { path: string; name?: string }, from: { path: string; name?: string }) => void) => void;
}

export interface VuePluginOptions {
  /**
   * Optional Vue Router instance to track SPA page transitions.
   */
  router?: VueRouter;
  /**
   * Whether to capture Vue component errors.
   * @default true
   */
  captureErrors?: boolean;
}

/**
 * Creates the Vue 3 plugin for EventsLog.
 */
export function createEventsLogVue(options: VuePluginOptions = {}) {
  return {
    install(app: VueApp): void {
      if (options.captureErrors !== false) {
        const originalErrorHandler = app.config.errorHandler;

        app.config.errorHandler = (err: unknown, instance: unknown, info: string) => {
          let componentName = 'VueComponent';
          if (instance && typeof instance === 'object') {
            const inst = instance as Record<string, unknown>;
            const optionsObj = inst.$options as Record<string, unknown> | undefined;
            componentName = (optionsObj?.name as string) || (optionsObj?.__file as string) || inst.name as string || 'VueComponent';
          }

          captureError(err, {
            'vue.component': componentName,
            'vue.lifecycle_hook': info,
          });

          if (typeof originalErrorHandler === 'function') {
            originalErrorHandler(err, instance, info);
          }
        };
      }

      if (options.router) {
        trackVueRouter(options.router);
      }
    },
  };
}

/**
 * Attaches navigation tracking hooks to vue-router.
 */
export function trackVueRouter(router: VueRouter): void {
  let navStartTime: number | null = null;
  let targetPath = '';

  if (typeof router.beforeEach === 'function') {
    router.beforeEach((to, _from, next) => {
      navStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      targetPath = to?.path || 'unknown';
      if (typeof next === 'function') {
        next();
      }
    });
  }

  if (typeof router.afterEach === 'function') {
    router.afterEach((to, from) => {
      const toPath = to?.path || targetPath || 'unknown';
      const fromPath = from?.path || 'initial';
      const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const durationNanos = navStartTime !== null ? Math.round((endTime - navStartTime) * 1_000_000) : 0;
      navStartTime = null;

      startSpan('vue.router.navigate', () => {}, {
        'route.to': toPath,
        'route.from': fromPath,
        'route.name': to?.name || '',
        'route.duration_nanos': durationNanos,
      });
    });
  }
}

/**
 * Standard Vue plugin object for `app.use(EventsLogVue)`.
 */
export const EventsLogVue = createEventsLogVue();
