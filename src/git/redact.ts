/**
 * Redacts secrets, tokens, and URL credentials to ensure sensitive data is never logged or exposed.
 */

export function redactValue(val: string): string {
  if (!val || val.length <= 3) {
    return '***';
  }
  return val.slice(0, 3) + '***';
}

/**
 * Masks GitHub tokens (ghp_*, gho_*, github_pat_*), URL credentials (https://user:pass@host),
 * and any provided secret strings.
 */
export function redact(text: string, secrets: string[] = []): string {
  if (!text) {
    return '';
  }

  let result = text;

  // 1. Redact provided secret values first
  for (const secret of secrets) {
    if (secret && typeof secret === 'string' && secret.length > 0) {
      // Escape for regex replacement
      const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'g');
      result = result.replace(re, redactValue(secret));
    }
  }

  // 2. Redact URL credentials: http(s)://user:password@host -> http(s)://***@host
  result = result.replace(
    /(https?:\/\/)[^/\s@]+(?::[^/\s@]*)?@/gi,
    '$1***@'
  );

  // 3. Redact GitHub personal access tokens: ghp_*, gho_*, github_pat_*
  result = result.replace(/\bghp_[A-Za-z0-9_]{10,}\b/g, (match) => match.slice(0, 4) + '***');
  result = result.replace(/\bgho_[A-Za-z0-9_]{10,}\b/g, (match) => match.slice(0, 4) + '***');
  result = result.replace(/\bgithub_pat_[A-Za-z0-9_]{10,}\b/g, (match) => match.slice(0, 11) + '***');

  return result;
}
