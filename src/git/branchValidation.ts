/**
 * Validates branch names according to standard Git ref naming rules.
 * Pure TypeScript logic with zero vscode runtime dependencies.
 */
export function validateBranchName(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Branch name cannot be empty.';
  }
  if (/\s/.test(trimmed)) {
    return 'Branch name cannot contain spaces. Use hyphens or slashes (e.g., feature/add-login).';
  }
  if (trimmed.startsWith('/') || trimmed.endsWith('/')) {
    return 'Branch name cannot start or end with a slash.';
  }
  if (trimmed.includes('..') || trimmed.includes('@{') || trimmed.includes('//')) {
    return 'Branch name cannot contain consecutive dots, slashes, or "@{".';
  }
  if (/[~^:?*\[\\]/.test(trimmed)) {
    return 'Branch name cannot contain special characters (~, ^, :, ?, *, [, \\).';
  }
  if (trimmed.endsWith('.lock') || trimmed.endsWith('.')) {
    return 'Branch name cannot end with ".lock" or a dot.';
  }
  return undefined;
}
