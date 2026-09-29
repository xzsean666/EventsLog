/**
 * Converts a wildcard / glob pattern into a compiled regular expression.
 * Supports:
 * - `**` : matches across path segments or arbitrary tokens
 * - `*`  : matches within a path segment or arbitrary string
 * - `?`  : matches single character
 */
export function globToRegex(pattern: string): RegExp {
  const hasSlash = pattern.includes('/');
  let regexStr = '';
  let i = 0;

  while (i < pattern.length) {
    const c = pattern[i];

    if (c === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        regexStr += '(?:.+/)?';
        i += 3;
      } else {
        regexStr += '.*';
        i += 2;
      }
    } else if (c === '*') {
      if (hasSlash) {
        regexStr += '[^/]*';
      } else {
        regexStr += '.*';
      }
      i += 1;
    } else if (c === '?') {
      regexStr += hasSlash ? '[^/]' : '.';
      i += 1;
    } else if (['.', '+', '^', '$', '(', ')', '[', ']', '{', '}', '|', '\\'].includes(c)) {
      regexStr += '\\' + c;
      i += 1;
    } else {
      regexStr += c;
      i += 1;
    }
  }

  return new RegExp(`^${regexStr}$`);
}

/**
 * Compiled rule pattern matcher that evaluates function candidates against include/exclude sets.
 * Exclude rules strictly take precedence over include rules.
 */
export class PatternMatcher {
  private readonly includePatterns: RegExp[];
  private readonly excludePatterns: RegExp[];

  constructor(rules: { include?: string[]; exclude?: string[] } = {}) {
    this.includePatterns = (rules.include ?? []).map(globToRegex);
    this.excludePatterns = (rules.exclude ?? []).map(globToRegex);
  }

  /**
   * Evaluates whether a given target string matches instrumentation rules.
   * 1. If any exclude pattern matches, returns false.
   * 2. If include set is empty, returns false.
   * 3. Returns true if at least one include pattern matches.
   */
  matches(target: string): boolean {
    for (const re of this.excludePatterns) {
      if (re.test(target)) {
        return false;
      }
    }

    if (this.includePatterns.length === 0) {
      return false;
    }

    return this.includePatterns.some(re => re.test(target));
  }

  /**
   * Evaluates whether a function call identified by module, function name, and optional class
   * should be instrumented.
   */
  isObserved(moduleName: string, functionName: string, className?: string): boolean {
    const candidates: string[] = [];

    if (className) {
      candidates.push(`${className}.${functionName}`);
    }
    if (moduleName) {
      candidates.push(`${moduleName}:${functionName}`);
      candidates.push(moduleName);
    }
    candidates.push(functionName);

    // 1. Strict exclude precedence: if any representation matches exclude, reject
    for (const candidate of candidates) {
      for (const re of this.excludePatterns) {
        if (re.test(candidate)) {
          return false;
        }
      }
    }

    // 2. Empty include set matches nothing
    if (this.includePatterns.length === 0) {
      return false;
    }

    // 3. Any representation matching include accepts
    return candidates.some(candidate => this.includePatterns.some(re => re.test(candidate)));
  }
}
