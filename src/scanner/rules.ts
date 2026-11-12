import { RuleId } from '../config/configSchema';

export type Severity = 'warning' | 'error';

export interface FindingMeta {
  value: string;
  keyName?: string;
  literalStartCol: number;
  literalEndCol: number;
  quote?: string;
}

export interface Finding {
  line: number; // 0-based
  startCol: number;
  endCol: number;
  ruleId: RuleId;
  message: string;
  severity: Severity;
  meta?: FindingMeta;
}

export interface Rule {
  id: RuleId;
  checkLine(line: string, lineIndex: number, severity: Severity): Finding[];
}

// Regex for console.log
const CONSOLE_LOG_REGEX = /\bconsole\.log\s*\(/g;

// Regex for debugger
const DEBUGGER_REGEX = /\bdebugger\b\s*;?/g;

// Regex for merge conflict markers (match ONLY at start of line)
const CONFLICT_MARKER_REGEXES = [
  /^<{7}(\s.*)?$/,
  /^={7}$/,
  /^>{7}(\s.*)?$/
];

// Regexes for secrets
const AWS_ACCESS_KEY_REGEX = /\bAKIA[0-9A-Z]{16}\b/g;
const GENERIC_SECRET_ASSIGNMENT_REGEX = /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/gi;
const HEX_SECRET_ASSIGNMENT_REGEX = /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*(?:["'][a-f0-9]{32,}["']|[a-f0-9]{32,}\b)/gi;

export function findAssignmentKey(line: string, col: number): string | undefined {
  const before = line.slice(0, col);
  const match = before.match(/([a-zA-Z_$][a-zA-Z0-9_$-]*)\s*[:=]\s*$/);
  return match ? match[1] : undefined;
}

interface StringLiteralSpan {
  startCol: number;
  endCol: number;
  quote: string;
  content: string;
  hasInterpolation: boolean;
}

function findStringLiterals(line: string): StringLiteralSpan[] {
  const spans: StringLiteralSpan[] = [];
  const regex = /(["'`])((?:\\.|(?!\1)[^\r\n])*)\1/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    const quote = match[1];
    const content = match[2];
    spans.push({
      startCol: match.index,
      endCol: match.index + match[0].length,
      quote,
      content,
      hasInterpolation: quote === '`' && content.includes('${')
    });

    if (match.index === regex.lastIndex) {
      regex.lastIndex++;
    }
  }

  return spans;
}

function runRegexOnLine(
  regex: RegExp,
  line: string,
  lineIndex: number,
  ruleId: RuleId,
  message: string,
  severity: Severity
): Finding[] {
  const findings: Finding[] = [];
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    findings.push({
      line: lineIndex,
      startCol: match.index,
      endCol: match.index + match[0].length,
      ruleId,
      message,
      severity
    });

    if (match.index === re.lastIndex) {
      re.lastIndex++;
    }
  }

  return findings;
}

export const consoleLogRule: Rule = {
  id: 'console-log',
  checkLine(line: string, lineIndex: number, severity: Severity): Finding[] {
    return runRegexOnLine(
      CONSOLE_LOG_REGEX,
      line,
      lineIndex,
      'console-log',
      'console.log found. Remove it before committing.',
      severity
    );
  }
};

export const debuggerRule: Rule = {
  id: 'debugger',
  checkLine(line: string, lineIndex: number, severity: Severity): Finding[] {
    return runRegexOnLine(
      DEBUGGER_REGEX,
      line,
      lineIndex,
      'debugger',
      'debugger statement found. Remove it before committing.',
      severity
    );
  }
};

export const conflictMarkerRule: Rule = {
  id: 'conflict-marker',
  checkLine(line: string, lineIndex: number, severity: Severity): Finding[] {
    const isConflictMarker = CONFLICT_MARKER_REGEXES.some(regex => regex.test(line));
    if (isConflictMarker) {
      return [
        {
          line: lineIndex,
          startCol: 0,
          endCol: line.length,
          ruleId: 'conflict-marker',
          message: 'Merge conflict marker found. Resolve the conflict before committing.',
          severity
        }
      ];
    }
    return [];
  }
};

export const secretRule: Rule = {
  id: 'secret',
  checkLine(line: string, lineIndex: number, severity: Severity): Finding[] {
    const findings: Finding[] = [];
    const literals = findStringLiterals(line);

    // 1. AWS access key
    const awsRe = new RegExp(AWS_ACCESS_KEY_REGEX.source, 'g');
    let awsMatch: RegExpExecArray | null;
    while ((awsMatch = awsRe.exec(line)) !== null) {
      const startCol = awsMatch.index;
      const endCol = awsMatch.index + awsMatch[0].length;
      const val = awsMatch[0];

      let meta: FindingMeta | undefined;
      const lit = literals.find(l => l.startCol <= startCol && endCol <= l.endCol);

      if (lit) {
        // Enclosed in quotes
        if (!lit.hasInterpolation && lit.content === val) {
          const keyName = findAssignmentKey(line, lit.startCol) || 'AWS_ACCESS_KEY_ID';
          meta = {
            value: val,
            keyName,
            literalStartCol: lit.startCol,
            literalEndCol: lit.endCol,
            quote: lit.quote
          };
        }
      } else {
        // Bare token
        const keyName = findAssignmentKey(line, startCol) || 'AWS_ACCESS_KEY_ID';
        meta = {
          value: val,
          keyName,
          literalStartCol: startCol,
          literalEndCol: endCol
        };
      }

      findings.push({
        line: lineIndex,
        startCol,
        endCol,
        ruleId: 'secret',
        message: 'AWS access key detected. Move secret to an environment variable.',
        severity,
        meta
      });

      if (awsMatch.index === awsRe.lastIndex) {
        awsRe.lastIndex++;
      }
    }

    // 2. Generic secret assignment
    const genRe = new RegExp(
      /(api[_-]?key|secret|token|password|passwd)\s*[:=]\s*(["'])([A-Za-z0-9_\-]{16,})\2/gi
    );
    let genMatch: RegExpExecArray | null;
    while ((genMatch = genRe.exec(line)) !== null) {
      const startCol = genMatch.index;
      const endCol = genMatch.index + genMatch[0].length;
      const keyName = findAssignmentKey(line, startCol) || genMatch[1];
      const quote = genMatch[2];
      const val = genMatch[3];

      // Find literal span for this matched value
      const quoteStart = line.indexOf(quote + val + quote, startCol);
      const literalStartCol = quoteStart !== -1 ? quoteStart : startCol;
      const literalEndCol = quoteStart !== -1 ? quoteStart + val.length + 2 : endCol;

      const meta: FindingMeta = {
        value: val,
        keyName,
        literalStartCol,
        literalEndCol,
        quote
      };

      findings.push({
        line: lineIndex,
        startCol,
        endCol,
        ruleId: 'secret',
        message: 'Potential secret detected in assignment. Move secret to an environment variable.',
        severity,
        meta
      });

      if (genMatch.index === genRe.lastIndex) {
        genRe.lastIndex++;
      }
    }

    // 3. Hex secret assignment (32+ chars only in assignment)
    const hexRe = new RegExp(
      /(api[_-]?key|secret|token|password|passwd)\s*[:=]\s*(?:(["'])([a-f0-9]{32,})\2|([a-f0-9]{32,})\b)/gi
    );
    let hexMatch: RegExpExecArray | null;
    while ((hexMatch = hexRe.exec(line)) !== null) {
      const startCol = hexMatch.index;
      const endCol = hexMatch.index + hexMatch[0].length;
      const keyName = findAssignmentKey(line, startCol) || hexMatch[1];
      const quote = hexMatch[2];
      const quotedVal = hexMatch[3];
      const unquotedVal = hexMatch[4];
      const val = quotedVal || unquotedVal;

      let meta: FindingMeta | undefined;
      if (quote && quotedVal) {
        const quoteStart = line.indexOf(quote + quotedVal + quote, startCol);
        meta = {
          value: quotedVal,
          keyName,
          literalStartCol: quoteStart !== -1 ? quoteStart : startCol,
          literalEndCol: quoteStart !== -1 ? quoteStart + quotedVal.length + 2 : endCol,
          quote
        };
      } else if (unquotedVal) {
        const tokenStart = line.indexOf(unquotedVal, startCol);
        meta = {
          value: unquotedVal,
          keyName,
          literalStartCol: tokenStart !== -1 ? tokenStart : startCol,
          literalEndCol: tokenStart !== -1 ? tokenStart + unquotedVal.length : endCol
        };
      }

      findings.push({
        line: lineIndex,
        startCol,
        endCol,
        ruleId: 'secret',
        message: 'Potential secret (hex string) detected in assignment. Move secret to an environment variable.',
        severity,
        meta
      });

      if (hexMatch.index === hexRe.lastIndex) {
        hexRe.lastIndex++;
      }
    }

    return findings;
  }
};

export const standardRules: Rule[] = [
  consoleLogRule,
  debuggerRule,
  conflictMarkerRule,
  secretRule
];
