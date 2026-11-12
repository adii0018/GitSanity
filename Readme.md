# GitSanity

**Scan, secure and commit safely.**

> A VS Code extension that catches mistakes **before** they reach your Git history: leaked secrets, forgotten `console.log`, stray `debugger`, merge conflict markers and more.

---

## 1. The Problem

Every developer has done at least one of these:

| Mistake | Why it hurts |
|---|---|
| Committing a hardcoded API key or password | Keys leak on GitHub, bots find them within minutes, accounts get abused or billed |
| Leaving `console.log` / `debugger` in code | Noisy logs in production, sometimes sensitive data printed |
| Committing merge conflict markers (`<<<<<<<`) | Broken build, embarrassing code review |
| Staging huge files or `.env` by accident | Bloated repo, permanent leak (Git history never forgets) |
| Old `TODO` comments nobody remembers | Hidden technical debt |

Existing tools (ESLint, git-secrets, gitleaks) either need manual setup, run only in the terminal, or show problems **too late** (after commit or in CI). Beginners often don't use them at all.

---

## 2. The Solution

GitSanity watches your code **while you write it**, inside the editor, and helps you fix problems with one click.

1. **Detect** issues the moment you open or save a file.
2. **Show** them as underlines, in the Problems panel and in a status bar score.
3. **Fix** them with Quick Fix actions (remove the log, move the secret to `.env`).
4. **Block** bad commits using a Git pre-commit hook, even when you commit from the terminal.
5. **Set up the repo for you**: if the folder is not a Git repo, create one (and optionally publish it to GitHub).
6. **Scan the whole project** when you open it, not just the file you are editing.
7. **Commit safely**: scan, fix, suggest a message and commit in one flow.

---

## 3. Features

### Phase 0: Repo awareness and full project scan
- **Auto-detect** what the opened folder is:
  - No Git repo
  - Local Git repo (no remote)
  - Git repo connected to GitHub (or another remote)
- **No repo?** Show a prompt with **Create Repository**:
  - Runs `git init`, creates a starter `.gitignore` (node_modules, .env, build folders) and an optional first commit
  - Optional **Publish to GitHub**: creates a new GitHub repo using your VS Code GitHub login and sets it as `origin`
- **Existing repo (local or GitHub)?** Offer **Scan Entire Project**:
  - Scans every tracked file (`git ls-files`) plus untracked files
  - Optional **deep scan of Git history** to find secrets that were committed in the past
- **Repo Health Report** (Webview): total issues, issues by type and by file, `.gitignore` gaps (is `.env` ignored?), large files, branch and remote info
- Everything runs **locally**. No code is uploaded anywhere.

### Phase 1: Core detection
- Regex rules for `console.log`, `debugger`, hardcoded secrets, merge conflict markers
- Inline warnings and errors (red/yellow underline)
- Status bar counter, for example `GitSanity: 3 issues`
- Quick Fix: remove `console.log` line

### Phase 2: Config and control
- `.gitsanity.json` for team-wide rules (`off` / `warn` / `error`)
- `ignorePaths` to skip folders such as `tests/`
- `// gitsanity-ignore` comment to skip a single line
- Entropy check to catch random-looking unknown keys

### Phase 3: Smart auto-fix
- **Move to .env**: one click moves a hardcoded key to `.env`, replaces it with `process.env.KEY`, and adds `.env` to `.gitignore`
- Large file and `.env` staged warning

### Phase 4: Git integration
- Command: **GitSanity: Install Git Hook**
- Hook scans staged files and blocks the commit if errors are found
- **Safe Commit** command: scan staged files, show issues or auto-fix, suggest a commit message, ask for confirmation, then commit
- Optional push (off by default, always needs explicit confirmation)
- Warning when committing directly to `main` / `master`
- Undo last commit (`git reset --soft HEAD~1`)

### Phase 5: Interaction and insight
- Review panel (Webview) with staged files and checklist
- Stats dashboard: most common mistakes, weekly trend
- Clean commit streak (gamification)
- Rule-based commit message suggestion
- Old TODO detector using `git blame`

---

## 4. Language and Tech Stack

| Part | Choice | Why |
|---|---|---|
| Main language | **TypeScript** | Official language for VS Code extensions, type safety, best autocomplete for the VS Code API |
| Runtime | **Node.js** | VS Code extensions run on Node |
| Extension API | **VS Code Extension API** | Diagnostics, CodeActions, StatusBar, Webview, TreeView |
| Git access | **Git CLI via `child_process`** (or VS Code built-in Git extension API) | No extra dependency, works everywhere |
| Config format | **JSON** (`.gitsanity.json`) | Simple, easy to validate |
| Webview UI | **HTML + CSS + vanilla JS** (Chart.js for charts) | Light, no framework needed |
| Hook script | **Node.js script** | Same language as the rest, cross-platform |
| Packaging | **vsce** (`@vscode/vsce`) | Official packaging and publishing tool |
| Testing | **@vscode/test-electron + Mocha** | Official extension test runner |

---

## 5. Architecture

### 5.1 High level

