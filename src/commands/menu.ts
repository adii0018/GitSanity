import * as vscode from 'vscode';
import { detectRepoState } from '../git/repoDetector';
import { isGitSanityHookInstalled } from '../git/hookInstaller';

interface MenuItem extends vscode.QuickPickItem {
  command?: string;
  args?: any[];
}

export async function showGitSanityMenu(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders || [];
  const folder = folders.length > 0 ? folders[0] : undefined;

  let state = 'no-repo';
  let isHookActive = false;
  let hasCommits = false;
  let hasRemote = false;

  if (folder && folder.uri.scheme === 'file') {
    try {
      const repo = await detectRepoState(folder.uri.fsPath);
      state = repo.state;
      hasCommits = !!repo.hasCommits;
      hasRemote = repo.remotes.length > 0;
      isHookActive = await isGitSanityHookInstalled(folder.uri.fsPath);
    } catch {}
  }

  const items: MenuItem[] = [];

  // Always available
  items.push({
    label: '$(checklist) Show Problems',
    description: 'Open VS Code Problems view',
    detail: 'View all underlines and findings across tracked files',
    command: 'workbench.actions.view.problems'
  });

  items.push({
    label: '$(dashboard) Show Dashboard',
    description: 'Streak, metrics, trends and badges',
    detail: 'View clean commit streak, weekly issue trends, top mistakes, and milestones',
    command: 'gitsanity.showDashboard'
  });

  items.push({
    label: '$(search) Scan Project',
    description: 'Whole project scan',
    detail: 'Scan tracked and untracked files for secrets and issues',
    command: 'gitsanity.scanProject'
  });

  items.push({
    label: '$(graph) Show Health Report',
    description: 'Visual security report',
    detail: 'Open dashboard with repository hygiene metrics and issue distributions',
    command: 'gitsanity.showHealthReport'
  });

  items.push({
    label: '$(clock) Find Old TODOs',
    description: 'Tracked TODOs sorted by age',
    detail: 'Inspect TODO, FIXME, HACK, XXX comments across repository files',
    command: 'gitsanity.findOldTodos'
  });

  if (state !== 'no-repo' && state !== 'no-git' && hasCommits) {
    items.push({
      label: '$(history) Scan History',
      description: 'Deep Git commit log scan',
      detail: 'Analyze commit diffs for leaked secrets (read-only)',
      command: 'gitsanity.scanHistory'
    });
  }

  if (state !== 'no-repo' && state !== 'no-git') {
    items.push({
      label: '$(eye) Review Before Commit',
      description: 'Interactive staged review panel',
      detail: 'Check staged changes, review findings, checklists, and commit',
      command: 'gitsanity.reviewBeforeCommit'
    });

    items.push({
      label: '$(check) Safe Commit',
      description: 'Scan & Commit securely',
      detail: 'Pre-flight check, smart commit message generation, and commit',
      command: 'gitsanity.safeCommit'
    });

    if (hasCommits) {
      items.push({
        label: '$(discard) Undo Last Commit',
        description: 'Soft reset HEAD~1',
        detail: 'Undo the previous commit while keeping changes staged',
        command: 'gitsanity.undoLastCommit'
      });
    }

    if (!isHookActive) {
      items.push({
        label: '$(shield) Install Git Hook',
        description: 'Protect CLI commits',
        detail: 'Installs GitSanity pre-commit hook into .git/hooks/pre-commit',
        command: 'gitsanity.installHook'
      });
    } else {
      items.push({
        label: '$(trash) Uninstall Git Hook',
        description: 'Remove pre-commit hook',
        detail: 'Removes GitSanity marker block from pre-commit hook',
        command: 'gitsanity.uninstallHook'
      });
    }

    if (hasCommits && !hasRemote) {
      items.push({
        label: '$(repo-push) Publish to GitHub',
        description: 'Create GitHub repository',
        detail: 'Creates private/public repo on GitHub and sets remote origin',
        command: 'gitsanity.publishToGitHub'
      });
    }
  } else {
    items.push({
      label: '$(git-merge) Create Repository',
      description: 'Initialize Git in workspace',
      detail: 'Runs git init -b main and creates tailored .gitignore',
      command: 'gitsanity.createRepository'
    });
  }

  items.push({
    label: '$(gear) Create Config File',
    description: '.gitsanity.json',
    detail: 'Create customizable configuration file with rule controls and ignore paths',
    command: 'gitsanity.createConfig'
  });

  items.push({
    label: '$(refresh) Rescan Open Files',
    description: 'Refresh diagnostics',
    detail: 'Force real-time re-scan of all currently open documents',
    command: 'gitsanity.rescanOpenFiles'
  });

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'GitSanity Actions and Commands'
  });

  if (selected && selected.command) {
    vscode.commands.executeCommand(selected.command, ...(selected.args || []));
  }
}
