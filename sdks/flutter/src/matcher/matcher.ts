/**
 * Converts a glob pattern to a RegExp.
 */
export function globToRegex(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, '/');
  let regexStr = '^';
  let i = 0;

  while (i < normalized.length) {
    const c = normalized[i];
    if (c === '*' && normalized[i + 1] === '*') {
      // '**/' matches zero or more directories
      if (normalized[i + 2] === '/') {
        regexStr += '(?:.*/)?';
        i += 3;
      } else {
        regexStr += '.*';
        i += 2;
      }
    } else if (c === '*') {
      regexStr += '[^/]*';
      i++;
    } else if (c === '?') {
      regexStr += '[^/]';
      i++;
    } else if ('.+^$()|[]{}\\'.includes(c)) {
      regexStr += '\\' + c;
      i++;
    } else {
      regexStr += c;
      i++;
    }
  }

  regexStr += '$';
  return new RegExp(regexStr);
}

export class PatternMatcher {
  private includeFileRegexes: RegExp[] = [];
  private excludeFileRegexes: RegExp[] = [];
  private functionRules: Array<{ pattern: RegExp; isInclude: boolean }> = [];

  constructor(includes: string[], excludes: string[]) {
    for (const rule of includes) {
      this.addRule(rule, true);
    }
    for (const rule of excludes) {
      this.addRule(rule, false);
    }
  }

  private addRule(rule: string, isInclude: boolean) {
    const trimmed = rule.trim();
    if (!trimmed) return;

    // Check if the rule is specifically for a function/class (e.g. OrderService.* or File:Class.method)
    if (trimmed.includes(':')) {
      const [filePart, funcPart] = trimmed.split(':');
      const fileRegex = globToRegex(filePart);
      const funcRegex = globToRegex(funcPart);
      this.functionRules.push({
        pattern: new RegExp(`${fileRegex.source.slice(1, -1)}:${funcRegex.source.slice(1, -1)}`),
        isInclude,
      });
      if (isInclude) {
        this.includeFileRegexes.push(fileRegex);
      }
    } else if (trimmed.endsWith('.dart') || trimmed.includes('/') || trimmed.startsWith('lib')) {
      // It's a file pattern
      const regex = globToRegex(trimmed);
      if (isInclude) {
        this.includeFileRegexes.push(regex);
      } else {
        this.excludeFileRegexes.push(regex);
      }
    } else {
      // It's a class/function wildcard pattern (e.g. OrderService.*, *Service.*)
      const regex = globToRegex(trimmed);
      this.functionRules.push({ pattern: regex, isInclude });
    }
  }

  /**
   * Checks if a given relative file path should be considered for instrumentation.
   */
  matchesFile(relativeFilePath: string): boolean {
    const normalized = relativeFilePath.replace(/\\/g, '/').replace(/^\.\//, '');

    // Check excludes first
    for (const regex of this.excludeFileRegexes) {
      if (regex.test(normalized)) {
        return false;
      }
    }

    // If no explicit file includes were added, include all files by default
    if (this.includeFileRegexes.length === 0) {
      return true;
    }

    for (const regex of this.includeFileRegexes) {
      if (regex.test(normalized)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if a given function/method within a file should be instrumented.
   */
  matchesFunction(relativeFilePath: string, className: string | undefined, functionName: string): boolean {
    const normalizedFile = relativeFilePath.replace(/\\/g, '/').replace(/^\.\//, '');
    const fullName = className ? `${className}.${functionName}` : functionName;
    const qualified = `${normalizedFile}:${fullName}`;

    // If specific function rules are present, evaluate them
    let matched = false;
    let hasIncludeFunctionRule = false;

    for (const rule of this.functionRules) {
      if (rule.isInclude) {
        hasIncludeFunctionRule = true;
        if (rule.pattern.test(fullName) || rule.pattern.test(qualified)) {
          matched = true;
        }
      } else {
        // Exclude rule
        if (rule.pattern.test(fullName) || rule.pattern.test(qualified)) {
          return false;
        }
      }
    }

    if (hasIncludeFunctionRule) {
      return matched;
    }

    // Default: if file matched and no function-level exclude, instrument function
    return true;
  }
}
