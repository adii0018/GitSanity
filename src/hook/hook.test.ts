import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runGit, isGitInstalled } from '../git/gitRunner';
import { runPrecommit } from './precommitCore';

async function withTempRepo(fn: (dir: string) => Promise<void>): Promise<void> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gitsanity-hook-test-'));
  try {
    await runGit(['init', '-b', 'main'], tmpDir);
    await runGit(['config', 'user.name', 'Hook Tester'], tmpDir);
    await runGit(['config', 'user.email', 'hook@gitsanity.local'], tmpDir);
    await fn(tmpDir);
  } finally {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

async function runTests(): Promise<void> {
  console.log('Running Pre-commit Hook integration tests...\n');

  const gitOk = await isGitInstalled();
  if (!gitOk) {
    console.log('Git not installed. Skipping hook integration tests.');
    return;
  }

  // 1. Clean staged file -> exit 0
  await withTempRepo(async (dir) => {
    await fs.promises.writeFile(path.join(dir, 'clean.js'), 'const a = 1;\n', 'utf8');
    await runGit(['add', 'clean.js'], dir);

    const logs: string[] = [];
    const code = await runPrecommit({ root: dir, stdout: (msg) => logs.push(msg) });
    assert.strictEqual(code, 0, 'Clean staged file should pass pre-commit');
  });
  console.log('✓ Clean staged file passed (code 0)');

  // 2. Staged fake AWS key -> exit 1
  await withTempRepo(async (dir) => {
    await fs.promises.writeFile(path.join(dir, 'secret.js'), 'const key = "AKIAIOSFODNN7EXAMPLE";\n', 'utf8');
    await runGit(['add', 'secret.js'], dir);

    const logs: string[] = [];
    const code = await runPrecommit({ root: dir, stdout: (msg) => logs.push(msg) });
    assert.strictEqual(code, 1, 'Staged AWS key must block pre-commit');
    assert.ok(logs.some((l) => l.includes('secret') && l.includes('secret.js')));
    // Must never print the secret value in logs
    assert.ok(!logs.join(' ').includes('AKIAIOSFODNN7EXAMPLE'));
  });
  console.log('✓ Staged secret blocked (code 1)');

  // 3. Staged .env file -> exit 1
  await withTempRepo(async (dir) => {
    await fs.promises.writeFile(path.join(dir, '.env'), 'SECRET_TOKEN=xyz\n', 'utf8');
    await runGit(['add', '.env'], dir);

    const logs: string[] = [];
    const code = await runPrecommit({ root: dir, stdout: (msg) => logs.push(msg) });
    assert.strictEqual(code, 1, 'Staged .env file must block pre-commit');
    assert.ok(logs.some((l) => l.includes('env-file-staged')));
  });
  console.log('✓ Staged .env blocked (code 1)');

  // 4. Secret staged and then removed from working tree only -> still 1 (index wins!)
  await withTempRepo(async (dir) => {
    const filePath = path.join(dir, 'index-test.js');
    await fs.promises.writeFile(filePath, 'const key = "AKIAIOSFODNN7EXAMPLE";\n', 'utf8');
    await runGit(['add', 'index-test.js'], dir);

    // Overwrite in working tree with safe code without staging
    await fs.promises.writeFile(filePath, 'const key = "safe";\n', 'utf8');

    const logs: string[] = [];
    const code = await runPrecommit({ root: dir, stdout: (msg) => logs.push(msg) });
    assert.strictEqual(code, 1, 'Index version must be checked, not working tree');
  });
  console.log('✓ Index content check passed (working tree modification did not bypass check)');

  // 5. Large file warning -> warning only (code 0)
  await withTempRepo(async (dir) => {
    // Configure largeFileMB: 0.001 (approx 1 KB threshold for test)
    const configPath = path.join(dir, '.gitsanity.json');
    await fs.promises.writeFile(
      configPath,
      JSON.stringify({
        largeFileMB: 0.0005, // ~500 bytes
        blockOnWarnings: false
      }),
      'utf8'
    );

    const largePath = path.join(dir, 'large.txt');
    await fs.promises.writeFile(largePath, 'A'.repeat(2000), 'utf8');
    await runGit(['add', 'large.txt'], dir);

    const logs: string[] = [];
    const code = await runPrecommit({ root: dir, stdout: (msg) => logs.push(msg) });
    assert.strictEqual(code, 0, 'Large file warning should not block when blockOnWarnings is false');
    assert.ok(logs.some((l) => l.includes('large-file')));
  });
  console.log('✓ Large file warning passed (code 0)');

  // 6. blockOnWarnings: true -> exit 1 on warnings
  await withTempRepo(async (dir) => {
    const configPath = path.join(dir, '.gitsanity.json');
    await fs.promises.writeFile(
      configPath,
      JSON.stringify({
        blockOnWarnings: true
      }),
      'utf8'
    );

    // console-log produces a warning
    await fs.promises.writeFile(path.join(dir, 'warn.js'), 'console.log("hello");\n', 'utf8');
    await runGit(['add', 'warn.js'], dir);

    const logs: string[] = [];
    const code = await runPrecommit({ root: dir, stdout: (msg) => logs.push(msg) });
    assert.strictEqual(code, 1, 'blockOnWarnings: true must exit 1 on warnings');
  });
  console.log('✓ blockOnWarnings: true blocked (code 1)');

  // 7. Internal exception returns 0 (never blocks developers due to hook crash)
  {
    const code = await runPrecommit({
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
