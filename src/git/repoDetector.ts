import * as path from 'path';
import { runGit, isGitInstalled } from './gitRunner';
import { redact } from './redact';

export type RepoStateType = 'no-git' | 'no-repo' | 'local-repo' | 'remote-repo';

export interface RemoteInfo {
  name: string;
  url: string;
}

export interface RepoStateResult {
  state: RepoStateType;
  root?: string;
  branch?: string;
  hasCommits?: boolean;
  remotes: RemoteInfo[];
  isGitHub: boolean;
  userConfigured: boolean;
}

/**
 * Detects the git repository state of a given folder.
 * Pure logic with zero VS Code dependencies.
 */
export async function detectRepoState(folderPath: string): Promise<RepoStateResult> {
  const installed = await isGitInstalled();
  if (!installed) {
    return {
      state: 'no-git',
      remotes: [],
      isGitHub: false,
      userConfigured: false
    };
  }

  // 1. Check if inside a git work tree
  const toplevelRes = await runGit(['rev-parse', '--show-toplevel'], folderPath);
  if (toplevelRes.code !== 0 || !toplevelRes.stdout.trim()) {
    return {
      state: 'no-repo',
      remotes: [],
      isGitHub: false,
      userConfigured: false
    };
  }

  const root = path.normalize(toplevelRes.stdout.trim());

  // 2. Check if repo has any commits
  const headRes = await runGit(['rev-parse', '--verify', 'HEAD'], root);
  const hasCommits = headRes.code === 0;

  // 3. Get branch
  let branch: string | undefined;
  const branchRes = await runGit(['branch', '--show-current'], root);
  if (branchRes.code === 0 && branchRes.stdout.trim()) {
    branch = branchRes.stdout.trim();
  } else if (hasCommits) {
    // Possibly detached HEAD
    const shortHead = await runGit(['rev-parse', '--short', 'HEAD'], root);
    branch = shortHead.code === 0 ? `HEAD (${shortHead.stdout.trim()})` : 'HEAD';
  } else {
    // Unborn branch
    const symRef = await runGit(['symbolic-ref', '--short', 'HEAD'], root);
    branch = symRef.code === 0 && symRef.stdout.trim() ? symRef.stdout.trim() : 'main';
  }

  // 4. Remotes
  const remotesRes = await runGit(['remote', '-v'], root);
  const remotesMap = new Map<string, string>();
  if (remotesRes.code === 0 && remotesRes.stdout.trim()) {
    const lines = remotesRes.stdout.split(/\r?\n/);
    for (const line of lines) {
      const match = line.trim().match(/^([^\s]+)\s+([^\s]+)\s+\((?:fetch|push)\)$/);
      if (match) {
        const name = match[1];
        const rawUrl = match[2];
        const safeUrl = redact(rawUrl);
        if (!remotesMap.has(name)) {
          remotesMap.set(name, safeUrl);
        }
      }
    }
  }

  const remotes: RemoteInfo[] = Array.from(remotesMap.entries()).map(([name, url]) => ({
    name,
    url
  }));

  const isGitHub = remotes.some((r) => /github\.com/i.test(r.url));

  // 5. User config
  const nameRes = await runGit(['config', 'user.name'], root);
  const emailRes = await runGit(['config', 'user.email'], root);
  const userConfigured =
    nameRes.stdout.trim().length > 0 && emailRes.stdout.trim().length > 0;

  const state: RepoStateType = remotes.length > 0 ? 'remote-repo' : 'local-repo';

  return {
    state,
    root,
    branch,
    hasCommits,
    remotes,
    isGitHub,
    userConfigured
  };
}
