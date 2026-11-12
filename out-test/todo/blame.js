"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBlamePorcelain = parseBlamePorcelain;
/**
 * Parses output from `git blame --line-porcelain`.
 * Returns a map of final line numbers (1-based) to author timestamp and commit hash.
 * Uncommitted lines (commit hash of all 0s) are ignored.
 */
function parseBlamePorcelain(output) {
    const result = new Map();
    if (!output || !output.trim()) {
        return result;
    }
    const lines = output.split(/\r?\n/);
    let currentCommit = '';
    let currentFinalLine = 0;
    let currentAuthorTime = 0;
    for (const line of lines) {
        if (!line)
            continue;
        // Check header line: <40-hex-commit> <orig-line> <final-line> [num-lines]
        const headerMatch = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
        if (headerMatch) {
            currentCommit = headerMatch[1];
            currentFinalLine = parseInt(headerMatch[2], 10);
            currentAuthorTime = 0;
            continue;
        }
        if (line.startsWith('author-time ')) {
            const timeStr = line.substring('author-time '.length).trim();
            currentAuthorTime = parseInt(timeStr, 10);
            continue;
        }
        // Content line starts with a tab character '\t'
        if (line.startsWith('\t')) {
            if (currentFinalLine > 0 &&
                currentAuthorTime > 0 &&
                !/^0{40}$/.test(currentCommit)) {
                result.set(currentFinalLine, {
                    authorTime: currentAuthorTime,
                    commit: currentCommit
                });
            }
            currentFinalLine = 0;
            currentAuthorTime = 0;
        }
    }
    return result;
}
//# sourceMappingURL=blame.js.map