export const HOOK_START_MARKER = '# >>> GitSanity >>>';
export const HOOK_END_MARKER = '# <<< GitSanity <<<';

export const HOOK_PAYLOAD = [
  HOOK_START_MARKER,
  'if command -v node >/dev/null 2>&1; then',
  '  node "$(git rev-parse --git-common-dir)/gitsanity/pre-commit.js" || exit 1',
  'else',
  '  echo "GitSanity: node not found on PATH, skipping check."',
  'fi',
  HOOK_END_MARKER
];

export function isHookInstalled(text: string): boolean {
  if (!text) {
    return false;
  }
  return text.includes(HOOK_START_MARKER) && text.includes(HOOK_END_MARKER);
}

/**
 * Installs or updates the GitSanity hook marker block in a pre-commit script.
 * Returns the modified script content, or throws an error if an incompatible shebang is detected.
 */
export function installHookBlock(existing: string | undefined): string {
  if (!existing || existing.trim().length === 0) {
    return `#!/bin/sh\n\n${HOOK_PAYLOAD.join('\n')}\n`;
  }

  // Shell scripts must always use LF (\n) line endings, even on Windows
  const normalized = existing.replace(/\r\n/g, '\n');
  const payloadStr = HOOK_PAYLOAD.join('\n');

  // If markers already exist, replace the block idempotently
  if (isHookInstalled(normalized)) {
    const startIndex = normalized.indexOf(HOOK_START_MARKER);
    const endIndex = normalized.indexOf(HOOK_END_MARKER) + HOOK_END_MARKER.length;
    const before = normalized.slice(0, startIndex);
    const after = normalized.slice(endIndex);
    return before + payloadStr + after;
  }

  // Check shebang compatibility
  const firstLine = normalized.split('\n')[0].trim();
  if (firstLine.startsWith('#!')) {
    const isShOrBash =
      firstLine.includes('sh') ||
      firstLine.includes('bash') ||
      firstLine.includes('dash');
    if (!isShOrBash) {
      throw new Error(
        `Existing pre-commit hook uses an unsupported interpreter (${firstLine}). GitSanity hook requires sh/bash.`
      );
    }
  }

  const base = normalized.endsWith('\n') ? normalized : normalized + '\n';
  return `${base}\n${payloadStr}\n`;
}

/**
 * Removes the GitSanity hook block from a pre-commit script.
 * Returns undefined if only shebang / whitespace remains, indicating the file can be safely deleted.
 */
export function removeHookBlock(existing: string): string | undefined {
  if (!existing || !isHookInstalled(existing)) {
    return existing;
  }

  const startIndex = existing.indexOf(HOOK_START_MARKER);
  const endIndex = existing.indexOf(HOOK_END_MARKER) + HOOK_END_MARKER.length;

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