```
                 +----------------------------+
                 |         VS Code            |
                 |  (editor, git, UI, events) |
                 +-------------+--------------+
                               |
                      VS Code Extension API
                               |
   +---------------------------v----------------------------+
   |                       GitSanity                        |
   |                                                        |
   |  extension.ts  (entry point, wires everything)         |
   |        |                                               |
   |   +----+-----------+-----------+-------------+         |
   |   |                |           |             |         |
   | Scanner        Config      Fixes         GitService    |
   | (rules)        Loader      (CodeActions) (staged, hook)|
   |   |                |           |             |         |
   |   +--------+-------+-----------+-------------+         |
   |            |                                           |
   |   Diagnostics + StatusBar + Webview + Stats store      |
   +--------------------------------------------------------+
                               |
                 +-------------v--------------+
                 |   Workspace files / .git   |
                 | .gitsanity.json, .env, hooks |
                 +----------------------------+
```

### 5.2 Modules

| Module | Responsibility |
|---|---|
| `extension.ts` | `activate()` / `deactivate()`, registers events and commands |
| `scanner/` | Runs rules on text and returns a list of findings |
| `scanner/rules.ts` | Rule definitions (regex, message, severity) |
| `scanner/entropy.ts` | Detects high-randomness strings (possible secrets) |
| `config/configLoader.ts` | Reads and validates `.gitsanity.json`, watches for changes |
| `diagnostics/diagnosticsManager.ts` | Converts findings into VS Code diagnostics |
| `fixes/codeActionProvider.ts` | Quick Fix actions (remove log, move to .env) |
| `fixes/envMover.ts` | Logic for the "Move to .env" auto-fix |
| `git/repoDetector.ts` | Detects state: no repo, local repo, repo with remote (GitHub or other) |
| `git/repoInitializer.ts` | Runs `git init`, writes starter `.gitignore`, optional first commit |
| `git/githubPublisher.ts` | Signs in via VS Code GitHub auth, creates remote repo, sets `origin` |
| `scanner/projectScanner.ts` | Scans all tracked and untracked files, optional history scan |
| `git/gitService.ts` | Gets staged files, blame info, performs commits (Safe Commit) |
| `git/hookInstaller.ts` | Writes `.git/hooks/pre-commit` |
| `ui/statusBar.ts` | Risk score in the status bar |
| `ui/reviewPanel.ts` | Webview for pre-commit review |
| `ui/dashboard.ts` | Webview for stats |
| `ui/healthReport.ts` | Webview for the Repo Health Report |
| `storage/statsStore.ts` | Saves stats using `ExtensionContext.globalState` |
| `hook/pre-commit.js` | Standalone script run by Git |

### 5.3 Data flow (opening a folder)

```
User opens a folder in VS Code
        |
        v
RepoDetector checks for .git and remotes
        |
   +----+------------------+--------------------+
   |                       |                    |
No .git                .git, no remote      .git + remote
   |                       |                    |
Prompt:                Prompt:              Prompt:
"Create repo?"         "Scan project?"      "Scan project?"
   |                       |                    |
git init +                 |                    |
.gitignore                 |                    |
   |                       |                    |
Optional: Publish          |                    |
to GitHub (auth + API)     |                    |
   |                       |                    |
   +-----------+-----------+--------------------+
               |
               v
   ProjectScanner: git ls-files + untracked files
   (optional: scan Git history)
               |
               v
   Diagnostics + Repo Health Report + Status bar
```

Publishing to GitHub uses VS Code's built-in GitHub authentication (`vscode.authentication.getSession('github', ['repo'])`) and the GitHub REST API (`POST /user/repos`). The token is managed by VS Code and is never stored by GitSanity.

### 5.4 Data flow (while coding)

```
User types / saves file
        |
        v
Event: onDidSaveTextDocument / onDidOpenTextDocument
        |
        v
ConfigLoader gives active rules + ignore paths
        |
        v
Scanner runs rules on file text  --->  findings[]
        |
        v
DiagnosticsManager sets underlines + Problems panel
        |
        +--> StatusBar updates count / score
        +--> StatsStore records new issue types
        |
        v
User hovers and clicks Quick Fix  --->  WorkspaceEdit applies change
```

### 5.5 Data flow (committing, hook and Safe Commit)

```
git commit  (terminal or VS Code)
        |
        v
.git/hooks/pre-commit  runs  hook/pre-commit.js
        |
        v
Get staged files  ->  run same scanner rules
        |
   errors found?
     /        \
   yes         no
    |           |
 block commit   allow commit
 print report   update clean streak
```

### 5.6 Folder structure

