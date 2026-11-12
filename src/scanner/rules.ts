export type Severity = 'warning' | 'error';

export interface Finding {
  line: number; // 0-based
  startCol: number;
  endCol: number;
  ruleId: string;
  message: string;
  severity: Severity;
}

export interface Rule {
  id: string;
  severity: Severity;
  checkLine(line: string, lineIndex: number): Finding[];
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

function runRegexOnLine(
  regex: RegExp,
  line: string,
  lineIndex: number,
  ruleId: string,
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
  severity: 'warning',
  checkLine(line: string, lineIndex: number): Finding[] {
    return runRegexOnLine(
      CONSOLE_LOG_REGEX,
      line,
      lineIndex,
      'console-log',
      'console.log found. Remove it before committing.',
      'warning'
    );
  }
};

export const debuggerRule: Rule = {
  id: 'debugger',
  severity: 'error',
  checkLine(line: string, lineIndex: number): Finding[] {
    return runRegexOnLine(
      DEBUGGER_REGEX,
      line,
      lineIndex,
      'debugger',
      'debugger statement found. Remove it before committing.',
      'error'
    );
  }
};

export const conflictMarkerRule: Rule = {
  id: 'conflict-marker',
  severity: 'error',
  checkLine(line: string, lineIndex: number): Finding[] {
    const isConflictMarker = CONFLICT_MARKER_REGEXES.some(regex => regex.test(line));
    if (isConflictMarker) {
      return [
        {
          line: lineIndex,
          startCol: 0,
          endCol: line.length,
          ruleId: 'conflict-marker',
          message: 'Merge conflict marker found. Resolve the conflict before committing.',
          severity: 'error'
        }
      ];
    }
    return [];
  }
};

export const secretRule: Rule = {
  id: 'secret',
  severity: 'error',
  checkLine(line: string, lineIndex: number): Finding[] {
    const findings: Finding[] = [];

    // 1. AWS access key
    const awsFindings = runRegexOnLine(
      AWS_ACCESS_KEY_REGEX,
      line,
      lineIndex,
      'secret',
      'AWS access key detected. Move secret to an environment variable.',
      'error'
    );
    findings.push(...awsFindings);

    // 2. Generic secret assignment
    const genericFindings = runRegexOnLine(
      GENERIC_SECRET_ASSIGNMENT_REGEX,
      line,
      lineIndex,
      'secret',
      'Potential secret detected in assignment. Move secret to an environment variable.',
      'error'
    );
    findings.push(...genericFindings);

    // 3. Hex secret assignment (32+ chars only in assignment)
    const hexFindings = runRegexOnLine(
      HEX_SECRET_ASSIGNMENT_REGEX,
      line,
      lineIndex,
      'secret',
      'Potential secret (hex string) detected in assignment. Move secret to an environment variable.',
      'error'
    );
    findings.push(...hexFindings);

    return findings;
  }
};

export const rules: Rule[] = [
  consoleLogRule,
  debuggerRule,
  conflictMarkerRule,
  secretRule
];
