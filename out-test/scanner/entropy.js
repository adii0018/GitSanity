"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shannonEntropy = shannonEntropy;
exports.findHighEntropyCandidates = findHighEntropyCandidates;
const rules_1 = require("./rules");
function shannonEntropy(s) {
    if (!s || s.length === 0) {
        return 0;
    }
    const frequencies = new Map();
    for (let i = 0; i < s.length; i++) {
        const char = s[i];
        frequencies.set(char, (frequencies.get(char) || 0) + 1);
    }
    const len = s.length;
    let entropy = 0;
    for (const count of frequencies.values()) {
        const p = count / len;
        entropy -= p * Math.log2(p);
    }
    return entropy;
}
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SEMVER_REGEX = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const BARE_HEX_REGEX = /^[0-9a-fA-F]+$/;
const PURE_LETTERS_REGEX = /^[A-Za-z]+$/;
/**
 * Finds high-entropy string candidates inside string literals on a line.
 */
function findHighEntropyCandidates(line, entropyThreshold, entropyMinLength) {
    const candidates = [];
    // Matches string literals bounded by ', ", or `
    const stringLiteralRegex = /(["'`])((?:\\.|(?!\1)[^\r\n])*)\1/g;
    let match;
    while ((match = stringLiteralRegex.exec(line)) !== null) {
        const quote = match[1];
        const quoteStart = match.index;
        const quoteEnd = match.index + match[0].length;
        const content = match[2];
        // Search for candidates matching /[A-Za-z0-9+/=_-]{N,}/ inside the string content
        const candidateRegex = new RegExp(`[A-Za-z0-9+/=_-]{${entropyMinLength},}`, 'g');
        let candMatch;
        while ((candMatch = candidateRegex.exec(content)) !== null) {
            const candidate = candMatch[0];
            // 1. Minimum length and entropy check
            if (candidate.length < entropyMinLength) {
                continue;
            }
            const entropy = shannonEntropy(candidate);
            if (entropy < entropyThreshold) {
                continue;
            }
            // 2. Must contain both letters and digits
            if (!/[A-Za-z]/.test(candidate) || !/[0-9]/.test(candidate)) {
                continue;
            }
            // 3. Must NOT be purely letters (e.g. camelCase identifiers)
            if (PURE_LETTERS_REGEX.test(candidate)) {
                continue;
            }
            // 4. Must NOT be a URL
            if (candidate.includes('://') ||
                /^https?:/i.test(candidate) ||
                /^ftp:/i.test(candidate) ||
                line.includes('http://') ||
                line.includes('https://')) {
                continue;
            }
            // 5. Must NOT be a UUID
            if (UUID_REGEX.test(candidate)) {
                continue;
            }
            // 6. Must NOT be a semver string
            if (SEMVER_REGEX.test(candidate)) {
                continue;
            }
            // 7. Must NOT be a bare hex string (hex hashes are not flagged anywhere)
            if (BARE_HEX_REGEX.test(candidate)) {
                continue;
            }
            // Populate meta ONLY when the whole string literal is the secret
            let meta;
            const isTemplateWithInterpolation = quote === '`' && content.includes('${');
            if (!isTemplateWithInterpolation && content === candidate) {
                const keyName = (0, rules_1.findAssignmentKey)(line, quoteStart);
                meta = {
                    value: candidate,
                    keyName,
                    literalStartCol: quoteStart,
                    literalEndCol: quoteEnd,
                    quote
                };
            }
            candidates.push({
                startCol: quoteStart,
                endCol: quoteEnd,
                candidate,
                meta
            });
        }
        if (match.index === stringLiteralRegex.lastIndex) {
            stringLiteralRegex.lastIndex++;
        }
    }
    return candidates;
}
//# sourceMappingURL=entropy.js.map