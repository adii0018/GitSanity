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
const gitRunner_1 = require("../git/gitRunner");
const precommitCore_1 = require("./precommitCore");
async function withTempRepo(fn) {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gitsanity-hook-test-'));
    try {
        await (0, gitRunner_1.runGit)(['init', '-b', 'main'], tmpDir);
        await (0, gitRunner_1.runGit)(['config', 'user.name', 'Hook Tester'], tmpDir);
        await (0, gitRunner_1.runGit)(['config', 'user.email', 'hook@gitsanity.local'], tmpDir);
        await fn(tmpDir);
    }
    finally {
        try {
            await fs.promises.rm(tmpDir, { recursive: true, force: true });
        }
        catch { }
    }
}
async function runTests() {
    console.log('Running Pre-commit Hook integration tests...\n');
    const gitOk = await (0, gitRunner_1.isGitInstalled)();
    if (!gitOk) {
        console.log('Git not installed. Skipping hook integration tests.');
        return;
    }
    // 1. Clean staged file -> exit 0
    await withTempRepo(async (dir) => {
        await fs.promises.writeFile(path.join(dir, 'clean.js'), 'const a = 1;\n', 'utf8');
        await (0, gitRunner_1.runGit)(['add', 'clean.js'], dir);
        const logs = [];
        const code = await (0, precommitCore_1.runPrecommit)({ root: dir, stdout: (msg) => logs.push(msg) });
        assert.strictEqual(code, 0, 'Clean staged file should pass pre-commit');
    });
    console.log('✓ Clean staged file passed (code 0)');
    // 2. Staged fake AWS key -> exit 1
    await withTempRepo(async (dir) => {
        await fs.promises.writeFile(path.join(dir, 'secret.js'), 'const key = "AKIAIOSFODNN7EXAMPLE";\n', 'utf8');
        await (0, gitRunner_1.runGit)(['add', 'secret.js'], dir);
        const logs = [];
        const code = await (0, precommitCore_1.runPrecommit)({ root: dir, stdout: (msg) => logs.push(msg) });
        assert.strictEqual(code, 1, 'Staged AWS key must block pre-commit');
        assert.ok(logs.some((l) => l.includes('secret') && l.includes('secret.js')));
        // Must never print the secret value in logs
        assert.ok(!logs.join(' ').includes('AKIAIOSFODNN7EXAMPLE'));
    });
    console.log('✓ Staged secret blocked (code 1)');
    // 3. Staged .env file -> exit 1
    await withTempRepo(async (dir) => {
        await fs.promises.writeFile(path.join(dir, '.env'), 'SECRET_TOKEN=xyz\n', 'utf8');
        await (0, gitRunner_1.runGit)(['add', '.env'], dir);
        const logs = [];
        const code = await (0, precommitCore_1.runPrecommit)({ root: dir, stdout: (msg) => logs.push(msg) });
        assert.strictEqual(code, 1, 'Staged .env file must block pre-commit');
        assert.ok(logs.some((l) => l.includes('env-file-staged')));
    });
    console.log('✓ Staged .env blocked (code 1)');
    // 4. Secret staged and then removed from working tree only -> still 1 (index wins!)
    await withTempRepo(async (dir) => {
        const filePath = path.join(dir, 'index-test.js');
        await fs.promises.writeFile(filePath, 'const key = "AKIAIOSFODNN7EXAMPLE";\n', 'utf8');
        await (0, gitRunner_1.runGit)(['add', 'index-test.js'], dir);
        // Overwrite in working tree with safe code without staging
        await fs.promises.writeFile(filePath, 'const key = "safe";\n', 'utf8');
        const logs = [];
        const code = await (0, precommitCore_1.runPrecommit)({ root: dir, stdout: (msg) => logs.push(msg) });
        assert.strictEqual(code, 1, 'Index version must be checked, not working tree');
    });
    console.log('✓ Index content check passed (working tree modification did not bypass check)');
    // 5. Large file warning -> warning only (code 0)
    await withTempRepo(async (dir) => {
        // Configure largeFileMB: 0.001 (approx 1 KB threshold for test)
        const configPath = path.join(dir, '.gitsanity.json');
        await fs.promises.writeFile(configPath, JSON.stringify({
            largeFileMB: 0.0005, // ~500 bytes
            blockOnWarnings: false
        }), 'utf8');
        const largePath = path.join(dir, 'large.txt');
        await fs.promises.writeFile(largePath, 'A'.repeat(2000), 'utf8');
        await (0, gitRunner_1.runGit)(['add', 'large.txt'], dir);
        const logs = [];
        const code = await (0, precommitCore_1.runPrecommit)({ root: dir, stdout: (msg) => logs.push(msg) });
        assert.strictEqual(code, 0, 'Large file warning should not block when blockOnWarnings is false');
        assert.ok(logs.some((l) => l.includes('large-file')));
    });
    console.log('✓ Large file warning passed (code 0)');
    // 6. blockOnWarnings: true -> exit 1 on warnings
    await withTempRepo(async (dir) => {
        const configPath = path.join(dir, '.gitsanity.json');
        await fs.promises.writeFile(configPath, JSON.stringify({
            blockOnWarnings: true
        }), 'utf8');
        // console-log produces a warning
        await fs.promises.writeFile(path.join(dir, 'warn.js'), 'console.log("hello");\n', 'utf8');
        await (0, gitRunner_1.runGit)(['add', 'warn.js'], dir);
        const logs = [];
        const code = await (0, precommitCore_1.runPrecommit)({ root: dir, stdout: (msg) => logs.push(msg) });
        assert.strictEqual(code, 1, 'blockOnWarnings: true must exit 1 on warnings');
    });
    console.log('✓ blockOnWarnings: true blocked (code 1)');
    // 7. Internal exception returns 0 (never blocks developers due to hook crash)
    {
        const code = await (0, precommitCore_1.runPrecommit)({
            root: 'non_existent_folder_xyz_123'
        });
        assert.strictEqual(code, 0, 'Internal error should gracefully fall back to exit 0');
    }
    console.log('✓ Hook error graceful fallback passed (code 0)');
    console.log('\nAll Pre-commit Hook integration tests passed successfully!');
}
runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=hook.test.js.map