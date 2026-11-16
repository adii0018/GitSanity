<div align="center">

  <img src="media/icon.png" width="130" height="130" alt="GitSanity Logo" style="border-radius: 26px; box-shadow: 0 10px 30px rgba(0, 255, 136, 0.2);" />

  # GitSanity 🛡️

  ### *Real-Time Security Guardrails & Safe Commits for VS Code*

  **Catches leaked API keys, credentials, forgotten logs, debug breakpoints, and merge conflicts before they ever touch your Git history.**

  <p align="center">
    <a href="https://marketplace.visualstudio.com/items?itemName=adii0018.gitsanity"><img src="https://img.shields.io/badge/VS%20Code%20Marketplace-v0.1.1-007acc?style=for-the-badge&logo=visualstudiocode&logoColor=white" alt="Marketplace Version" /></a>
    <a href="https://github.com/adii0018/GitSanity"><img src="https://img.shields.io/badge/GitHub-adii0018%2FGitSanity-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Repo" /></a>
    <a href="#license"><img src="https://img.shields.io/badge/License-MIT-00f0ff?style=for-the-badge" alt="MIT License" /></a>
    <a href="#privacy--zero-telemetry"><img src="https://img.shields.io/badge/Telemetry-Zero%20(100%25%20Local)-2ea44f?style=for-the-badge&logo=shield" alt="Zero Telemetry" /></a>
    <a href="#performance"><img src="https://img.shields.io/badge/Runtime%20Deps-0%20(Pure%20Node.js)-ff79c6?style=for-the-badge" alt="Zero Dependencies" /></a>
  </p>

  <p align="center">
    <a href="#-quick-start"><b>Quick Start</b></a> •
    <a href="#-core-capabilities"><b>Features</b></a> •
    <a href="#-visual-commit-graph--sidebar"><b>Commit Graph & Sidebar</b></a> •
    <a href="#-smart-auto-fix-move-to-env"><b>Move to .env</b></a> •
    <a href="#-safe-commit-flow"><b>Safe Commit</b></a> •
    <a href="#-1-click-github-publishing"><b>GitHub Setup</b></a> •
    <a href="#-configuration"><b>Config</b></a>
  </p>

</div>

---

## ⚡ The 3-Stage Safety Architecture

Accidentally pushing a secret token or committing broken code to `main` can ruin your week. GitSanity embeds automated guardrails directly inside your development workflow:

```
  ┌───────────────────────┐      ┌─────────────────────────┐      ┌────────────────────────┐
  │   1. While You Code   │  ──▶ │   2. When You Commit    │  ──▶ │    3. When You Push    │
  │   In-Editor Live Lint │      │   Pre-Commit Hook Blob  │      │    GitHub Publisher    │
  │  (Secrets, Logs, Env) │      │  (Index-Accurate Check) │      │  (Whole-Repo Scan Gate)│
  └───────────────────────┘      └─────────────────────────┘      └────────────────────────┘
```

1. **Typing in Editor**: Real-time 300ms debounced scanning flags tokens (`AKIA...`, Stripe, Bearer tokens), `console.log`, and `debugger;` calls with squiggly lines.
2. **Git Commit Staging**: The pre-commit hook scans the **staged Git index** (`git show :path`), preventing `.env` leaks even if you commit from CLI or external terminals.
3. **Repository Publishing**: 1-click GitHub publisher automates repository creation, `.gitignore` defense, and remote pushing with pre-flight secret audits.

---

## 🚀 Core Capabilities

