"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanText = scanText;
exports.isLineIgnoredForRule = isLineIgnoredForRule;
const configSchema_1 = require("../config/configSchema");
const rules_1 = require("./rules");
const entropy_1 = require("./entropy");
function parseIgnoreRules(followingText) {
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
    const matchedRules = tokens.filter(t => configSchema_1.KNOWN_RULE_IDS.includes(t));
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
function scanText(text, options) {
    if (!text) {
        return [];
    }
    // Strip leading UTF-8 BOM if present
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
    }
    const lines = text.split(/\r?\n/);
    // 1. File-level ignore: if found in the first 10 lines, return zero findings
    const first10Lines = lines.slice(0, 10);
    if (first10Lines.some(l => /\bgitsanity-ignore-file\b/.test(l))) {
        return [];
    }
    const ruleSettings = {
        ...configSchema_1.DEFAULT_CONFIG.rules,
        ...(options?.rules || {})
    };
    const entropyThreshold = options?.entropyThreshold ?? configSchema_1.DEFAULT_CONFIG.entropyThreshold;
    const entropyMinLength = options?.entropyMinLength ?? configSchema_1.DEFAULT_CONFIG.entropyMinLength;
    const findings = [];
    let pendingNextLineIgnores = [];
    let inConflictBlock = false;
    const MAX_LINE_SCAN_LENGTH = 5000;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const rawLine = lines[lineIndex];
        const prevLine = lineIndex > 0 ? lines[lineIndex - 1] : undefined;
        // Cap line length to prevent ReDoS on massive/minified lines
        const line = rawLine.length > MAX_LINE_SCAN_LENGTH ? rawLine.slice(0, MAX_LINE_SCAN_LENGTH) : rawLine;
        // Track merge conflict block
        if (/^<{7}(\s.*)?$/.test(line)) {
            inConflictBlock = true;
        }
        const context = {
            inConflictBlock,
            prevLine
        };
        // Ignores active for this line (from previous next-line directives)
        const activeIgnoresForLine = [...pendingNextLineIgnores];
        pendingNextLineIgnores = [];
        // Track directive ranges on this line so directive syntax (like rule names) is not flagged
        const directiveRanges = [];
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
        if (sameLineMatch &&
            sameLineMatch.index !== undefined &&
            !/\bgitsanity-ignore-next-line\b/.test(line) &&
            !/\bgitsanity-ignore-file\b/.test(line)) {
            directiveRanges.push({
                start: sameLineMatch.index,
                end: sameLineMatch.index + sameLineMatch[0].length
            });
            const rules = parseIgnoreRules(sameLineMatch[1]);
            activeIgnoresForLine.push(rules);
        }
        const isInsideDirective = (f) => {
            return directiveRanges.some(r => f.startCol >= r.start && f.endCol <= r.end);
        };
        const isRuleIgnored = (ruleId) => {
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
        for (const rule of rules_1.standardRules) {
            const setting = ruleSettings[rule.id];
            if (setting === 'off') {
                continue;
            }
            if (isRuleIgnored(rule.id)) {
                continue;
            }
            const severity = setting === 'error' ? 'error' : 'warning';
            const rawRuleFindings = rule.checkLine(line, lineIndex, severity, context);
            const ruleFindings = rawRuleFindings.filter(f => !isInsideDirective(f));
            if (rule.id === 'secret' && ruleFindings.length > 0) {
                hasSecretOnLine = true;
            }
            findings.push(...ruleFindings);
        }
        if (/^>{7}(\s.*)?$/.test(line)) {
            inConflictBlock = false;
        }
        // Check high-entropy-string rule (only if line was not already flagged by secret)
        const entropySetting = ruleSettings['high-entropy-string'];
        if (entropySetting !== 'off' && !isRuleIgnored('high-entropy-string') && !hasSecretOnLine) {
            const severity = entropySetting === 'error' ? 'error' : 'warning';
            const candidates = (0, entropy_1.findHighEntropyCandidates)(line, entropyThreshold, entropyMinLength);
            for (const cand of candidates) {
                const finding = {
                    line: lineIndex,
                    startCol: cand.startCol,
                    endCol: cand.endCol,
                    ruleId: 'high-entropy-string',
                    message: 'High-entropy string found. It may be a secret. Move it to an environment variable.',
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
    const seen = new Set();
    const uniqueFindings = [];
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
/**
 * Checks whether a given line is ignored for a specific ruleId via file-level or inline directives.
 */
function isLineIgnoredForRule(lines, lineIndex, ruleId) {
    if (lines.slice(0, 10).some((l) => /\bgitsanity-ignore-file\b/.test(l))) {
        return true;
    }
    // Check previous line for ignore-next-line
    if (lineIndex > 0) {
        const prevLine = lines[lineIndex - 1];
        const nextLineMatch = prevLine.match(/\bgitsanity-ignore-next-line(?:\s+([^\r\n]*))?/);
        if (nextLineMatch) {
            const parsed = parseIgnoreRules(nextLineMatch[1]);
            if (parsed === 'all' || parsed.has(ruleId)) {
                return true;
            }
        }
    }
    // Check current line for ignore
    if (lineIndex >= 0 && lineIndex < lines.length) {
        const currLine = lines[lineIndex];
        const sameLineMatch = currLine.match(/\bgitsanity-ignore(?:\s+([^\r\n]*))?/);
        if (sameLineMatch &&
            !/\bgitsanity-ignore-next-line\b/.test(currLine) &&
            !/\bgitsanity-ignore-file\b/.test(currLine)) {
            const parsed = parseIgnoreRules(sameLineMatch[1]);
            if (parsed === 'all' || parsed.has(ruleId)) {
                return true;
            }
        }
    }
    return false;
}
//# sourceMappingURL=scanner.js.map