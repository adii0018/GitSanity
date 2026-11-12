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
const assert = __importStar(require("assert"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const redact_1 = require("./redact");
const gitRunner_1 = require("./gitRunner");
const repoDetector_1 = require("./repoDetector");
const gitignoreTemplate_1 = require("./gitignoreTemplate");
const repoInitializer_1 = require("./repoInitializer");
const hookText_1 = require("./hookText");
const stagedFiles_1 = require("./stagedFiles");
const commitMessage_1 = require("./commitMessage");
const githubPublisher_1 = require("./githubPublisher");
const projectScanner_1 = require("../scanner/projectScanner");
const historyScanner_1 = require("./historyScanner");
const configSchema_1 = require("../config/configSchema");
async function withTempDir(fn) {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gitsanity-test-'));
    try {
        await fn(tmpDir);
    }
    finally {
        try {
            await fs.promises.rm(tmpDir, { recursive: true, force: true });
        }
        catch { }
    }
}
async function setupGitRepo(dir) {
    await (0, gitRunner_1.runGit)(['init', '-b', 'main'], dir);
    await (0, gitRunner_1.runGit)(['config', 'user.name', 'GitSanity Test'], dir);
    await (0, gitRunner_1.runGit)(['config', 'user.email', 'test@gitsanity.local'], dir);
}
async function runTests() {
    console.log('Running Git & Phase 4/5 integration tests...\n');
    // 1. Redact
    {
        assert.strictEqual((0, redact_1.redactValue)('AKIAIOSFODNN7EXAMPLE'), 'AKI***');
        assert.strictEqual((0, redact_1.redactValue)('hi'), '***');
        const sample = 'https://user:secretPass123@github.com/my/repo.git';
        assert.strictEqual((0, redact_1.redact)(sample), 'https://***@github.com/my/repo.git');
        const tokenText = 'Use ghp_1234567890abcdef12345 and gho_abcdef123456789012345 to authenticate.';
        const redactedTokens = (0, redact_1.redact)(tokenText);
        assert.ok(!redactedTokens.includes('ghp_1234567890abcdef12345'));
        assert.ok(!redactedTokens.includes('gho_abcdef123456789012345'));
        assert.ok(redactedTokens.includes('ghp_***'));
        assert.ok(redactedTokens.includes('gho_***'));
        const custom = (0, redact_1.redact)('My password is superSecretPassword here', ['superSecretPassword']);
        assert.ok(!custom.includes('superSecretPassword'));
        assert.ok(custom.includes('sup***'));
    }
    console.log('✓ Redact passed');
    // 2. buildGitignore
    {
        const gi = (0, gitignoreTemplate_1.buildGitignore)(['node', 'python']);
        assert.ok(gi.includes('.env'));
        assert.ok(gi.includes('!.env.example'));
        assert.ok(gi.includes('node_modules/'));
        assert.ok(gi.includes('__pycache__/'));
    }
    console.log('✓ buildGitignore passed');
    // 3. hookText
    {
        // Empty
        const initial = (0, hookText_1.installHookBlock)(undefined);
        assert.ok((0, hookText_1.isHookInstalled)(initial));
        assert.ok(initial.startsWith('#!/bin/sh'));
        // Idempotent
        const twice = (0, hookText_1.installHookBlock)(initial);
        assert.strictEqual(initial, twice);
        // Existing hook with content
        const existing = '#!/bin/sh\necho "Hello from existing hook"\n';
        const merged = (0, hookText_1.installHookBlock)(existing);
        assert.ok(merged.includes('Hello from existing hook'));
        assert.ok((0, hookText_1.isHookInstalled)(merged));
        // Remove
        const removed = (0, hookText_1.removeHookBlock)(merged);
        assert.ok(removed !== undefined);
        assert.ok(!(0, hookText_1.isHookInstalled)(removed));
        assert.ok(removed.includes('Hello from existing hook'));
        // Remove from clean initial hook should delete (returns undefined)
        const emptyRemoved = (0, hookText_1.removeHookBlock)(initial);
        assert.strictEqual(emptyRemoved, undefined);
    }
    console.log('✓ hookText passed');
    // 4. parseStatusPorcelain & buildCommitMessage
    {
        const porcelain = 'M  src/index.ts\0 A test/app.test.ts\0?? untracked.txt\0';
        const parsed = (0, stagedFiles_1.parseStatusPorcelain)(porcelain);
        assert.strictEqual(parsed.staged.length, 1);
        assert.strictEqual(parsed.staged[0].path, 'src/index.ts');
        assert.strictEqual(parsed.unstaged.length, 1);
        assert.strictEqual(parsed.unstaged[0].path, 'test/app.test.ts');
        assert.strictEqual(parsed.untracked.length, 1);
        assert.strictEqual(parsed.untracked[0], 'untracked.txt');
        // Rename in porcelain
        const renamePorcelain = 'R  new.ts\0old.ts\0';
        const parsedRename = (0, stagedFiles_1.parseStatusPorcelain)(renamePorcelain);
        assert.strictEqual(parsedRename.staged.length, 1);
        assert.strictEqual(parsedRename.staged[0].path, 'new.ts');
        // Commit messages
        assert.strictEqual((0, commitMessage_1.buildCommitMessage)([{ path: 'README.md', status: 'M' }]), 'docs(README.md): update README.md');
        assert.strictEqual((0, commitMessage_1.buildCommitMessage)([{ path: 'src/app.test.ts', status: 'M' }]), 'test(app.test.ts): update app.test.ts');
        assert.strictEqual((0, commitMessage_1.buildCommitMessage)([{ path: 'package.json', status: 'M' }]), 'chore(package.json): update package.json');
        assert.strictEqual((0, commitMessage_1.buildCommitMessage)([{ path: 'src/feature.ts', status: 'A' }]), 'feat(feature.ts): add feature.ts');
        assert.strictEqual((0, commitMessage_1.buildCommitMessage)([{ path: 'src/old.ts', status: 'D' }]), 'chore(old.ts): remove old.ts');
        assert.ok((0, commitMessage_1.buildCommitMessage)([{ path: 'a'.repeat(80), status: 'M' }]).length <= 72);
    }
    console.log('✓ parseStatusPorcelain & buildCommitMessage passed');
    // 5. githubPublisher
    {
        assert.strictEqual((0, githubPublisher_1.validateRepoName)(''), 'Repository name cannot be empty.');
        assert.strictEqual((0, githubPublisher_1.validateRepoName)('valid-repo.name_1'), undefined);
        assert.ok((0, githubPublisher_1.validateRepoName)('invalid repo name') !== undefined);
        assert.ok((0, githubPublisher_1.mapGitHubError)(401, {}).includes('sign in again'));
        assert.ok((0, githubPublisher_1.mapGitHubError)(403, {}).includes('permission denied'));
        assert.ok((0, githubPublisher_1.mapGitHubError)(422, { message: 'name already exists' }).includes('already exists'));
        // Test with injected httpsJsonFn
        const mockHttpsJson = async (options, postData) => {
            assert.strictEqual(options.hostname, 'api.github.com');
            assert.strictEqual(options.method, 'POST');
            assert.strictEqual(postData.name, 'my-repo');
            return {
                status: 201,
                body: {
                    clone_url: 'https://github.com/user/my-repo.git',
                    html_url: 'https://github.com/user/my-repo'
                }
            };
        };
        const res = await (0, githubPublisher_1.createGitHubRepo)({
            token: 'fake_token',
            name: 'my-repo',
            isPrivate: true,
            httpsJsonFn: mockHttpsJson
        });
        assert.strictEqual(res.cloneUrl, 'https://github.com/user/my-repo.git');
    }
    console.log('✓ githubPublisher passed');
    // 6. Config validation for Phase 4/5 fields
    {
        const json = JSON.stringify({
            largeFileMB: 10,
            maxProjectFiles: 5000,
            blockOnWarnings: true
        });
        const { config, errors } = (0, configSchema_1.parseConfig)(json);
        assert.strictEqual(errors.length, 0);
        assert.strictEqual(config.largeFileMB, 10);
        assert.strictEqual(config.maxProjectFiles, 5000);
        assert.strictEqual(config.blockOnWarnings, true);
    }
    console.log('✓ Config Phase 4/5 fields passed');
    // Integration tests requiring git
    const gitOk = await (0, gitRunner_1.isGitInstalled)();
    if (!gitOk) {
        console.log('Git not installed. Skipping live git integration tests.');
        return;
    }
    // 7. detectRepoState integration
    await withTempDir(async (dir) => {
        // Empty folder
        const noRepo = await (0, repoDetector_1.detectRepoState)(dir);
        assert.strictEqual(noRepo.state, 'no-repo');
        // Initialized repo without commits
        await setupGitRepo(dir);
        const localNoCommits = await (0, repoDetector_1.detectRepoState)(dir);
        assert.strictEqual(localNoCommits.state, 'local-repo');
        assert.strictEqual(localNoCommits.hasCommits, false);
        // Repo with remote and credential stripping
        await (0, gitRunner_1.runGit)(['remote', 'add', 'origin', 'https://user:token123@github.com/user/repo.git'], dir);
        const withRemote = await (0, repoDetector_1.detectRepoState)(dir);
        assert.strictEqual(withRemote.state, 'remote-repo');
        assert.strictEqual(withRemote.isGitHub, true);
        assert.ok(withRemote.remotes[0].url.includes('***'));
        assert.ok(!withRemote.remotes[0].url.includes('token123'));
    });
    console.log('✓ detectRepoState integration passed');
    // 8. initRepo integration
    await withTempDir(async (dir) => {
        await fs.promises.writeFile(path.join(dir, 'package.json'), '{}', 'utf8');
        const initRes = await (0, repoInitializer_1.initRepo)(dir);
        assert.strictEqual(initRes.success, true);
        assert.strictEqual(initRes.createdGitignore, true);
        const giContent = await fs.promises.readFile(path.join(dir, '.gitignore'), 'utf8');
        assert.ok(giContent.includes('node_modules/'));
        assert.ok(giContent.includes('.env'));
        // Re-running on existing repo fails safely
        const reInit = await (0, repoInitializer_1.initRepo)(dir);
        assert.strictEqual(reInit.success, false);
    });
    console.log('✓ initRepo integration passed');
    // 9. projectScanner integration
    await withTempDir(async (dir) => {
        await setupGitRepo(dir);
        // Add normal file
        await fs.promises.writeFile(path.join(dir, 'app.js'), 'console.log("hello");\n', 'utf8');
        // Add binary file
        const binBuf = Buffer.from([0, 1, 2, 3, 4]);
        await fs.promises.writeFile(path.join(dir, 'binary.dat'), binBuf);
        // Add .env file
        await fs.promises.writeFile(path.join(dir, '.env'), 'SECRET=123\n', 'utf8');
        const scan = await (0, projectScanner_1.scanProject)(dir, {
            config: {
                ...configSchema_1.DEFAULT_CONFIG,
                maxProjectFiles: 10
            }
        });
        assert.strictEqual(scan.byFile.has('app.js'), true);
        assert.strictEqual(scan.byFile.has('binary.dat'), false);
        assert.strictEqual(scan.byFile.has('.env'), false);
    });
    console.log('✓ projectScanner integration passed');
    // 10. historyScanner integration
    await withTempDir(async (dir) => {
        await setupGitRepo(dir);
        // Commit a fake AWS key
        const secretFile = path.join(dir, 'config.js');
        await fs.promises.writeFile(secretFile, 'const key = "AKIAIOSFODNN7EXAMPLE";\n', 'utf8');
        await (0, gitRunner_1.runGit)(['add', 'config.js'], dir);
        await (0, gitRunner_1.runGit)(['commit', '-m', 'add key'], dir);
        // Remove the secret in a second commit
        await fs.promises.writeFile(secretFile, 'const key = process.env.KEY;\n', 'utf8');
        await (0, gitRunner_1.runGit)(['add', 'config.js'], dir);
        await (0, gitRunner_1.runGit)(['commit', '-m', 'remove key'], dir);
        const historyRes = await (0, historyScanner_1.scanHistory)(dir, { maxCommits: 10 });
        assert.strictEqual(historyRes.findings.length, 1);
        assert.strictEqual(historyRes.findings[0].file, 'config.js');
        assert.strictEqual(historyRes.findings[0].ruleId, 'secret');
        assert.ok(!JSON.stringify(historyRes.findings).includes('AKIAIOSFODNN7EXAMPLE'));
        assert.ok(historyRes.findings[0].redactedPreview.includes('AKI***'));
    });
    console.log('✓ historyScanner integration passed');
    console.log('\nAll Git & Phase 4/5 integration tests passed successfully!');
}
runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=git.test.js.map