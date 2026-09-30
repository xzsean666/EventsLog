export interface DartParameter {
  name: string;
  type?: string;
}

export interface DartFunction {
  name: string;
  className?: string;
  returnType?: string;
  parameters: DartParameter[];
  isAsync: boolean;
  isArrow: boolean;
  isVoid: boolean;
  /** Character index where signature begins (e.g. return type or function name) */
  startOffset: number;
  /** Character index where body starts (e.g. '{' or '=>') */
  bodyStartOffset: number;
  /** Character index where body ends (e.g. '}' or ';') */
  bodyEndOffset: number;
  /** Text of the function body */
  bodyContent: string;
  /** Indentation string of the function definition */
  indent: string;
}

/**
 * Token in a Dart source file.
 */
interface Token {
  type: 'word' | 'punct' | 'string' | 'comment' | 'ws';
  value: string;
  offset: number;
}

/**
 * Tokenizes Dart code while preserving exact character offsets.
 */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    const c = source[i];
    const c2 = i + 1 < len ? source[i + 1] : '';

    // Whitespace
    if (/\s/.test(c)) {
      const start = i;
      while (i < len && /\s/.test(source[i])) {
        i++;
      }
      tokens.push({ type: 'ws', value: source.slice(start, i), offset: start });
      continue;
    }

    // Line comment
    if (c === '/' && c2 === '/') {
      const start = i;
      while (i < len && source[i] !== '\n') {
        i++;
      }
      tokens.push({ type: 'comment', value: source.slice(start, i), offset: start });
      continue;
    }

    // Block comment
    if (c === '/' && c2 === '*') {
      const start = i;
      i += 2;
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) {
        i++;
      }
      if (i < len) i += 2;
      tokens.push({ type: 'comment', value: source.slice(start, i), offset: start });
      continue;
    }

    // Raw strings or multiline strings
    if (c === 'r' && (c2 === "'" || c2 === '"')) {
      const quote = c2;
      const start = i;
      i += 2;
      while (i < len && source[i] !== quote) {
        i++;
      }
      if (i < len) i++;
      tokens.push({ type: 'string', value: source.slice(start, i), offset: start });
      continue;
    }

    // Normal strings (single or double quote, triple quote)
    if (c === "'" || c === '"') {
      const quote = c;
      const start = i;
      const isTriple = source.slice(i, i + 3) === quote + quote + quote;
      if (isTriple) {
        i += 3;
        while (i < len && source.slice(i, i + 3) !== quote + quote + quote) {
          if (source[i] === '\\') i++;
          i++;
        }
        if (i < len) i += 3;
      } else {
        i++;
        while (i < len && source[i] !== quote) {
          if (source[i] === '\\') i++;
          i++;
        }
        if (i < len) i++;
      }
      tokens.push({ type: 'string', value: source.slice(start, i), offset: start });
      continue;
    }

    // Multi-char punctuation
    if ((c === '=' && c2 === '>') || (c === '<' && c2 === '=') || (c === '>' && c2 === '=')) {
      tokens.push({ type: 'punct', value: source.slice(i, i + 2), offset: i });
      i += 2;
      continue;
    }

    // Single-char punctuation
    if (/[{}()[\];,.:?<>!=+\-*/%&|^~]/.test(c)) {
      tokens.push({ type: 'punct', value: c, offset: i });
      i++;
      continue;
    }

    // Identifiers or numbers
    if (/[a-zA-Z0-9_$]/.test(c)) {
      const start = i;
      while (i < len && /[a-zA-Z0-9_$]/.test(source[i])) {
        i++;
      }
      tokens.push({ type: 'word', value: source.slice(start, i), offset: start });
      continue;
    }

    tokens.push({ type: 'punct', value: c, offset: i });
    i++;
  }

  return tokens;
}

/**
 * Extracts parameter names from parameter string, e.g. "(String a, [int b = 1], {required double c})"
 */
