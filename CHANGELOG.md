# Change Log

All notable changes to the "GitSanity" extension will be documented in this file.

## [0.1.1] - (2026-11-16)

### Added
- **Visual Commit Graph View**: Dedicated interactive Git history tree in the Activity Bar sidebar with commit hashes, relative timestamps, author badges, and 1-click secret scanning of historical commits.
- **Conventional Commit Selector**: Interactive picker for commit types (`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `custom`).
- **1-Click "Commit & Push"**: Safe commit directly bundles pre-flight secret scans, conventional commit creation, and remote push in one action.
- **Click-to-Switch & Create Branch**: Interactive branch switcher with real-time Git ref naming validation rules.
- **1-Click GitHub Repository Creator**: Automatically initializes unlinked folders into GitHub repositories with starter `.gitignore`, initial commit, and remote push.
- **Cyber Ninja Favicon**: High-resolution dark squircle neon green official icon.
- **Sidebar Polish**: Added descriptive badges (`[Protected ✅]`, `[Connected ✅]`, `[Active ✅]`, `[X safe commits 🔥]`), removed deprecated buttons.

## [0.1.0] - Preview (2026-11-12)

### Initial Preview Release

#### Live Detection
- Real-time in-editor scanning for secrets (AWS keys, generic tokens/passwords, hex keys).
- Forgotten `console.log` statements flagged as warnings.
- Unintentional `debugger;` breakpoints flagged as errors.
- Unresolved Git merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) flagged as errors.
- Shannon entropy string detection to catch high-entropy passwords, tokens, and random credentials.

#### Configuration & Ignore System
- Project-level `.gitsanity.json` configuration with real-time file watching.
- Schema validation via `schemas/gitsanity.schema.json`.
- Customizable rule severities (`off`, `warn`, `error`).
- Glob path ignore rules and default ignores (`node_modules`, build artifacts, lockfiles, `.env*`).
- Language-agnostic inline ignore directives: `gitsanity-ignore`, `gitsanity-ignore-next-line`, and `gitsanity-ignore-file`.

#### Smart Auto-Fix ("Move to .env")
- One-click migration of hardcoded secrets to `.env` or custom env files.
- Language-aware expression substitution for JavaScript, TypeScript, Python, Ruby, PHP, Go, Java, C#, and Shell.
- Automated `import os` insertion for Python scripts.
- Collision avoidance and duplicate prevention in `.env` and `.env.example`.
- Automated `.gitignore` hygiene ensuring `.env` is never committed.

#### Repository Awareness & Whole-Project Scanning
- Git repository state detection (`no-git`, `no-repo`, `local-repo`, `remote-repo`).
- Starter `.gitignore` generation supporting Node.js, Python, Java, Go, Rust, .NET, PHP, and Ruby.
- Fast, non-blocking whole-project scan with separate `gitsanity-project` diagnostic view.
- Deep Git history scanner streaming commit diffs to discover previously leaked secrets.
- GitHub repository publishing flow via native HTTPS API.

#### Git Hook & Safe Commit
- Standalone pre-commit hook bundled with `esbuild` for CLI use with zero runtime dependencies.
- Index-level inspection (`git show :<path>`) preventing unstaged bypasses.
- Blocking of staged `.env` files and error-level findings.
- Safe Commit flow with Conventional Commits message builder and protected branch warnings.
- Safe soft-reset undo (`HEAD~1`) for unpushed commits.

#### Interactive Review Panel
- Visual "Review Before Commit" panel displaying staged files and findings with line navigation links.
- Interactive pre-commit checklist enforcing human review of staged changes, warnings, and protected branches.
- Real-time 72-character limit counter on Conventional Commit messages.

#### Analytics & Health Dashboard
- Clean commit streak tracking and personal best records.
- 8-week historical issue trend bar chart (inline accessible SVG).
- Top 5 common mistakes summary.
- Milestone achievement badges (7, 30, and 100 clean commits).
- Visual Repository Health Report assessing repository configuration, hook status, and hygiene.

#### Old TODO Detector
- Automated detection of `TODO`, `FIXME`, `HACK`, and `XXX` tags inside comments.
- Integration with `git blame --line-porcelain` to evaluate commit age.
- "Find Old TODOs" command scanning tracked files and listing them sorted oldest first.
