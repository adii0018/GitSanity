"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HOOK_PAYLOAD = exports.HOOK_END_MARKER = exports.HOOK_START_MARKER = void 0;
exports.isHookInstalled = isHookInstalled;
exports.installHookBlock = installHookBlock;
exports.removeHookBlock = removeHookBlock;
exports.HOOK_START_MARKER = '# >>> GitSanity >>>';
exports.HOOK_END_MARKER = '# <<< GitSanity <<<';
exports.HOOK_PAYLOAD = [
    exports.HOOK_START_MARKER,
    'if command -v node >/dev/null 2>&1; then',
    '  node "$(git rev-parse --git-common-dir)/gitsanity/pre-commit.js" || exit 1',
    'else',
    '  echo "GitSanity: node not found on PATH, skipping check."',
    'fi',
    exports.HOOK_END_MARKER
];
function isHookInstalled(text) {
    if (!text) {
        return false;
    }
    return text.includes(exports.HOOK_START_MARKER) && text.includes(exports.HOOK_END_MARKER);
}
/**
 * Installs or updates the GitSanity hook marker block in a pre-commit script.
 * Returns the modified script content, or throws an error if an incompatible shebang is detected.
 */
function installHookBlock(existing) {
    if (!existing || existing.trim().length === 0) {
        return `#!/bin/sh\n\n${exports.HOOK_PAYLOAD.join('\n')}\n`;
    }
    // Shell scripts must always use LF (\n) line endings, even on Windows
    const normalized = existing.replace(/\r\n/g, '\n');
    const payloadStr = exports.HOOK_PAYLOAD.join('\n');
    // If markers already exist, replace the block idempotently
    if (isHookInstalled(normalized)) {
        const startIndex = normalized.indexOf(exports.HOOK_START_MARKER);
        const endIndex = normalized.indexOf(exports.HOOK_END_MARKER) + exports.HOOK_END_MARKER.length;
        const before = normalized.slice(0, startIndex);
        const after = normalized.slice(endIndex);
        return before + payloadStr + after;
    }
    // Check shebang compatibility
    const firstLine = normalized.split('\n')[0].trim();
    if (firstLine.startsWith('#!')) {
        const isShOrBash = firstLine.includes('sh') ||
            firstLine.includes('bash') ||
            firstLine.includes('dash');
        if (!isShOrBash) {
            throw new Error(`Existing pre-commit hook uses an unsupported interpreter (${firstLine}). GitSanity hook requires sh/bash.`);
        }
    }
    const base = normalized.endsWith('\n') ? normalized : normalized + '\n';
    return `${base}\n${payloadStr}\n`;
}
/**
 * Removes the GitSanity hook block from a pre-commit script.
 * Returns undefined if only shebang / whitespace remains, indicating the file can be safely deleted.
 */
function removeHookBlock(existing) {
    if (!existing || !isHookInstalled(existing)) {
        return existing;
    }
    const startIndex = existing.indexOf(exports.HOOK_START_MARKER);
    const endIndex = existing.indexOf(exports.HOOK_END_MARKER) + exports.HOOK_END_MARKER.length;
    let before = existing.slice(0, startIndex);
    let after = existing.slice(endIndex);
    // Clean trailing empty lines from before and leading empty lines from after
    before = before.replace(/\r?\n\s*$/, '');
    after = after.replace(/^\s*\r?\n/, '');
    let combined = before ? `${before}\n${after}` : after;
    combined = combined.trim();
    // If empty or only shebang left
    if (!combined) {
        return undefined;
    }
    const lines = combined.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 1 && lines[0].startsWith('#!')) {
        return undefined;
    }
    const eol = existing.includes('\r\n') ? '\r\n' : '\n';
    return combined + eol;
}
//# sourceMappingURL=hookText.js.map