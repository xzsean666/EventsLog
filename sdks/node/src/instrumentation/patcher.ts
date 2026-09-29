import { PatternMatcher } from '../config/matcher.js';
import type { EventsLogConfig } from '../config/types.js';
import { wrapFunction, type EventSink, type WrapOptions, IS_WRAPPED } from './wrapper.js';

/**
 * Determines whether a function is an ES6 class or constructor.
 */
export function isClass(fn: any): boolean {
  if (typeof fn !== 'function') return false;
  // Native/ES6 class detection
  const str = Function.prototype.toString.call(fn);
  if (/^\s*class(\s+|\{)/.test(str)) {
    return true;
  }
  // Check prototype properties beyond constructor
  if (fn.prototype) {
    const protoProps = Object.getOwnPropertyNames(fn.prototype);
    if (protoProps.length > 1) {
      return true;
    }
  }
  return false;
}

/**
 * Instruments methods declared on a class prototype and its static methods.
 */
export function patchClass(
  cls: any,
  className: string,
  moduleName: string,
  config: EventsLogConfig,
  sink?: EventSink
): void {
  if (!cls || typeof cls !== 'function') {
    return;
  }

  const matcher = new PatternMatcher(config.instrumentation);
  const wrapOptions: WrapOptions = {
    serviceName: config.service_name,
    environment: config.environment,
    samplingRate: config.instrumentation.sampling_rate,
    maxPayloadBytes: config.instrumentation.max_payload_bytes,
    sanitizerOptions: {
      sensitiveKeys: config.instrumentation.sensitive_keys,
    },
    sink,
  };

  // 1. Patch prototype methods (instance methods)
  const proto = cls.prototype;
  if (proto) {
    const protoProps = Object.getOwnPropertyNames(proto);
    for (const prop of protoProps) {
      if (prop === 'constructor') continue;

      try {
        const desc = Object.getOwnPropertyDescriptor(proto, prop);
        if (desc && typeof desc.value === 'function' && !desc.value[IS_WRAPPED]) {
          if (matcher.isObserved(moduleName, prop, className)) {
            const wrapped = wrapFunction(
              desc.value,
              {
                module: moduleName,
                class_name: className,
                function_name: prop,
              },
              wrapOptions
            );
            if (desc.configurable) {
              Object.defineProperty(proto, prop, { ...desc, value: wrapped });
            } else {
              proto[prop] = wrapped;
            }
          }
        }
      } catch {
        // Skip un-configurable descriptors
      }
    }
  }

  // 2. Patch static methods
  const staticProps = Object.getOwnPropertyNames(cls);
  for (const prop of staticProps) {
    if (['prototype', 'length', 'name', 'arguments', 'caller'].includes(prop)) {
      continue;
    }

    try {
      const desc = Object.getOwnPropertyDescriptor(cls, prop);
      if (desc && typeof desc.value === 'function' && !desc.value[IS_WRAPPED]) {
        if (matcher.isObserved(moduleName, prop, className)) {
          const wrapped = wrapFunction(
            desc.value,
            {
              module: moduleName,
              class_name: className,
              function_name: prop,
            },
            wrapOptions
          );
          if (desc.configurable) {
            Object.defineProperty(cls, prop, { ...desc, value: wrapped });
          } else {
            cls[prop] = wrapped;
          }
        }
      }
    } catch {
      // Skip un-configurable properties
    }
  }
}

/**
 * Instruments an object containing functions or nested objects.
 */
export function patchObject(
  obj: any,
  objectName: string,
  moduleName: string,
  config: EventsLogConfig,
  sink?: EventSink
): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const matcher = new PatternMatcher(config.instrumentation);
  const wrapOptions: WrapOptions = {
    serviceName: config.service_name,
    environment: config.environment,
    samplingRate: config.instrumentation.sampling_rate,
    maxPayloadBytes: config.instrumentation.max_payload_bytes,
    sanitizerOptions: {
      sensitiveKeys: config.instrumentation.sensitive_keys,
    },
    sink,
  };

  const props = Object.getOwnPropertyNames(obj);
  for (const prop of props) {
    try {
      const desc = Object.getOwnPropertyDescriptor(obj, prop);
      if (!desc) continue;

      if (typeof desc.value === 'function' && !desc.value[IS_WRAPPED]) {
        if (matcher.isObserved(moduleName, prop, objectName)) {
          const wrapped = wrapFunction(
            desc.value,
            {
              module: moduleName,
              class_name: objectName,
              function_name: prop,
            },
            wrapOptions
          );
          if (desc.configurable) {
            Object.defineProperty(obj, prop, { ...desc, value: wrapped });
          } else {
            obj[prop] = wrapped;
          }
        }
      }
    } catch {
      // Ignore un-configurable properties
    }
  }

  return obj;
}

/**
 * Inspects exported items of a module and wraps any classes or standalone functions matching inclusion rules.
 */
export function patchModule(
  moduleExports: any,
  moduleName: string,
  config: EventsLogConfig,
  sink?: EventSink
): any {
  if (!moduleExports) {
    return moduleExports;
  }

  const matcher = new PatternMatcher(config.instrumentation);
  const wrapOptions: WrapOptions = {
    serviceName: config.service_name,
    environment: config.environment,
    samplingRate: config.instrumentation.sampling_rate,
    maxPayloadBytes: config.instrumentation.max_payload_bytes,
    sanitizerOptions: {
      sensitiveKeys: config.instrumentation.sensitive_keys,
    },
    sink,
  };

  // Case 1: module.exports is directly a class or function
  if (typeof moduleExports === 'function') {
    if (isClass(moduleExports)) {
      patchClass(moduleExports, moduleExports.name || 'AnonymousClass', moduleName, config, sink);
      return moduleExports;
    }

    if (!moduleExports[IS_WRAPPED] && matcher.isObserved(moduleName, moduleExports.name || 'default')) {
      return wrapFunction(
        moduleExports,
        {
          module: moduleName,
          function_name: moduleExports.name || 'default',
        },
        wrapOptions
      );
    }

    return moduleExports;
  }

  // Case 2: module.exports is an object of named exports
  if (typeof moduleExports === 'object') {
    for (const [key, value] of Object.entries(moduleExports)) {
      if (typeof value === 'function') {
        if (isClass(value)) {
          patchClass(value, key, moduleName, config, sink);
        } else if (!(value as any)[IS_WRAPPED] && matcher.isObserved(moduleName, key)) {
          try {
            const desc = Object.getOwnPropertyDescriptor(moduleExports, key);
            const wrapped = wrapFunction(
              value as any,
              {
                module: moduleName,
                function_name: key,
              },
              wrapOptions
            );
            if (desc && desc.configurable) {
              Object.defineProperty(moduleExports, key, { ...desc, value: wrapped });
            } else {
              (moduleExports as any)[key] = wrapped;
            }
          } catch {
            // Ignore unconfigurable properties
          }
        }
      }
    }
  }

  return moduleExports;
}

