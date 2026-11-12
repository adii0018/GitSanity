"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEnvIgnored = isEnvIgnored;
exports.addEnvToGitignore = addEnvToGitignore;
/**
 * Checks whether a glob pattern matches an env file name.
 * Specifically prevents wildcard patterns from marking .env.example as ignored.
 */
function patternMatchesEnvFile(pattern, fileName) {
    const p = pattern.trim().replace(/^(\.\/|\/)+/, '').replace(/\/+$/, '');
    const target = fileName.trim().replace(/^(\.\/|\/)+/, '').replace(/\/+$/, '');
    if (p === target) {
        return true;
    }
    // Do not treat .env.example as ignored just because a wildcard appears
    if (target.endsWith('.example')) {
        return false;
    }
    const regexStr = p
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(target);
}
/**
 * Returns true if the gitignore text ignores the given env file name.
 * Takes into account exact matches, wildcards (/.env, .env*, *.env),
 * ignores comments, and respects later negation lines (!.env).
 */
function isEnvIgnored(gitignoreText, envFileName) {
    if (!gitignoreText || !envFileName) {
        return false;
    }
    let ignored = false;
    const lines = gitignoreText.split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }
        if (line.startsWith('!')) {
            const negationPattern = line.slice(1).trim();
            if (patternMatchesEnvFile(negationPattern, envFileName)) {
                ignored = false;
            }
        }
        else {
            if (patternMatchesEnvFile(line, envFileName)) {
                ignored = true;
            }
        }
    }
    return ignored;
}
/**
 * Appends the env file name on its own line to gitignore text.
 * If the file had other content, prepends a "# Environment variables" comment.
 * Preserves EOL style, trailing newline, and is idempotent if already ignored.
 */
function addEnvToGitignore(gitignoreText, envFileName) {
    if (isEnvIgnored(gitignoreText, envFileName)) {
        return gitignoreText;
    }
    const eol = gitignoreText.includes('\r\n') ? '\r\n' : '\n';
    const hasOtherContent = gitignoreText.trim().length > 0;
    if (!hasOtherContent) {
        return `${envFileName}${eol}`;
    }
    const base = gitignoreText.endsWith('\n') ? gitignoreText : `${gitignoreText}${eol}`;
    return `${base}# Environment variables${eol}${envFileName}${eol}`;
}
//# sourceMappingURL=gitignoreFile.js.map