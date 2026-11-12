import * as assert from 'assert';
import { scanText } from './scanner';
import { installHookBlock } from '../git/hookText';

console.log('Running Audit & Edge-Case Tests...');

// 1. Markdown Setext headings must NOT trigger conflict-marker
{
  const markdownHeading = 'My Document Title\n=======';
  const findings = scanText(markdownHeading);
  assert.strictEqual(
    findings.filter(f => f.ruleId === 'conflict-marker').length,
    0,
    'Markdown setext heading should not trigger conflict-marker'
  );

  const crlfHeading = 'Section Heading\r\n=======';
  const crlfFindings = scanText(crlfHeading);
  assert.strictEqual(
    crlfFindings.filter(f => f.ruleId === 'conflict-marker').length,
    0,
    'CRLF Markdown setext heading should not trigger conflict-marker'
  );
}

// 2. Real merge conflict blocks MUST trigger conflict-marker
{
  const conflictText = [
    '<<<<<<< HEAD',
    'const x = 1;',
    '=======',
    'const x = 2;',
    '>>>>>>> feature'
  ].join('\n');

  const findings = scanText(conflictText);
  const conflictMarkers = findings.filter(f => f.ruleId === 'conflict-marker');
  assert.strictEqual(conflictMarkers.length, 3, 'Should flag head, separator, and end conflict markers');
}

// 3. Standalone ======= without preceding title should still trigger conflict-marker
{
  const standalone = scanText('=======');
  assert.strictEqual(standalone.length, 1);
  assert.strictEqual(standalone[0].ruleId, 'conflict-marker');
}

// 4. Secret rule must NOT flag UUIDs
{
  const uuidFinding = scanText('const token = "12345678-1234-1234-1234-123456789abc";');
  assert.strictEqual(
    uuidFinding.filter(f => f.ruleId === 'secret').length,
    0,
    'UUID should not be flagged as secret'
  );
}

// 5. Secret rule must NOT flag lockfile integrity strings
{
  const integrityFinding = scanText('const token = "sha512-u1234567890abcdef1234567890abcdef==";');
  assert.strictEqual(
    integrityFinding.filter(f => f.ruleId === 'secret').length,
    0,
    'Lockfile integrity string should not be flagged as secret'
  );
}

// 6. Secret rule must NOT flag example placeholders
{
  const placeholderFinding = scanText('const apiKey = "your-api-key-here";');
  assert.strictEqual(
    placeholderFinding.filter(f => f.ruleId === 'secret').length,
    0,
    'Placeholder "your-api-key-here" should not be flagged as secret'
  );

  const dummyFinding = scanText('const secret = "dummy-secret-placeholder";');
  assert.strictEqual(
    dummyFinding.filter(f => f.ruleId === 'secret').length,
    0,
    'Placeholder "dummy-secret-placeholder" should not be flagged as secret'
  );
}

// 7. Secret rule must NOT flag Git commit hashes
{
  const gitHashFinding = scanText('const commit_sha = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";');
  assert.strictEqual(
    gitHashFinding.filter(f => f.ruleId === 'secret').length,
    0,
    'Git commit SHA should not be flagged as secret'
  );
}

// 8. Secret rule MUST still flag actual secrets
{
  const realKey = scanText('const apiKey = "1234567890abcdef1234";');
  assert.strictEqual(realKey.some(f => f.ruleId === 'secret'), true);

  const awsKey = scanText('const key = "AKIAIOSFODNN7EXAMPLE";');
  assert.strictEqual(awsKey.some(f => f.ruleId === 'secret'), true);
}

// 9. BOM handling
{
  const bomText = '\uFEFFconst x = 1;\nconsole.log(x);';
  const findings = scanText(bomText);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].ruleId, 'console-log');
}

// 10. ReDoS resilience on 100 KB line
{
  const longLine = 'const payload = "' + 'a'.repeat(100000) + '";';
  const start = Date.now();
  const findings = scanText(longLine);
  const duration = Date.now() - start;
  assert.strictEqual(duration < 100, true, `Scanning 100KB line took too long: ${duration} ms`);
}

// 11. Emoji UTF-16 offset mapping
{
  const emojiLine = '🔑 console.log("secret");';
  const findings = scanText(emojiLine);
  assert.strictEqual(findings.length, 1);
  // '🔑 ' is 2 code units for emoji + 1 for space = 3
  assert.strictEqual(findings[0].startCol, 3);
  assert.strictEqual(findings[0].endCol, 15); // 'console.log(' is 12 chars: 3 + 12 = 15
}

// 12. Hook LF (\n) enforcement
{
  const crlfHook = '#!/bin/sh\r\necho "test"\r\n';
  const updated = installHookBlock(crlfHook);
  assert.strictEqual(updated.includes('\r'), false, 'Hook script must not contain carriage returns');
}

console.log('All Audit & Edge-Case Tests Passed!');