export function parseParameters(paramsText: string): DartParameter[] {
  const result: DartParameter[] = [];
  const trimmed = paramsText.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return result;

  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return result;

  const parts: string[] = [];
  let parenDepth = 0;
  let angleDepth = 0;
  let current = '';

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;
    else if (ch === '<') angleDepth++;
    else if (ch === '>') angleDepth--;

    if (ch === ',' && parenDepth === 0 && angleDepth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }

  for (const rawPart of parts) {
    // Remove leading/trailing grouping brackets { } [ ]
    let clean = rawPart.replace(/^[{\[]/, '').replace(/[}\]]$/, '').trim();
    clean = clean.replace(/^required\s+/, '').trim();

    // Remove default values, e.g. '= 10' or ': 10'
    const eqIdx = clean.indexOf('=');
    if (eqIdx !== -1) clean = clean.slice(0, eqIdx).trim();

    // Split into words
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      let paramName = words[words.length - 1];
      if (paramName.startsWith('this.')) {
        paramName = paramName.replace('this.', '');
      }
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(paramName)) {
        result.push({
          name: paramName,
          type: words.length > 1 ? words.slice(0, -1).join(' ') : undefined,
        });
      }
    }
  }

  return result;
}

/**
 * Parses Dart source code and discovers candidate functions/methods for instrumentation.
 */
