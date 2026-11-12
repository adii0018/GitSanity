import * as fs from 'fs';
import * as path from 'path';
import { runGit } from './gitRunner';
import { detectStacks, buildGitignore } from './gitignoreTemplate';
import { addEnvToGitignore } from '../env/gitignoreFile';

export interface InitRepoResult {
  success: boolean;
  error?: string;
  createdGitignore: boolean;
}

/**
 * Initializes a new Git repository in the specified folder with a 'main' branch
 * and generates or updates .gitignore.
 */
export async function initRepo(folderPath: string, envFileName: string = '.env'): Promise<InitRepoResult> {
  // 1. Verify not already a repository root
  const checkRes = await runGit(['rev-parse', '--show-toplevel'], folderPath);
  if (checkRes.code === 0 && checkRes.stdout.trim()) {
    const existingRoot = path.normalize(checkRes.stdout.trim());
    if (existingRoot.toLowerCase() === path.normalize(folderPath).toLowerCase()) {
      return {
        success: false,
        error: 'A Git repository already exists in this folder.',
        createdGitignore: false
      };
    }
  }

  // 2. Run git init -b main (fall back to git init then symbolic-ref for older git)
  let initRes = await runGit(['init', '-b', 'main'], folderPath);
  if (initRes.code !== 0) {
    initRes = await runGit(['init'], folderPath);
    if (initRes.code === 0) {
      await runGit(['symbolic-ref', 'HEAD', 'refs/heads/main'], folderPath);
    }
  }

  if (initRes.code !== 0) {
    return {
      success: false,
      error: initRes.stderr || 'git init failed',
      createdGitignore: false
    };
  }

  // 3. Handle .gitignore
  const gitignorePath = path.join(folderPath, '.gitignore');
  let createdGitignore = false;

  if (fs.existsSync(gitignorePath)) {
    try {
      const existing = await fs.promises.readFile(gitignorePath, 'utf8');
      const updated = addEnvToGitignore(existing, envFileName);
      if (updated !== existing) {
        await fs.promises.writeFile(gitignorePath, updated, 'utf8');
      }
    } catch {}
  } else {
    try {
      const stacks = await detectStacks(folderPath);
      const content = buildGitignore(stacks);
      await fs.promises.writeFile(gitignorePath, content, 'utf8');
      createdGitignore = true;
    } catch {}
  }

  return {
    success: true,
    createdGitignore
  };
}