<table>
  <tr>
    <td width="50%">
      <h3>🌲 Visual Commit Graph</h3>
      <p>Interactive Git history graph embedded directly in the GitSanity Activity Bar. Inspect past commits, view changed files, and run instant <b>Secret Scans</b> on any historical commit.</p>
    </td>
    <td width="50%">
      <h3>🪄 1-Click "Move to <code>.env</code>"</h3>
      <p>Press <kbd>Ctrl</kbd>+<kbd>.</kbd> on hardcoded keys. GitSanity migrates the token to <code>.env</code>, syncs <code>.env.example</code>, guards <code>.gitignore</code>, and inserts native language code automatically.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>⚡ Conventional Safe Commit & Push</h3>
      <p>Built-in Conventional Commit selector (<code>feat:</code>, <code>fix:</code>, <code>docs:</code>, <code>chore:</code>). Choose <b>1-Click Commit & Push</b> to bundle staging scan, commit, and remote synchronization together.</p>
    </td>
    <td width="50%">
      <h3>🌿 Click-to-Switch Branch</h3>
      <p>Switch between local and remote branches in one click, or create new branches with automated <b>Git Ref rules validation</b> (blocking spaces, illegal characters, and ref collisions).</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🌐 1-Click GitHub Repository Creator</h3>
      <p>Open any folder in VS Code—even if uninitialized. GitSanity initializes Git, sets up <code>.gitignore</code>, makes an initial commit, creates a GitHub repo via OAuth, and pushes code instantly.</p>
    </td>
    <td width="50%">
      <h3>📊 Streaks & Analytics Dashboard</h3>
      <p>Gamified streak tracker rewarding clean commits, unlockable achievement milestones (7, 30, 100 clean commits), and pure inline SVG issue trend charts over the last 8 weeks.</p>
    </td>
  </tr>
</table>

---

## 🏃 Quick Start

### 1. Installation

Install directly from the VS Code Marketplace:
```bash
code --install-extension adii0018.gitsanity
```
*Or search **`GitSanity`** in the Extensions sidebar (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>).*

---

### 2. Live In-Editor Guardrails

Start typing in any source file. GitSanity automatically classifies issues:
- 🔴 **Red Squiggly (Error)**: Cloud credentials, private keys, high-entropy tokens, Git merge conflict markers (`<<<<<<<`), or `debugger;` statements.
- 🟡 **Yellow Squiggly (Warning)**: Stray `console.log(...)` statements, aged TODOs older than 90 days.

---

### 3. One-Click Quick Fixes

Place your cursor on any flagged line and press <kbd>Ctrl</kbd>+<kbd>.</kbd> (or <kbd>Cmd</kbd>+<kbd>.</kbd> on macOS):
- **`GitSanity: Move secret to .env`**: Auto-migrates the secret and secures your repository.
- **`GitSanity: Remove this console.log line`**: Cleans up debug output instantly.
- **`GitSanity: Add .env to .gitignore`**: Shields environment files from Git tracking.

---

## 🪄 Smart Auto-Fix: "Move to .env"

Hardcoding credentials directly into source files is the leading cause of accidental token leaks. GitSanity makes migration seamless:

```diff
- const stripeKey = "YOUR_STRIPE_SECRET_KEY";
+ const stripeKey = process.env.STRIPE_KEY;
```

### What GitSanity Does Automatically:
1. **Case Normalization**: Converts camelCase or kebab-case identifiers to uppercase `SNAKE_CASE` (`stripeKey` ➔ `STRIPE_KEY`).
2. **Collision Guard**: If `STRIPE_KEY` already exists in `.env` with a different value, GitSanity safely increments (`STRIPE_KEY_2`).
3. **`.env` Sync**: Appends key-value pair preserving the original line endings (`LF` vs `CRLF`).
4. **`.env.example` Registration**: Appends `STRIPE_KEY=` with an empty placeholder so collaborators know what to configure.
5. **`.gitignore` Defense**: Instantly ensures `.env` is listed in `.gitignore`.
6. **Disk-First Safety**: Writes `.env` to disk **before** editing the active code buffer to prevent data loss.

### Supported Language Syntaxes:

| Language | Generated Expression | Extra Automation |
|---|---|---|
| **JavaScript / TypeScript** | `process.env.VARIABLE_NAME` | Native Node.js |
| **Python** | `os.environ["VARIABLE_NAME"]` | Automatically inserts `import os` if missing |
| **Go** | `os.Getenv("VARIABLE_NAME")` | Import hint provided for `"os"` |
| **Ruby** | `ENV["VARIABLE_NAME"]` | Native Ruby ENV |
| **PHP** | `getenv('VARIABLE_NAME')` | Native getenv function |
| **Java** | `System.getenv("VARIABLE_NAME")` | Native System lookup |
| **C#** | `Environment.GetEnvironmentVariable("VARIABLE_NAME")` | Native .NET Environment |
| **Shell / Bash** | `${VARIABLE_NAME}` | POSIX parameter expansion |

---

## 🐾 Visual Commit Graph & Sidebar

GitSanity features a dedicated Activity Bar view with live status monitors and quick controls:

```
[GitSanity Sidebar]
├── 🛡️ Status & Safety
│   ├── Safety: Clean (0 issues)        [Protected ✅]
│   ├── Branch: main                    [0 staged, 2 modified] ──▶ Click to switch/create branch!
│   ├── GitHub: adii0018/GitSanity      [Connected ✅]
│   ├── Pre-commit Hook: Active         [Protected ✅]
│   └── Clean Streak: 5 commit(s)       [5 safe commits 🔥]
│
├── 🌲 Commit Graph
│   ├── ● [HEAD -> main] chore: update official extension icon
│   ├── ● [origin/main] feat: click-to-switch branch with git ref rules
│   ├── ● feat: commit graph tree and conventional commit flow
│   └── └─▶ Click any commit: [Scan Secrets] [Copy Hash] [View Diff] [GitHub]
│
└── ⚡ Quick Actions
    ├── 🚀 Safe Commit                  [Pre-flight check + push]
    ├── 📋 Review Before Commit         [Visual diff review]
    ├── 🌿 Switch or Create Branch      [Switch / new branch]
    ├── 🌐 Publish to GitHub            [1-Click repo creation & push]
    ├── 📊 Show Dashboard               [Analytics & charts]
    ├── 🩺 Health Report                [Diagnostic report]
    ├── 🔍 Scan Entire Project          [Workspace secret audit]
    ├── 📜 Scan Git Commit History      [Past commits audit]
    ├── ⏳ Find Old TODOs               [Stale blame review]
    └── 🪝 Install Pre-commit Hook      [Fail-safe git guard]
```

---

## 🪝 Fail-Safe Pre-Commit Hook

### Why GitSanity's Hook Is Superior
Standard Git pre-commit hooks inspect files on your disk. If you stage a secret with `git add .`, delete the line on disk, and run `git commit`, the secret is still recorded in the Git index!

GitSanity inspects the **Git index blob directly** (`git show :<path>`):
- **Index-Accurate**: Scans the precise snapshot being committed, not the uncommitted disk buffer.
- **`.env` Blocker**: Rejects any attempt to commit `.env`, `.env.local`, or `.env.production` files.
- **Large File Warning**: Alerts when staged files exceed your threshold (default: 5 MB).
- **Non-Destructive Integration**: Uses `# >>> GitSanity >>>` markers to co-exist cleanly with Husky, Lefthook, and custom hook scripts. Enforces LF line endings for cross-platform reliability on Windows.

---

## ⚙️ Configuration (`.gitsanity.json`)

Configure rule tolerances by placing `.gitsanity.json` in your repository root:

```json
{
  "$schema": "./schemas/gitsanity.schema.json",
  "rules": {
    "secret": "error",
    "conflict-marker": "error",
    "debugger": "error",
    "console-log": "warn",
    "high-entropy-string": "warn",
    "old-todo": "off"
  },
  "ignorePaths": [
    "tests/**",
    "scripts/**",
    "docs/**/*.md"
  ],
  "maxFileSizeMB": 1,
  "entropyThreshold": 4.5,
  "entropyMinLength": 20,
  "envFile": ".env",
  "envExampleFile": ".env.example",
  "createEnvExample": true,
  "largeFileMB": 5,
  "maxProjectFiles": 20000,
  "blockOnWarnings": false,
  "todoMaxAgeDays": 90
}
```

