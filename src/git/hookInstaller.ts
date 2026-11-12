import * as fs from 'fs';
import * as path from 'path';
import { runGit } from './gitRunner';
import { installHookBlock, removeHookBlock, isHookInstalled } from './hookText';

export interface HookInstallResult {
  success: boolean;
  message?: string;
  warning?: string;
}

/**
 * Resolves absolute hooks directory and git common directory.
 */
export async function resolveGitPaths(
  repoRoot: string
): Promise<{ hooksDir: string; commonDir: string; customHooksPath?: string }> {
  const hooksRes = await runGit(['rev-parse', '--git-path', 'hooks'], repoRoot);
  const commonRes = await runGit(['rev-parse', '--git-common-dir'], repoRoot);
  const configRes = await runGit(['config', 'core.hooksPath'], repoRoot);

  const rawHooks = hooksRes.code === 0 && hooksRes.stdout.trim() ? hooksRes.stdout.trim() : '.git/hooks';
  const rawCommon = commonRes.code === 0 && commonRes.stdout.trim() ? commonRes.stdout.trim() : '.git';

  const hooksDir = path.isAbsolute(rawHooks) ? rawHooks : path.resolve(repoRoot, rawHooks);
  const commonDir = path.isAbsolute(rawCommon) ? rawCommon : path.resolve(repoRoot, rawCommon);
  const customHooksPath = configRes.code === 0 && configRes.stdout.trim() ? configRes.stdout.trim() : undefined;

  return { hooksDir, commonDir, customHooksPath };
}

/**
 * Checks whether the GitSanity hook is installed in the given repository.
 */
export async function isGitSanityHookInstalled(repoRoot: string): Promise<boolean> {
  try {
    const { hooksDir } = await resolveGitPaths(repoRoot);
    const precommitPath = path.join(hooksDir, 'pre-commit');
    if (!fs.existsSync(precommitPath)) {
      return false;
    }
    const content = await fs.promises.readFile(precommitPath, 'utf8');
    return isHookInstalled(content);
  } catch {
    return false;
  }
}

/**
 * Installs the GitSanity pre-commit hook into the given repository.
 */
export async function installGitHook(
  repoRoot: string,
  bundleSourcePath: string
): Promise<HookInstallResult> {
  const { hooksDir, commonDir, customHooksPath } = await resolveGitPaths(repoRoot);

  let warning: string | undefined;
  if (customHooksPath) {
    warning = `Custom core.hooksPath is configured (${customHooksPath}).`;
  } else if (fs.existsSync(path.join(repoRoot, '.husky'))) {
    warning = 'Husky hooks manager detected in this repository.';
  } else if (fs.existsSync(path.join(repoRoot, 'lefthook.yml')) || fs.existsSync(path.join(repoRoot, '.lefthook'))) {
    warning = 'Lefthook manager detected in this repository.';
  }

  // Ensure directories exist
  await fs.promises.mkdir(hooksDir, { recursive: true });
  const gitsanityDir = path.join(commonDir, 'gitsanity');
  await fs.promises.mkdir(gitsanityDir, { recursive: true });

  // Copy bundled hook script
  const targetScriptPath = path.join(gitsanityDir, 'pre-commit.js');
  if (fs.existsSync(bundleSourcePath)) {
    await fs.promises.copyFile(bundleSourcePath, targetScriptPath);
  } else {
    return {
      success: false,
      message: `Hook bundle file not found at ${bundleSourcePath}. Run 'npm run build:hook' first.`
    };
  }

  // Update pre-commit hook file
  const precommitPath = path.join(hooksDir, 'pre-commit');
  let existingContent: string | undefined;
  if (fs.existsSync(precommitPath)) {
    existingContent = await fs.promises.readFile(precommitPath, 'utf8');
  }

  try {
    const updatedContent = installHookBlock(existingContent);
    await fs.promises.writeFile(precommitPath, updatedContent, 'utf8');
    try {
      await fs.promises.chmod(precommitPath, 0o755);
    } catch {}
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err)
    };
  }

  return {
    success: true,
    warning
  };
}

/**
 * Uninstalls the GitSanity hook from the repository.
 */
export async function uninstallGitHook(repoRoot: string): Promise<HookInstallResult> {
  const { hooksDir, commonDir } = await resolveGitPaths(repoRoot);
  const precommitPath = path.join(hooksDir, 'pre-commit');

  if (!fs.existsSync(precommitPath)) {
    return { success: true, message: 'No pre-commit hook file found.' };
  }

  const existingContent = await fs.promises.readFile(precommitPath, 'utf8');
  const updatedContent = removeHookBlock(existingContent);

  if (updatedContent === undefined) {
    // Delete the hook file entirely if nothing remains
    try {
      await fs.promises.unlink(precommitPath);
    } catch {}
  } else {
    await fs.promises.writeFile(precommitPath, updatedContent, 'utf8');
  }

  // Clean up gitsanity/pre-commit.js
  const scriptPath = path.join(commonDir, 'gitsanity', 'pre-commit.js');
  try {
    if (fs.existsSync(scriptPath)) {
      await fs.promises.unlink(scriptPath);
    }
  } catch {}

  return { success: true };
}
