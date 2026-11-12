import { Finding, rules } from './rules';

export { Finding, Severity, Rule } from './rules';

/**
 * Pure TypeScript scanner that parses text line by line and returns GitSanity findings.
 * Has zero vscode dependencies so it can be reused in non-VSCode contexts like CLI/Git hooks.
 * 
 * @param text The full text content to scan.
 * @returns An array of findings.
 */
export function scanText(text: string): Finding[] {
  if (!text) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  const findings: Finding[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    for (const rule of rules) {
      const lineFindings = rule.checkLine(line, lineIndex);
      findings.push(...lineFindings);
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