```
gitsanity/
├── src/
│   ├── extension.ts
│   ├── scanner/
│   │   ├── scanner.ts
│   │   ├── projectScanner.ts
│   │   ├── rules.ts
│   │   └── entropy.ts
│   ├── config/
│   │   └── configLoader.ts
│   ├── diagnostics/
│   │   └── diagnosticsManager.ts
│   ├── fixes/
│   │   ├── codeActionProvider.ts
│   │   └── envMover.ts
│   ├── git/
│   │   ├── repoDetector.ts
│   │   ├── repoInitializer.ts
│   │   ├── githubPublisher.ts
│   │   ├── gitService.ts
│   │   └── hookInstaller.ts
│   ├── ui/
│   │   ├── statusBar.ts
│   │   ├── reviewPanel.ts
│   │   ├── healthReport.ts
│   │   └── dashboard.ts
│   ├── storage/
│   │   └── statsStore.ts
│   └── test/
├── hook/
│   └── pre-commit.js
├── media/                  (icons, webview assets)
├── package.json
├── tsconfig.json
├── .gitsanity.example.json
├── CHANGELOG.md
└── README.md
```

---

## 6. Configuration

Place `.gitsanity.json` in the project root:

```json
{
  "rules": {
    "console-log": "warn",
    "debugger": "error",
    "secret": "error",
    "conflict-marker": "error",
    "large-file": "warn"
  },
  "ignorePaths": ["tests/", "scripts/", "node_modules/"],
  "maxFileSizeMB": 5
}
```

Skip a single line:

```js
console.log("needed for debugging"); // gitsanity-ignore
```

---

## 7. How We Will Build It

| Step | Task | Output |
|---|---|---|
| 1 | Scaffold project with `yo code` (TypeScript) | Working empty extension, F5 debug works |
| 2 | Build scanner and rules | `scanner/` returns findings for sample text |
| 3 | Connect diagnostics and status bar | Underlines and counter appear in the editor |
| 4 | Add Quick Fix for `console.log` | One-click removal |
| 5 | Add config loader and ignore rules | `.gitsanity.json` respected |
| 6 | Add entropy detection | Unknown keys caught |
| 7 | Build "Move to .env" fix | Secret moved safely |
| 8 | Repo detection and `git init` flow | Prompt to create a repo when none exists |
| 9 | Project scanner and Repo Health Report | Whole project scanned on demand |
| 10 | GitHub publish (VS Code auth + REST API) | Repo created on GitHub from the editor |
| 11 | Git service, hook installer and Safe Commit | Real commit blocking and guided commits |
| 12 | Webview review panel and stats dashboard | Visual review and stats |
| 13 | Tests, icon, README polish | Ready for packaging |
| 14 | `vsce package`, then `vsce publish` | Live on Marketplace |

**Recommended release plan:**

| Version | Steps | Theme |
|---|---|---|
| v0.1 | 1 to 7 | Live detection and auto-fix |
| v0.2 | 8 to 9 | Repo awareness and full project scan |
| v0.3 | 10 to 11 | GitHub publish, hook and Safe Commit |
| v0.4 | 12 and later | UI, dashboard, gamification |

---

## 8. Running and Testing Locally

```bash
npm install
npm run compile
```

Then press **F5** in VS Code. A new window (Extension Development Host) opens with the extension loaded. Create a test file with `console.log("x")` or `const apiKey = "abcd1234efgh"` and save it to see the warnings.

Run automated tests:

```bash
npm test
```

---

## 9. Publishing

```bash
npm install -g @vscode/vsce
vsce login <publisher-id>
vsce package      # creates .vsix for local testing
vsce publish      # publishes to VS Code Marketplace
```

Required in `package.json`: `name`, `displayName`, `description`, `version`, `publisher`, `engines.vscode`, `icon`, `repository`, `license`.

Publishing to the VS Code Marketplace requires a free Microsoft account, an Azure DevOps Personal Access Token (Marketplace: Manage scope) and a publisher ID. Optionally also publish to Open VSX for VSCodium and Cursor users.

---

## 10. Known Limitations

- Regex and entropy detection can produce **false positives** (for example in test files). The ignore comment and `ignorePaths` exist for this reason.
- Detection is heuristic, not a replacement for a full secret scanner in CI.
- Windows, macOS and Linux behave differently for Git hooks and file paths, so test on all if possible.
- If the folder has no Git repo, Git-dependent features (hook, staged scan, blame) stay disabled until a repo is created. Live scanning still works.
- **Publish to GitHub** needs the user to sign in to GitHub inside VS Code and grant the `repo` scope. Without that, only a local repo is created.
- Deep history scan can be slow on very large repositories, so it is optional and shows progress.
- Auto-commit and push never happen without explicit user confirmation.
- A leaked secret that was already pushed must be **rotated**. Removing it from code is not enough.

---

## 11. Future Ideas

- Language-specific rules (Python `print`, Java `System.out.println`)
- Custom user-defined regex rules
- Optional AI-powered commit message suggestions (bring your own API key)
- GitHub Action to run the same rules in CI
- Team dashboard for shared stats

---

## 12. Competitive Edge

| Existing tool | Gap | GitSanity |
|---|---|---|
| ESLint `no-console` | JS only, needs setup | Works on any language, zero setup |
| gitleaks / git-secrets | Terminal only, shows problems late | Live in editor with one-click fix |
| Generic secret scanners | Only detect | Detect and **auto-move to .env** |

---

## 13. License

MIT (change if needed).
