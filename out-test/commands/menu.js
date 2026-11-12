"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.showGitSanityMenu = showGitSanityMenu;
const vscode = __importStar(require("vscode"));
const repoDetector_1 = require("../git/repoDetector");
const hookInstaller_1 = require("../git/hookInstaller");
async function showGitSanityMenu() {
    const folders = vscode.workspace.workspaceFolders || [];
    const folder = folders.length > 0 ? folders[0] : undefined;
    let state = 'no-repo';
    let isHookActive = false;
    let hasCommits = false;
    let hasRemote = false;
    if (folder && folder.uri.scheme === 'file') {
        try {
            const repo = await (0, repoDetector_1.detectRepoState)(folder.uri.fsPath);
            state = repo.state;
            hasCommits = !!repo.hasCommits;
            hasRemote = repo.remotes.length > 0;
            isHookActive = await (0, hookInstaller_1.isGitSanityHookInstalled)(folder.uri.fsPath);
        }
        catch { }
    }
    const items = [];
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
        }
        else {
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
    }
    else {
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
//# sourceMappingURL=menu.js.map