export function parseDartSource(source: string): DartFunction[] {
  const tokens = tokenize(source);
  const functions: DartFunction[] = [];

  // Filter out comments and whitespaces for structural parsing while keeping offsets
  const codeTokens = tokens.filter(t => t.type !== 'comment' && t.type !== 'ws');

  let currentClass: string | undefined = undefined;
  let classBraceDepth = 0;
  let currentBraceDepth = 0;

  for (let i = 0; i < codeTokens.length; i++) {
    const tok = codeTokens[i];

    if (tok.value === '{') {
      currentBraceDepth++;
      continue;
    }
    if (tok.value === '}') {
      if (currentClass && currentBraceDepth === classBraceDepth) {
        currentClass = undefined;
      }
      currentBraceDepth--;
      continue;
    }

    // Detect class declaration
    if (tok.value === 'class' || tok.value === 'mixin' || tok.value === 'extension') {
      const next = codeTokens[i + 1];
      if (next && next.type === 'word') {
        const nextClass = next.value;
        // Find opening '{'
        let j = i + 2;
        while (j < codeTokens.length && codeTokens[j].value !== '{') {
          j++;
        }
        if (j < codeTokens.length) {
          currentClass = nextClass;
          classBraceDepth = currentBraceDepth + 1;
        }
      }
      continue;
    }

    // We are looking for function/method declarations
    // Pattern: [ReturnType] <name> '(' <params> ')' [async/sync] ('=>' expr ';' | '{' body '}')
    if (tok.value === '(') {
      // Look back for method/function name
      const nameTok = codeTokens[i - 1];
      if (!nameTok || nameTok.type !== 'word') continue;

      const functionName = nameTok.value;

      // Skip keywords, constructors, getters/setters
      if (
        [
          'if', 'for', 'while', 'switch', 'catch', 'return', 'throw', 'assert',
          'case', 'class', 'mixin', 'extension', 'enum', 'typedef', 'import',
          'export', 'part', 'library', 'operator',
        ].includes(functionName)
      ) {
        continue;
      }

      // Check if previous token was 'get' or 'set' or 'factory'
      const prev2 = codeTokens[i - 2];
      if (prev2 && (prev2.value === 'get' || prev2.value === 'set' || prev2.value === 'factory')) {
        continue;
      }

      // Skip constructor (if function name equals class name)
      if (currentClass && functionName === currentClass) {
        continue;
      }

      // Check return type if exists
      let returnType: string | undefined = undefined;
      let startOffset = nameTok.offset;

      let typeEndIdx = i - 2;
      let hasNullable = false;
      if (typeEndIdx >= 0 && codeTokens[typeEndIdx].value === '?') {
        hasNullable = true;
        typeEndIdx--;
      }

      if (typeEndIdx >= 0 && codeTokens[typeEndIdx].value === '>') {
        let angleDepth = 1;
        let k = typeEndIdx - 1;
        while (k >= 0 && angleDepth > 0) {
          if (codeTokens[k].value === '>') angleDepth++;
          else if (codeTokens[k].value === '<') angleDepth--;
          k--;
        }
        if (angleDepth === 0 && k >= 0 && codeTokens[k].type === 'word') {
          const typeStartTok = codeTokens[k];
          const rawType = source.slice(typeStartTok.offset, codeTokens[typeEndIdx].offset + 1).trim();
          returnType = hasNullable ? `${rawType}?` : rawType;
          startOffset = typeStartTok.offset;
        }
      } else if (typeEndIdx >= 0 && codeTokens[typeEndIdx].type === 'word') {
        const word = codeTokens[typeEndIdx].value;
        if (word !== 'static' && word !== 'external' && word !== 'abstract') {
          returnType = hasNullable ? `${word}?` : word;
          startOffset = codeTokens[typeEndIdx].offset;
        }
      }

      // Find closing ')'
      let parenDepth = 1;
      let j = i + 1;
      const paramsStartOffset = tok.offset;

      while (j < codeTokens.length && parenDepth > 0) {
        if (codeTokens[j].value === '(') parenDepth++;
        else if (codeTokens[j].value === ')') parenDepth--;
        j++;
      }

      if (parenDepth !== 0) continue;
      const paramsEndOffset = codeTokens[j - 1].offset + 1;
      const paramsText = source.slice(paramsStartOffset, paramsEndOffset);
      const parameters = parseParameters(paramsText);

      // Check modifiers after ')'
      let isAsync = false;
      while (j < codeTokens.length && (codeTokens[j].value === 'async' || codeTokens[j].value === 'sync' || codeTokens[j].value === '*')) {
        if (codeTokens[j].value === 'async') isAsync = true;
        j++;
      }

      if (j >= codeTokens.length) continue;

      const bodyTok = codeTokens[j];

      // Case 1: Arrow function `=> <expr> ;`
      if (bodyTok.value === '=>') {
        const bodyStartOffset = bodyTok.offset;
        let k = j + 1;
        let exprDepth = 0;
        while (k < codeTokens.length) {
          const t = codeTokens[k];
          if (t.value === '(' || t.value === '{' || t.value === '[') exprDepth++;
          else if (t.value === ')' || t.value === '}' || t.value === ']') exprDepth--;
          else if (t.value === ';' && exprDepth === 0) {
            break;
          }
          k++;
        }
        if (k < codeTokens.length && codeTokens[k].value === ';') {
          const bodyEndOffset = codeTokens[k].offset + 1;
          const bodyContent = source.slice(bodyStartOffset, bodyEndOffset);
          const indent = getLineIndent(source, startOffset);

          functions.push({
            name: functionName,
            className: currentClass,
            returnType,
            parameters,
            isAsync,
            isArrow: true,
            isVoid: returnType === 'void',
            startOffset,
            bodyStartOffset,
            bodyEndOffset,
            bodyContent,
            indent,
          });
        }
      }
      // Case 2: Block function `{ <statements> }`
      else if (bodyTok.value === '{') {
        const bodyStartOffset = bodyTok.offset;
        let k = j + 1;
        let blockDepth = 1;
        while (k < codeTokens.length && blockDepth > 0) {
          if (codeTokens[k].value === '{') blockDepth++;
          else if (codeTokens[k].value === '}') blockDepth--;
          k++;
        }

        if (blockDepth === 0) {
          const bodyEndOffset = codeTokens[k - 1].offset + 1;
          const bodyContent = source.slice(bodyStartOffset, bodyEndOffset);
          const indent = getLineIndent(source, startOffset);

          functions.push({
            name: functionName,
            className: currentClass,
            returnType,
            parameters,
            isAsync,
            isArrow: false,
            isVoid: returnType === 'void',
            startOffset,
            bodyStartOffset,
            bodyEndOffset,
            bodyContent,
            indent,
          });
        }
      }
    }
  }

  return functions;
}

function getLineIndent(source: string, offset: number): string {
  let lineStart = offset;
  while (lineStart > 0 && source[lineStart - 1] !== '\n') {
    lineStart--;
  }
  const match = source.slice(lineStart, offset).match(/^(\s*)/);
  return match ? match[1] : '';
}