### Inline Ignore Directives:

Suppress warnings on specific lines using inline comments in any programming language:

```javascript
// Ignore all rules on this line
console.log("Telemetry payload"); // gitsanity-ignore

// Ignore specific rules
const testToken = "TESTING_TOKEN_12345"; // gitsanity-ignore secret, high-entropy-string

// Ignore the next line
// gitsanity-ignore-next-line
debugger;

// Ignore the entire file (place within first 10 lines)
// gitsanity-ignore-file
```

---

## ⌨️ Command Reference

| Command | Title | Description |
|---|---|---|
| `gitsanity.menu` | **GitSanity: Show Menu** | Interactive QuickPick menu with all tools |
| `gitsanity.safeCommit` | **GitSanity: Safe Commit** | Conventional Commit prompt + 1-Click push |
| `gitsanity.switchBranch` | **GitSanity: Switch or Create Branch** | Interactive branch switcher & validator |
| `gitsanity.publishToGitHub` | **GitSanity: Publish to GitHub** | 1-Click repository setup, OAuth sign-in & push |
| `gitsanity.reviewBeforeCommit` | **GitSanity: Review Before Commit** | Visual webview panel for staged file inspection |
| `gitsanity.showDashboard` | **GitSanity: Show Dashboard** | Analytics webview with streak stats & trend charts |
| `gitsanity.showHealthReport` | **GitSanity: Show Health Report** | Deep diagnostic audit of the active repository |
| `gitsanity.scanProject` | **GitSanity: Scan Project** | Whole-workspace scan respecting `.gitignore` |
| `gitsanity.scanHistory` | **GitSanity: Scan Git History** | Streams `git log -p` diffs to detect historical leaks |
| `gitsanity.findOldTodos` | **GitSanity: Find Old TODOs** | Surfaces aged TODO comments via `git blame` |
| `gitsanity.installHook` | **GitSanity: Install Pre-commit Hook** | Installs fail-safe pre-commit hook into `.git/hooks` |
| `gitsanity.undoLastCommit` | **GitSanity: Undo Last Commit** | Safe soft reset (`HEAD~1`) keeping changes staged |
| `gitsanity.rescanOpenFiles` | **GitSanity: Rescan Open Files** | Forces immediate live re-scan of active editors |

---

## 🔒 Privacy & Zero Telemetry

- 💻 **100% Local Execution**: All regex scans, entropy calculations, and Git interactions execute purely on your machine.
- 🚫 **Zero Telemetry**: No tracking, analytics, or external pings.
- 🙈 **Token Redaction**: Tokens and credentials printed to notifications or logs are strictly masked (`AKIAIOSF...` ➔ `AKI***`).
- 🛡️ **Workspace Trust Compliant**: In untrusted workspaces, all Git CLI operations and hook execution are disabled while in-editor linter diagnostics remain safe.
- 📦 **Zero Runtime Dependencies**: Built with pure Node.js and TypeScript. Zero third-party npm runtime dependencies.

---

## ⚡ Performance Benchmarks

| Metric | Result | Throughput |
|---|---|---|
| **Extension Activation** | **8 ms** | Lazy-loaded on demand |
| **50,000-Line File Scan** | **136 ms** | ~367,000 lines / sec |
| **5 MB Large File Scan** | **398 ms** | ~12.5 MB / sec |
| **20,000-File Workspace Audit** | **3.4 seconds** | ~5,800 files / sec |
| **ReDoS Single-Line Cap** | **0 ms** | 5,000-character safety guard |

---

## 📄 License

Distributed under the **MIT License**. Copyright &copy; 2026 Aditya Singh Rajput.

<div align="center">
  <sub>Built with ❤️ and sanity for developers worldwide.</sub>
</div>
