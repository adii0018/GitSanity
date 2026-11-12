"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_IGNORES = void 0;
exports.isIgnored = isIgnored;
exports.DEFAULT_IGNORES = [
    'node_modules/',
    '.git/',
    'out/',
    'dist/',
    'build/',
    '*.min.js',
    '*.map',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '*.lock'
];
/**
 * Converts a glob-like pattern into a regular expression.
 */
function globToRegex(glob) {
    let reStr = '';
    let i = 0;
    while (i < glob.length) {
        const c = glob[i];
        if (c === '*' && glob[i + 1] === '*') {
            // '**/' matches zero or more path segments
            if (glob[i + 2] === '/') {
                reStr += '(?:.+/)?';
                i += 3;
            }
            else {
                // '**' matches across path segments
                reStr += '.*';
                i += 2;
            }
        }
        else if (c === '*') {
            // '*' matches within a path segment (no slashes)
            reStr += '[^/]*';
            i += 1;
        }
        else if (c === '?') {
            reStr += '[^/]';
            i += 1;
        }
        else if ('[\\^$.|+(){}'.includes(c)) {
            reStr += '\\' + c;
            i += 1;
        }
        else {
            reStr += c;
            i += 1;
        }
    }
    return new RegExp(`^${reStr}$`);
}
/**
 * Checks whether a single pattern matches a normalized relative path.
 */
function matchSinglePattern(relativePath, pattern) {
    if (!pattern) {
        return false;
    }
    // 1. Folder prefix match (e.g. 'tests/', 'node_modules/', 'src/tests/')
    if (pattern.endsWith('/')) {
        const folder = pattern.slice(0, -1);
        if (!folder.includes('/')) {
            // Matches at root or any depth: 'tests/...' or '.../tests/...'
            return (relativePath === folder ||
                relativePath.startsWith(folder + '/') ||
                relativePath.includes('/' + folder + '/') ||
                relativePath.endsWith('/' + folder));
        }
        // Specific path folder, e.g. 'src/tests/'
        return (relativePath === folder ||
            relativePath.startsWith(folder + '/') ||
            relativePath.includes('/' + folder + '/') ||
            relativePath.endsWith('/' + folder));
    }
    // 2. Pattern without slashes (e.g. '*.min.js', 'package-lock.json', '*.lock')
    // Should match against file basename or any directory segment
    if (!pattern.includes('/')) {
        const basename = relativePath.split('/').pop() || relativePath;
        if (!pattern.includes('*') && !pattern.includes('?')) {
            return basename === pattern || relativePath === pattern;
        }
        const regex = globToRegex(pattern);
        return regex.test(basename) || regex.test(relativePath);
    }
    // 3. General glob pattern with slashes (e.g. 'docs/**/*.md')
    const regex = globToRegex(pattern);
    if (regex.test(relativePath)) {
        return true;
    }
    // Also check if pattern matches with a leading wildcard if not rooted
    if (!pattern.startsWith('/') && !pattern.startsWith('**/')) {
        const looseRegex = globToRegex('**/' + pattern);
        if (looseRegex.test(relativePath)) {
            return true;
        }
    }
    return false;
}
/**
 * Returns true if the relativePath matches any user patterns or built-in default ignores.
 *
 * @param relativePath Relative path from the workspace folder root.
 * @param patterns User-defined ignore patterns from configuration.
 */
function isIgnored(relativePath, patterns = []) {
    if (!relativePath) {
        return false;
    }
    // Normalize path to forward slashes and strip leading/trailing slashes
    const normalizedPath = relativePath
        .replace(/\\/g, '/')
        .replace(/^(\.\/|\/)+/, '')
        .replace(/\/+$/, '');
    if (!normalizedPath) {
        return false;
    }
    const allPatterns = [...exports.DEFAULT_IGNORES, ...patterns];
    for (const rawPattern of allPatterns) {
        if (typeof rawPattern !== 'string') {
            continue;
        }
        const cleanPattern = rawPattern
            .trim()
            .replace(/\\/g, '/')
            .replace(/^(\.\/)+/, '');
        if (matchSinglePattern(normalizedPath, cleanPattern)) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=pathMatcher.js.map