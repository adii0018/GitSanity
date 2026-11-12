import { RuleId, KNOWN_RULE_IDS, DEFAULT_CONFIG } from '../config/configSchema';
import { Finding, FindingMeta, Severity, standardRules } from './rules';
import { findHighEntropyCandidates } from './entropy';

export { Finding, FindingMeta, Severity, Rule } from './rules';

export interface ScanOptions {
  rules?: Partial<Record<RuleId, 'off' | 'warn' | 'error'>>;
  entropyThreshold?: number;
  entropyMinLength?: number;
}

function parseIgnoreRules(followingText: string | undefined): Set<RuleId> | 'all' {
  if (!followingText) {
    return 'all';
  }

  // Strip trailing comment terminators like --> or */
  const cleaned = followingText
    .replace(/-->.*$/, '')
    .replace(/\*\/.*$/, '')
    .trim();

  if (!cleaned) {
    return 'all';
  }

  // Split by comma or whitespace
  const tokens = cleaned.split(/[\s,]+/).filter(t => t.length > 0);
  if (tokens.length === 0) {
    return 'all';
  }

  const matchedRules = tokens.filter(t => KNOWN_RULE_IDS.includes(t as RuleId)) as RuleId[];
  // If none of the listed words is a known rule id, treat it as ignore-all
  if (matchedRules.length === 0) {
    return 'all';
  }

  return new Set(matchedRules);
}

/**
 * Pure TypeScript scanner that parses text line by line and returns GitSanity findings.
 * Has zero vscode dependencies so it can be reused in non-VSCode contexts like CLI/Git hooks.
 * 
 * @param text The full text content to scan.
 * @param options Configurable options for rules, entropy threshold, and minimum length.
 * @returns An array of findings.
 */
export function scanText(text: string, options?: ScanOptions): Finding[] {
  if (!text) {
    return [];
  }

  const lines = text.split(/\r?\n/);

  // 1. File-level ignore: if found in the first 10 lines, return zero findings
  const first10Lines = lines.slice(0, 10);
  if (first10Lines.some(l => /\bgitsanity-ignore-file\b/.test(l))) {
    return [];
  }

  const ruleSettings = {
    ...DEFAULT_CONFIG.rules,
    ...(options?.rules || {})
  };

  const entropyThreshold = options?.entropyThreshold ?? DEFAULT_CONFIG.entropyThreshold;
  const entropyMinLength = options?.entropyMinLength ?? DEFAULT_CONFIG.entropyMinLength;

  const findings: Finding[] = [];
  let pendingNextLineIgnores: (Set<RuleId> | 'all')[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    // Ignores active for this line (from previous next-line directives)
    const activeIgnoresForLine = [...pendingNextLineIgnores];
    pendingNextLineIgnores = [];

    // Track directive ranges on this line so directive syntax (like rule names) is not flagged
    const directiveRanges: { start: number; end: number }[] = [];

    // Check for next-line directive on this line
    const nextLineMatch = line.match(/\bgitsanity-ignore-next-line(?:\s+([^\r\n]*))?/);
    if (nextLineMatch && nextLineMatch.index !== undefined) {
      directiveRanges.push({
        start: nextLineMatch.index,
        end: nextLineMatch.index + nextLineMatch[0].length
      });
      const rules = parseIgnoreRules(nextLineMatch[1]);
      pendingNextLineIgnores.push(rules);
    }

    // Check for same-line directive on this line
    const sameLineMatch = line.match(/\bgitsanity-ignore(?:\s+([^\r\n]*))?/);
    if (
      sameLineMatch &&
      sameLineMatch.index !== undefined &&
      !/\bgitsanity-ignore-next-line\b/.test(line) &&
      !/\bgitsanity-ignore-file\b/.test(line)
    ) {
      directiveRanges.push({
        start: sameLineMatch.index,
        end: sameLineMatch.index + sameLineMatch[0].length
      });
      const rules = parseIgnoreRules(sameLineMatch[1]);
      activeIgnoresForLine.push(rules);
    }

    const isInsideDirective = (f: Finding): boolean => {
      return directiveRanges.some(r => f.startCol >= r.start && f.endCol <= r.end);
    };

    const isRuleIgnored = (ruleId: RuleId): boolean => {
      for (const ignore of activeIgnoresForLine) {
        if (ignore === 'all') {
          return true;
        }
        if (ignore.has(ruleId)) {
          return true;
        }
      }
      return false;
    };

    let hasSecretOnLine = false;

    // Check standard rules
    for (const rule of standardRules) {
      const setting = ruleSettings[rule.id];
      if (setting === 'off') {
        continue;
      }
      if (isRuleIgnored(rule.id)) {
        continue;
      }

      const severity: Severity = setting === 'error' ? 'error' : 'warning';
      const rawRuleFindings = rule.checkLine(line, lineIndex, severity);
      const ruleFindings = rawRuleFindings.filter(f => !isInsideDirective(f));

      if (rule.id === 'secret' && ruleFindings.length > 0) {
        hasSecretOnLine = true;
      }

      findings.push(...ruleFindings);
    }

    // Check high-entropy-string rule (only if line was not already flagged by secret)
    const entropySetting = ruleSettings['high-entropy-string'];
    if (entropySetting !== 'off' && !isRuleIgnored('high-entropy-string') && !hasSecretOnLine) {
      const severity: Severity = entropySetting === 'error' ? 'error' : 'warning';
      const candidates = findHighEntropyCandidates(line, entropyThreshold, entropyMinLength);

      for (const cand of candidates) {
        const finding: Finding = {
          line: lineIndex,
          startCol: cand.startCol,
          endCol: cand.endCol,
          ruleId: 'high-entropy-string',
          message:
            'High-entropy string found. It may be a secret. Move it to an environment variable.',
          severity,
          meta: cand.meta
        };
        if (!isInsideDirective(finding)) {
          findings.push(finding);
        }
      }
    }
  }

  // Deduplicate exact duplicate findings (same line, startCol, endCol, ruleId)
  const seen = new Set<string>();
  const uniqueFindings: Finding[] = [];

  for (const finding of findings) {
    const key = `${finding.line}:${finding.startCol}:${finding.endCol}:${finding.ruleId}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueFindings.push(finding);
    }
  }

  // Sort findings by line, then startCol
  uniqueFindings.sort((a, b) => {
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    return a.startCol - b.startCol;
  });

  return uniqueFindings;
}
