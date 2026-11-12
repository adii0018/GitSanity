import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findTodoLines } from './todoFinder';
import { parseBlamePorcelain } from './blame';
import { getTodoAges } from './todoAge';
import { runGit, isGitInstalled } from '../git/gitRunner';

async function runTodoTests(): Promise<void> {
  console.log('Running TODO & Blame tests...');

  // 1. findTodoLines: matching in various comment styles
  const testCode = [
    '// TODO: fix this bug', // line 0
    'const todoList = [];', // line 1 (identifier, should NOT match)
    'const msg = "TODO in string";', // line 2 (string, should NOT match)
    '# FIXME: python style', // line 3
    '/* HACK: block comment */', // line 4
    ' * XXX: continuation line', // line 5
    '<!-- TODO: html comment -->', // line 6
    '-- FIXME: sql comment', // line 7
    '; HACK: ini comment', // line 8
    '% XXX: erlang comment', // line 9
    'let y = 1; // TODO: end of line comment' // line 10
  ].join('\n');

  const todos = findTodoLines(testCode);
  const matchedLines = todos.map((t) => t.line);

  assert.ok(matchedLines.includes(0), 'Should match // TODO');
  assert.ok(!matchedLines.includes(1), 'Must NOT match identifier todoList');
  assert.ok(!matchedLines.includes(2), 'Must NOT match "TODO" inside string literal');
  assert.ok(matchedLines.includes(3), 'Should match # FIXME');
  assert.ok(matchedLines.includes(4), 'Should match /* HACK');
  assert.ok(matchedLines.includes(5), 'Should match * XXX');
  assert.ok(matchedLines.includes(6), 'Should match <!-- TODO');
  assert.ok(matchedLines.includes(7), 'Should match -- FIXME');
  assert.ok(matchedLines.includes(8), 'Should match ; HACK');
  assert.ok(matchedLines.includes(9), 'Should match % XXX');
  assert.ok(matchedLines.includes(10), 'Should match inline // TODO');

  // Verify tags and column ranges
  const t0 = todos.find((t) => t.line === 0)!;
  assert.strictEqual(t0.tag, 'TODO');
  assert.strictEqual(t0.startCol, 3);
  assert.strictEqual(t0.endCol, 7);

  // 2. parseBlamePorcelain with fixture text
  const fixturePorcelain = [
    'd85b09f187382d56a3e14ef2858b4bcf42054c2a 1 1 1',
    'author Alice',
    'author-mail <alice@example.com>',
    'author-time 1700000000',
    'author-tz +0000',
    'committer Alice',
    'committer-time 1700000000',
    'committer-tz +0000',
    'summary Initial commit',
    'filename test.js',
    '\t// TODO: old comment',
    '0000000000000000000000000000000000000000 2 2 1',
    'author Not Committed',
    'author-time 1720000000',
    'filename test.js',
    '\t// TODO: uncommitted change'
  ].join('\n');

  const blameMap = parseBlamePorcelain(fixturePorcelain);
  assert.strictEqual(blameMap.size, 1, 'Should only contain committed line (line 1)');
  const line1Info = blameMap.get(1);
  assert.ok(line1Info, 'Line 1 info must be present');
  assert.strictEqual(line1Info!.authorTime, 1700000000);
  assert.strictEqual(line1Info!.commit, 'd85b09f187382d56a3e14ef2858b4bcf42054c2a');
  assert.strictEqual(blameMap.has(2), false, 'Line 2 with 0000... commit must be ignored');

  // 3. getTodoAges with real temp git repo
  if (await isGitInstalled()) {
    const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gitsanity-todo-repo-'));
    try {
      await runGit(['init', '-b', 'main'], tempRepo);
      await runGit(['config', 'user.name', 'Tester'], tempRepo);
      await runGit(['config', 'user.email', 'tester@example.com'], tempRepo);

      const filePath = path.join(tempRepo, 'index.js');
      fs.writeFileSync(filePath, '// TODO: ancient task\nconsole.log(1);\n', 'utf8');

      await runGit(['add', 'index.js'], tempRepo);

      // Create a commit backdated 100 days ago
      const nowMs = 1762934400000; // Reference timestamp: ~Nov 2025
      const commitTimeSec = Math.floor((nowMs - 100 * 86400 * 1000) / 1000);
      const env = {
        ...process.env,
        GIT_AUTHOR_DATE: `${commitTimeSec} +0000`,
        GIT_COMMITTER_DATE: `${commitTimeSec} +0000`
      };

      const gitBin = process.platform === 'win32' ? 'git.exe' : 'git';
      const { spawnSync } = require('child_process');
      const commitRes = spawnSync(gitBin, ['commit', '-m', 'Add old todo'], {
        cwd: tempRepo,
        env
      });
      assert.strictEqual(commitRes.status, 0, 'Commit should succeed');

      const ages = await getTodoAges(tempRepo, 'index.js', [0], nowMs, 1);
      assert.ok(ages.has(0), 'Line 0 age must be computed');
      const ageDays = ages.get(0)!;
      assert.ok(ageDays >= 99 && ageDays <= 101, `Age in days should be ~100 (got ${ageDays})`);
    } finally {
      fs.rmSync(tempRepo, { recursive: true, force: true });
    }
  }

  console.log('✓ TODO & Blame tests passed');
}

runTodoTests().catch((err) => {
  console.error('TODO tests failed:', err);
  process.exit(1);
});
