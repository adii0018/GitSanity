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
exports.GitSanityActionsTreeProvider = exports.GitSanityGraphTreeProvider = exports.GitSanityStatusTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
const repoDetector_1 = require("../git/repoDetector");
const hookInstaller_1 = require("../git/hookInstaller");
const eventLog_1 = require("../stats/eventLog");
const stats_1 = require("../stats/stats");
const gitRunner_1 = require("../git/gitRunner");
const stagedFiles_1 = require("../git/stagedFiles");
class GitSanityStatusTreeProvider {
    constructor(diagnosticsManager) {
        this.diagnosticsManager = diagnosticsManager;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.diagnosticsManager.onDidChangeTotalIssues(() => this.refresh());
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren() {
        const items = [];
        const folders = vscode.workspace.workspaceFolders || [];
        if (folders.length === 0) {
            const item = new vscode.TreeItem('No workspace folder open', vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('folder');
            return [item];
        }
        const folder = folders[0];
        const root = folder.uri.fsPath;
        // 1. Diagnostic Issues Count
        const counts = this.diagnosticsManager.getIssueCounts();
        let issueLabel = 'Safety: Clean (0 issues)';
        let issueDesc = '[Protected]';
        let issueIcon = new vscode.ThemeIcon('shield', new vscode.ThemeColor('testing.iconPassed'));
        if (counts.errors > 0 || counts.warnings > 0) {
            issueLabel = `Safety: ${counts.errors} error(s), ${counts.warnings} warning(s)`;
            issueDesc = counts.errors > 0 ? '[Errors detected]' : '[Warnings detected]';
            issueIcon = new vscode.ThemeIcon(counts.errors > 0 ? 'error' : 'warning', new vscode.ThemeColor(counts.errors > 0 ? 'errorForeground' : 'editorWarning.foreground'));
        }
        const issueItem = new vscode.TreeItem(issueLabel, vscode.TreeItemCollapsibleState.None);
        issueItem.description = issueDesc;
        issueItem.iconPath = issueIcon;
        issueItem.tooltip = 'Real-time in-editor issues detected by GitSanity. Click to inspect Problems.';
        issueItem.command = {
            command: 'workbench.actions.view.problems',
            title: 'Show Problems'
        };
        items.push(issueItem);
        if (!vscode.workspace.isTrusted) {
            const trustItem = new vscode.TreeItem('Workspace: Untrusted', vscode.TreeItemCollapsibleState.None);
            trustItem.description = '[Git features disabled]';
            trustItem.iconPath = new vscode.ThemeIcon('shield');
            items.push(trustItem);
            return items;
        }
        // 2. Git Repo, Branch & Staging Status
        try {
            const repoState = await (0, repoDetector_1.detectRepoState)(root);
            if (repoState.state === 'no-repo' || repoState.state === 'no-git') {
                const noRepoItem = new vscode.TreeItem('Git: Not Initialized', vscode.TreeItemCollapsibleState.None);
                noRepoItem.description = '[Click to Setup]';
                noRepoItem.iconPath = new vscode.ThemeIcon('repo-create', new vscode.ThemeColor('charts.orange'));
                noRepoItem.tooltip = 'This folder is not a Git repository. Click to initialize and publish to GitHub.';
                noRepoItem.command = { command: 'gitsanity.publishToGitHub', title: 'Publish to GitHub' };
                items.push(noRepoItem);
                return items;
            }
            // Staging status
            const statusRes = await (0, gitRunner_1.runGit)(['status', '--porcelain=v1', '-z'], root);
            const parsedStatus = (0, stagedFiles_1.parseStatusPorcelain)(statusRes.stdout);
            const stagedCount = parsedStatus.staged.length;
            const unstagedCount = parsedStatus.unstaged.length + parsedStatus.untracked.length;
            const branchItem = new vscode.TreeItem(`Branch: ${repoState.branch || 'detached'}`, vscode.TreeItemCollapsibleState.None);
            branchItem.description = `[${stagedCount} staged, ${unstagedCount} modified]`;
            branchItem.iconPath = new vscode.ThemeIcon('git-branch');
            branchItem.tooltip = `Current Branch: ${repoState.branch}\nStaged files: ${stagedCount}\nUnstaged/untracked files: ${unstagedCount}\nClick to switch or create branch!`;
            branchItem.command = {
                command: 'gitsanity.switchBranch',
                title: 'Switch or Create Branch'
            };
            items.push(branchItem);
            // 3. GitHub Remote Connection Status
            const originRemote = repoState.remotes.find((r) => r.name === 'origin') || repoState.remotes[0];
            if (originRemote) {
                let repoNameDisplay = originRemote.name;
                const match = (originRemote.url || '').match(/[:/]([^/:]+\/[^/:]+?)(?:\.git)?$/);
                if (match) {
                    repoNameDisplay = match[1];
                }
                const remoteItem = new vscode.TreeItem(`GitHub: ${repoNameDisplay}`, vscode.TreeItemCollapsibleState.None);
                remoteItem.description = '[Connected]';
                remoteItem.iconPath = new vscode.ThemeIcon('cloud');
                remoteItem.tooltip = `Connected to remote '${originRemote.name}'\nURL: ${originRemote.url}\nClick to open on GitHub.`;
                if (originRemote.url && originRemote.url.includes('github.com')) {
                    let cleanUrl = originRemote.url.replace(/\.git$/, '');
                    if (cleanUrl.startsWith('git@github.com:')) {
                        cleanUrl = 'https://github.com/' + cleanUrl.slice('git@github.com:'.length);
                    }
                    remoteItem.command = {
                        command: 'vscode.open',
                        arguments: [vscode.Uri.parse(cleanUrl)],
                        title: 'Open on GitHub'
                    };
                }
                items.push(remoteItem);
            }
            else {
                const noRemoteItem = new vscode.TreeItem('GitHub: Not Connected', vscode.TreeItemCollapsibleState.None);
                noRemoteItem.description = '[Not connected]';
                noRemoteItem.iconPath = new vscode.ThemeIcon('cloud-upload', new vscode.ThemeColor('charts.orange'));
                noRemoteItem.tooltip = 'Repository is not published to GitHub. Click to create a GitHub repository and push code!';
                noRemoteItem.command = { command: 'gitsanity.publishToGitHub', title: 'Publish to GitHub' };
                items.push(noRemoteItem);
            }
            // 4. Pre-commit Hook Status
            const hookActive = await (0, hookInstaller_1.isGitSanityHookInstalled)(root);
            const hookItem = new vscode.TreeItem(`Pre-commit Hook: ${hookActive ? 'Active' : 'Inactive'}`, vscode.TreeItemCollapsibleState.None);
            hookItem.description = hookActive ? '[Active]' : '[Click to Install]';
            hookItem.iconPath = hookActive
                ? new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'))
                : new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('errorForeground'));
            if (!hookActive) {
                hookItem.command = { command: 'gitsanity.installHook', title: 'Install Hook' };
                hookItem.tooltip = 'Click to install GitSanity pre-commit hook';
            }
            items.push(hookItem);
            // 5. Streak
            try {
                const { commonDir } = await (0, hookInstaller_1.resolveGitPaths)(root);
                const logPath = (0, eventLog_1.getEventLogPath)(commonDir);
                const events = await (0, eventLog_1.readEvents)(logPath);
                const streak = (0, stats_1.computeStreak)(events);
                const streakItem = new vscode.TreeItem(`Clean Streak: ${streak} commit(s)`, vscode.TreeItemCollapsibleState.None);
                streakItem.description = streak > 0 ? `[${streak} safe commits]` : '[0 safe commits]';
                streakItem.iconPath = new vscode.ThemeIcon('flame', new vscode.ThemeColor('charts.orange'));
                streakItem.tooltip = 'Number of consecutive safe commits with 0 errors.';
                items.push(streakItem);
            }
            catch { }
        }
        catch { }
        return items;
    }
}
exports.GitSanityStatusTreeProvider = GitSanityStatusTreeProvider;
class GitSanityGraphTreeProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren() {
        const folders = vscode.workspace.workspaceFolders || [];
        if (folders.length === 0) {
            const item = new vscode.TreeItem('No workspace open', vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('folder');
            return [item];
        }
        const root = folders[0].uri.fsPath;
        const logRes = await (0, gitRunner_1.runGit)(['log', '--max-count=25', '--format=%H|%h|%an|%ar|%s|%D'], root);
        if (logRes.code !== 0 || !logRes.stdout.trim()) {
            const empty = new vscode.TreeItem('No commits yet', vscode.TreeItemCollapsibleState.None);
            empty.iconPath = new vscode.ThemeIcon('git-commit');
            empty.description = '[Make first commit]';
            empty.command = { command: 'gitsanity.safeCommit', title: 'Safe Commit' };
            return [empty];
        }
        const lines = logRes.stdout.trim().split(/\r?\n/).filter(Boolean);
        return lines.map((line, index) => {
            const parts = line.split('|');
            const hash = parts[0] || '';
            const shortHash = parts[1] || '';
            const author = parts[2] || '';
            const relDate = parts[3] || '';
            const subject = parts[4] || '(no message)';
            const refNames = parts[5] || '';
            const isHead = index === 0;
            let badge = '';
            if (refNames && refNames.trim()) {
                const cleanedRefs = refNames.trim().replace(/^HEAD -> /, '');
                badge = `[${cleanedRefs}] `;
            }
            const item = new vscode.TreeItem(subject, vscode.TreeItemCollapsibleState.None);
            item.description = `${badge}${author} • ${relDate}`;
            item.iconPath = new vscode.ThemeIcon('git-commit', isHead ? new vscode.ThemeColor('charts.blue') : undefined);
            const mdTooltip = new vscode.MarkdownString();
            mdTooltip.appendMarkdown(`### \`${shortHash}\` — ${subject}\n\n`);
            mdTooltip.appendMarkdown(`- **Author:** ${author}\n`);
            mdTooltip.appendMarkdown(`- **Date:** ${relDate}\n`);
            mdTooltip.appendMarkdown(`- **Commit:** \`${hash}\`\n`);
            if (badge) {
                mdTooltip.appendMarkdown(`- **Refs:** \`${badge.trim()}\`\n`);
            }
            mdTooltip.appendMarkdown(`\n---\n*Click for options: Scan secrets, View diff, Copy hash, Open on GitHub.*`);
            item.tooltip = mdTooltip;
            item.command = {
                command: 'gitsanity.showCommitActions',
                title: 'Commit Actions',
                arguments: [{ hash, shortHash, author, relDate, subject }]
            };
            return item;
        });
    }
}
exports.GitSanityGraphTreeProvider = GitSanityGraphTreeProvider;
class GitSanityActionsTreeProvider {
    getTreeItem(element) {
        return element;
    }
    getChildren() {
        return GitSanityActionsTreeProvider.ACTIONS.map((a) => {
            const item = new vscode.TreeItem(a.label, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon(a.icon);
            item.description = a.description;
            item.tooltip = a.tooltip;
            item.command = {
                command: a.command,
                title: a.label
            };
            return item;
        });
    }
}
exports.GitSanityActionsTreeProvider = GitSanityActionsTreeProvider;
GitSanityActionsTreeProvider.ACTIONS = [
    {
        label: 'Safe Commit',
        icon: 'git-commit',
        command: 'gitsanity.safeCommit',
        description: 'Pre-flight & push',
        tooltip: 'Scan staged changes, choose commit type, and commit safely.'
    },
    {
        label: 'Review Before Commit',
        icon: 'checklist',
        command: 'gitsanity.reviewBeforeCommit',
        description: 'Staged review',
        tooltip: 'Open the staged changes review panel.'
    },
    {
        label: 'Switch or Create Branch',
        icon: 'git-branch',
        command: 'gitsanity.switchBranch',
        description: 'Branch manager',
        tooltip: 'Switch between existing branches or create a new branch with valid naming rules.'
    },
    {
        label: 'Publish to GitHub',
        icon: 'cloud-upload',
        command: 'gitsanity.publishToGitHub',
        description: 'Publish repo',
        tooltip: 'Initialize and publish this folder to GitHub with secret scan protection.'
    },
    {
        label: 'Show Dashboard',
        icon: 'graph',
        command: 'gitsanity.showDashboard',
        description: 'Analytics',
        tooltip: 'Open the GitSanity analytics dashboard with streaks and charts.'
    },
    {
        label: 'Health Report',
        icon: 'pulse',
        command: 'gitsanity.showHealthReport',
        description: 'Diagnostics',
        tooltip: 'Run repository diagnostic health check.'
    },
    {
        label: 'Scan Entire Project',
        icon: 'search',
        command: 'gitsanity.scanProject',
        description: 'Workspace scan',
        tooltip: 'Scan all workspace files for secrets and issues.'
    },
    {
        label: 'Scan Git Commit History',
        icon: 'history',
        command: 'gitsanity.scanHistory',
        description: 'History audit',
        tooltip: 'Scan past commits for leaked secrets.'
    },
    {
        label: 'Find Old TODOs',
        icon: 'clock',
        command: 'gitsanity.findOldTodos',
        description: 'Blame review',
        tooltip: 'Search for aged TODO comments via git blame.'
    },
    {
        label: 'Install Pre-commit Hook',
        icon: 'plug',
        command: 'gitsanity.installHook',
        description: 'Git hook',
        tooltip: 'Install or update the pre-commit hook.'
    }
];
//# sourceMappingURL=sidebar.js.map