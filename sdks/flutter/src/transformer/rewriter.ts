import { DartFunction, parseDartSource } from './parser.js';
import { PatternMatcher } from '../matcher/matcher.js';
import { ResolvedEventsLogConfig } from '../config/loader.js';

export interface TransformationResult {
  modified: boolean;
  code: string;
  instrumentedFunctions: Array<{
    name: string;
    className?: string;
  }>;
}

export const INSTRUMENTED_TAG = '// @eventslog:instrumented';

/**
 * Transforms Dart source code by instrumenting matched functions with EventsLog tracing.
 */
export function transformDartSource(
  source: string,
  relativeFilePath: string,
  config: ResolvedEventsLogConfig,
  matcher: PatternMatcher,
): TransformationResult {
  // Idempotency check: never double-instrument
  if (source.includes(INSTRUMENTED_TAG)) {
    return {
      modified: false,
      code: source,
      instrumentedFunctions: [],
    };
  }

  const allFunctions = parseDartSource(source);
  const targetFunctions: DartFunction[] = [];

  for (const fn of allFunctions) {
    if (matcher.matchesFunction(relativeFilePath, fn.className, fn.name)) {
      targetFunctions.push(fn);
    }
  }

  if (targetFunctions.length === 0) {
    return {
      modified: false,
      code: source,
      instrumentedFunctions: [],
    };
  }

  // Sort descending by bodyStartOffset so modifications from bottom to top don't alter earlier offsets
  targetFunctions.sort((a, b) => b.bodyStartOffset - a.bodyStartOffset);

  let transformed = source;
  const instrumentedList: Array<{ name: string; className?: string }> = [];

  for (const fn of targetFunctions) {
    const fullName = fn.className ? `${fn.className}.${fn.name}` : fn.name;
    const classArg = fn.className ? `'${fn.className}'` : 'null';
    const filePathArg = `'${relativeFilePath.replace(/\\/g, '/')}'`;

    let paramMapStr = 'null';
    if (config.captureArguments && fn.parameters.length > 0) {
      const entries = fn.parameters.map(p => `'${p.name}': ${p.name}`).join(', ');
      paramMapStr = `{${entries}}`;
    }

    const indent = fn.indent || '';
    const bodyIndent = indent + '  ';

    let replacement = '';

    if (fn.isArrow) {
      const expr = fn.bodyContent
        .replace(/^=>\s*/, '')
        .replace(/;\s*$/, '')
        .trim();

      if (fn.isAsync) {
        replacement = `=> EventsLog.runWithSpan(\n` +
          `${bodyIndent}functionName: '${fullName}',\n` +
          `${bodyIndent}className: ${classArg},\n` +
          `${bodyIndent}filePath: ${filePathArg},\n` +
          `${bodyIndent}arguments: ${paramMapStr},\n` +
          `${bodyIndent}body: () async => ${expr},\n` +
          `${indent});`;
      } else {
        replacement = `=> EventsLog.runWithSpan(\n` +
          `${bodyIndent}functionName: '${fullName}',\n` +
          `${bodyIndent}className: ${classArg},\n` +
          `${bodyIndent}filePath: ${filePathArg},\n` +
          `${bodyIndent}arguments: ${paramMapStr},\n` +
          `${bodyIndent}body: () => ${expr},\n` +
          `${indent});`;
      }
    } else {
      // Block body { ... }
      const innerContent = fn.bodyContent.slice(1, -1);
      const isVoidType = fn.returnType === 'void' || fn.returnType === 'Future<void>';

      if (fn.isAsync) {
        const returnPrefix = isVoidType ? '' : 'return ';
        replacement = `{\n` +
          `${bodyIndent}${returnPrefix}EventsLog.runWithSpan(\n` +
          `${bodyIndent}  functionName: '${fullName}',\n` +
          `${bodyIndent}  className: ${classArg},\n` +
          `${bodyIndent}  filePath: ${filePathArg},\n` +
          `${bodyIndent}  arguments: ${paramMapStr},\n` +
          `${bodyIndent}  body: () async {\n` +
          `${innerContent}\n` +
          `${bodyIndent}  },\n` +
          `${bodyIndent});\n` +
          `${indent}}`;

      } else {
        const returnPrefix = isVoidType ? '' : 'return ';
        replacement = `{\n` +
          `${bodyIndent}${returnPrefix}EventsLog.runWithSpan(\n` +
          `${bodyIndent}  functionName: '${fullName}',\n` +
          `${bodyIndent}  className: ${classArg},\n` +
          `${bodyIndent}  filePath: ${filePathArg},\n` +
          `${bodyIndent}  arguments: ${paramMapStr},\n` +
          `${bodyIndent}  body: () {\n` +
          `${innerContent}\n` +
          `${bodyIndent}  },\n` +
          `${bodyIndent});\n` +
          `${indent}}`;
      }
    }

    transformed =
      transformed.slice(0, fn.bodyStartOffset) +
      replacement +
      transformed.slice(fn.bodyEndOffset);

    instrumentedList.push({ name: fn.name, className: fn.className });
  }

  // Inject import header
  const importStatement = `import '${config.importPath}';`;
  if (!transformed.includes(config.importPath)) {
    // Find the right place for import (after library or first comments, or before other imports)
    const importRegex = /^(import\s+['"][^'"]+['"];)/m;
    const match = transformed.match(importRegex);
    if (match && match.index !== undefined) {
      transformed =
        transformed.slice(0, match.index) +
        `${INSTRUMENTED_TAG}\n${importStatement}\n` +
        transformed.slice(match.index);
    } else {
      transformed = `${INSTRUMENTED_TAG}\n${importStatement}\n\n` + transformed;
    }
  } else {
    transformed = `${INSTRUMENTED_TAG}\n` + transformed;
  }

  return {
    modified: true,
    code: transformed,
    instrumentedFunctions: instrumentedList.reverse(),
  };
}
