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
const scanner_1 = require("./scanner");
const pathMatcher_1 = require("../config/pathMatcher");
const configSchema_1 = require("../config/configSchema");
const envName_1 = require("../env/envName");
const envFile_1 = require("../env/envFile");
const gitignoreFile_1 = require("../env/gitignoreFile");
const envAccess_1 = require("../env/envAccess");
console.log('Running GitSanity tests (Phase 1, 2, 3)...\n');
// ============================================================================
// 1. Core Rule Detection and Near-Misses
// ============================================================================
// console-log
{
    const hit = (0, scanner_1.scanText)('console.log("test");');
    assert.strictEqual(hit.length, 1);
    assert.strictEqual(hit[0].ruleId, 'console-log');
    assert.strictEqual(hit[0].severity, 'warning');
    const miss1 = (0, scanner_1.scanText)('myConsole.log("test");');
    assert.strictEqual(miss1.length, 0, 'myConsole.log should not trigger console-log');
    const miss2 = (0, scanner_1.scanText)('console.error("test");');
    assert.strictEqual(miss2.length, 0, 'console.error should not trigger console-log');
}
// debugger
{
    const hit = (0, scanner_1.scanText)('debugger;');
    assert.strictEqual(hit.length, 1);
    assert.strictEqual(hit[0].ruleId, 'debugger');
    assert.strictEqual(hit[0].severity, 'error');
    const miss = (0, scanner_1.scanText)('const debugHelper = true;');
    assert.strictEqual(miss.length, 0, 'debugHelper should not trigger debugger');
}
// conflict-marker
{
    const hitHead = (0, scanner_1.scanText)('<<<<<<< HEAD');
    assert.strictEqual(hitHead.length, 1);
    assert.strictEqual(hitHead[0].ruleId, 'conflict-marker');
    const hitSep = (0, scanner_1.scanText)('=======');
    assert.strictEqual(hitSep.length, 1);
    assert.strictEqual(hitSep[0].ruleId, 'conflict-marker');
    const hitEnd = (0, scanner_1.scanText)('>>>>>>> feature-branch');
    assert.strictEqual(hitEnd.length, 1);
    assert.strictEqual(hitEnd[0].ruleId, 'conflict-marker');
    const missHeading = (0, scanner_1.scanText)('===== Section Title =====');
    assert.strictEqual(missHeading.length, 0, 'Markdown section header should not trigger conflict-marker');
    const missShort = (0, scanner_1.scanText)('=====');
    assert.strictEqual(missShort.length, 0, 'Short equals should not trigger conflict-marker');
}
// secret: AWS key, generic assignment, hex secret, and bare hex hash near-miss
{
    const hitAws = (0, scanner_1.scanText)('const key = "AKIAIOSFODNN7EXAMPLE";');
    assert.strictEqual(hitAws.some(f => f.ruleId === 'secret'), true);
    const missAwsShort = (0, scanner_1.scanText)('const key = "AKIA123";');
    assert.strictEqual(missAwsShort.length, 0, 'Short AKIA string should not trigger secret');
    const hitGeneric = (0, scanner_1.scanText)('const apiKey = "1234567890abcdef1234";');
    assert.strictEqual(hitGeneric.some(f => f.ruleId === 'secret'), true);
    const hitHex = (0, scanner_1.scanText)('const password = "4f53c89b33a5b3a4f53c89b33a5b3a4f";');
    assert.strictEqual(hitHex.some(f => f.ruleId === 'secret'), true);
    const missBareHex = (0, scanner_1.scanText)('const gitCommit = "4f53c89b33a5b3a4f53c89b33a5b3a4f4f53c89b";');
    assert.strictEqual(missBareHex.length, 0, 'Bare git commit hex hash should not trigger secret');
    const missLockfileIntegrity = (0, scanner_1.scanText)('integrity: "sha512-4f53c89b33a5b3a4f53c89b33a5b3a4f4f53c89b=="');
    assert.strictEqual(missLockfileIntegrity.length, 0, 'Lockfile integrity string should not trigger secret');
}
console.log('✓ Rule detection and near-misses passed');
// ============================================================================
// 2. Configurable Rules: 'off', 'warn', 'error'
// ============================================================================
{
    const turnedOff = (0, scanner_1.scanText)('console.log("hello");', {
        rules: { 'console-log': 'off' }
    });
    assert.strictEqual(turnedOff.length, 0, 'Rule set to "off" must produce no findings');
    const setWarn = (0, scanner_1.scanText)('debugger;', {
        rules: { debugger: 'warn' }
    });
    assert.strictEqual(setWarn.length, 1);
    assert.strictEqual(setWarn[0].severity, 'warning', 'Rule set to "warn" must report warning');
    const setError = (0, scanner_1.scanText)('console.log("hello");', {
        rules: { 'console-log': 'error' }
    });
    assert.strictEqual(setError.length, 1);
    assert.strictEqual(setError[0].severity, 'error', 'Rule set to "error" must report error');
}
console.log('✓ Config severity and off-switch passed');
// ============================================================================
// 3. Inline Ignore Comments
// ============================================================================
// Same-line ignore all
{
    const res = (0, scanner_1.scanText)('console.log("debug"); // gitsanity-ignore');
    assert.strictEqual(res.length, 0, 'Same-line gitsanity-ignore should ignore all');
}
// Same-line ignore specific rule
{
    const res = (0, scanner_1.scanText)('console.log("debug"); debugger; // gitsanity-ignore console-log');
    assert.strictEqual(res.length, 1, 'Only debugger should remain');
    assert.strictEqual(res[0].ruleId, 'debugger');
    const resUnknown = (0, scanner_1.scanText)('console.log("debug"); // gitsanity-ignore unknown-rule-xyz');
    assert.strictEqual(resUnknown.length, 0, 'Unknown ignore rule name should fallback to ignore-all');
}
// Next-line ignore
{
    const text = [
        '// gitsanity-ignore-next-line',
        'console.log("ignored");',
        'console.log("not ignored");'
    ].join('\n');
    const res = (0, scanner_1.scanText)(text);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].line, 2);
}
// Next-line ignore specific rule
{
    const text = [
        '// gitsanity-ignore-next-line console-log',
        'console.log("ignored"); debugger;'
    ].join('\n');
    const res = (0, scanner_1.scanText)(text);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].ruleId, 'debugger');
}
// File-level ignore in first 10 lines
{
    const textInFirst10 = [
        '// File header',
        '// gitsanity-ignore-file',
        'console.log("bad");',
        'debugger;',
        '<<<<<<< HEAD'
    ].join('\n');
    assert.strictEqual((0, scanner_1.scanText)(textInFirst10).length, 0, 'File ignore in first 10 lines must ignore whole file');
    const textAfterFirst10 = [
        '// 1', '// 2', '// 3', '// 4', '// 5',
        '// 6', '// 7', '// 8', '// 9', '// 10',
        '// gitsanity-ignore-file',
        'console.log("bad");'
    ].join('\n');
    assert.strictEqual((0, scanner_1.scanText)(textAfterFirst10).length, 1, 'File ignore after first 10 lines should not ignore the file');
}
console.log('✓ Inline ignore directives passed');
// ============================================================================
// 4. Entropy Detection
// ============================================================================
{
    // Flags random base64 token (not a secret assignment)
    const tokenLine = 'const payload = "q8Zr3KfX2mVn9LpA7sTyWb4Hc1Jd";';
    const tokenHits = (0, scanner_1.scanText)(tokenLine);
    assert.strictEqual(tokenHits.length, 1);
    assert.strictEqual(tokenHits[0].ruleId, 'high-entropy-string');
    assert.strictEqual(tokenHits[0].severity, 'warning');
    // Does NOT flag UUID
    const uuidLine = 'const id = "123e4567-e89b-12d3-a456-426614174000";';
    assert.strictEqual((0, scanner_1.scanText)(uuidLine).length, 0, 'UUID must not be flagged by entropy');
    // Does NOT flag URL
    const urlLine = 'const endpoint = "https://example.com/api/v1/auth/callback/token";';
    assert.strictEqual((0, scanner_1.scanText)(urlLine).length, 0, 'URL must not be flagged by entropy');
    // Does NOT flag pure camelCase identifier
    const camelLine = 'const name = "thisIsJustALongCamelCaseName";';
    assert.strictEqual((0, scanner_1.scanText)(camelLine).length, 0, 'Pure letters camelCase must not be flagged by entropy');
    // Avoid duplicate when secret rule already flagged the line
    const secretLine = 'const secret = "q8Zr3KfX2mVn9LpA7sTyWb4Hc1Jd";';
    const secretHits = (0, scanner_1.scanText)(secretLine);
    assert.strictEqual(secretHits.some(f => f.ruleId === 'secret'), true, 'Should have secret finding');
    assert.strictEqual(secretHits.some(f => f.ruleId === 'high-entropy-string'), false, 'Should not duplicate with high-entropy-string if secret already fired on line');
}
console.log('✓ Entropy detection passed');
// ============================================================================
// 5. Path Matcher
// ============================================================================
{
    // "tests/" matches "src/tests/a.js" and "tests/a.js"
    assert.strictEqual((0, pathMatcher_1.isIgnored)('src/tests/a.js', ['tests/']), true);
    assert.strictEqual((0, pathMatcher_1.isIgnored)('tests/a.js', ['tests/']), true);
    assert.strictEqual((0, pathMatcher_1.isIgnored)('sub/nested/tests/foo.ts', ['tests/']), true);
    // "*.min.js" matches "dist/app.min.js"
    assert.strictEqual((0, pathMatcher_1.isIgnored)('dist/app.min.js', ['*.min.js']), true);
    assert.strictEqual((0, pathMatcher_1.isIgnored)('app.min.js', ['*.min.js']), true);
    // "docs/**/*.md" matches "docs/a/b/c.md"
    assert.strictEqual((0, pathMatcher_1.isIgnored)('docs/a/b/c.md', ['docs/**/*.md']), true);
    assert.strictEqual((0, pathMatcher_1.isIgnored)('docs/readme.md', ['docs/**/*.md']), true);
    // Default built-in ignores
    assert.strictEqual((0, pathMatcher_1.isIgnored)('node_modules/pkg/index.js'), true);
    assert.strictEqual((0, pathMatcher_1.isIgnored)('.git/config'), true);
    assert.strictEqual((0, pathMatcher_1.isIgnored)('out/extension.js'), true);
    assert.strictEqual((0, pathMatcher_1.isIgnored)('package-lock.json'), true);
    // Non-ignored file
    assert.strictEqual((0, pathMatcher_1.isIgnored)('src/scanner/scanner.ts'), false);
}
console.log('✓ Path matching passed');
// ============================================================================
// 6. Config Parser Validation
// ============================================================================
{
    const validJson = JSON.stringify({
        rules: {
            'console-log': 'off',
            debugger: 'warn'
        },
        ignorePaths: ['build/'],
        maxFileSizeMB: 2,
        envFile: '.env.local',
        envExampleFile: '.env.example.local',
        createEnvExample: false
    });
    const { config, errors } = (0, configSchema_1.parseConfig)(validJson);
    assert.strictEqual(errors.length, 0);
    assert.strictEqual(config.rules['console-log'], 'off');
    assert.strictEqual(config.rules['debugger'], 'warn');
    assert.strictEqual(config.rules['secret'], 'error', 'Unspecified rules retain default');
    assert.deepStrictEqual(config.ignorePaths, ['build/']);
    assert.strictEqual(config.maxFileSizeMB, 2);
    assert.strictEqual(config.envFile, '.env.local');
    assert.strictEqual(config.envExampleFile, '.env.example.local');
    assert.strictEqual(config.createEnvExample, false);
    // Invalid envFile paths with '..' or absolute paths
    const invalidEnvJson = JSON.stringify({
        envFile: '../secret/.env',
        envExampleFile: '/etc/passwd',
        createEnvExample: 'not-a-boolean'
    });
    const invalidEnvRes = (0, configSchema_1.parseConfig)(invalidEnvJson);
    assert.strictEqual(invalidEnvRes.errors.length, 3);
    assert.strictEqual(invalidEnvRes.config.envFile, configSchema_1.DEFAULT_CONFIG.envFile);
    assert.strictEqual(invalidEnvRes.config.envExampleFile, configSchema_1.DEFAULT_CONFIG.envExampleFile);
    // Invalid JSON recovers with defaults
    const invalidJson = '{ not valid json';
    const invalidRes = (0, configSchema_1.parseConfig)(invalidJson);
    assert.strictEqual(invalidRes.errors.length, 1);
    assert.deepStrictEqual(invalidRes.config.rules, configSchema_1.DEFAULT_CONFIG.rules);
    // Unknown rule reports error and ignores it
    const unknownRuleJson = JSON.stringify({
        rules: { 'fake-rule': 'error', 'console-log': 'off' }
    });
    const unknownRes = (0, configSchema_1.parseConfig)(unknownRuleJson);
    assert.strictEqual(unknownRes.errors.length, 1);
    assert.strictEqual(unknownRes.config.rules['console-log'], 'off');
}
console.log('✓ Config parsing & schema validation passed');
// ============================================================================
// 7. Phase 3: Env Name Conversion (toEnvVarName)
// ============================================================================
{
    assert.strictEqual((0, envName_1.toEnvVarName)('apiKey', 1), 'API_KEY');
    assert.strictEqual((0, envName_1.toEnvVarName)('stripe_secret', 1), 'STRIPE_SECRET');
    assert.strictEqual((0, envName_1.toEnvVarName)('dbPassword', 1), 'DB_PASSWORD');
    assert.strictEqual((0, envName_1.toEnvVarName)('123token', 1), 'TOKEN');
    assert.strictEqual((0, envName_1.toEnvVarName)('', 1), 'SECRET_1');
    assert.strictEqual((0, envName_1.toEnvVarName)(undefined, 2), 'SECRET_2');
    assert.strictEqual((0, envName_1.toEnvVarName)('   ', 3), 'SECRET_3');
    assert.strictEqual((0, envName_1.toEnvVarName)('123', 4), 'SECRET_4');
}
console.log('✓ toEnvVarName passed');
// ============================================================================
// 8. Phase 3: Env File Parsing (parseEnv)
// ============================================================================
{
    const text = [
        '# Comment line',
        '',
        'PORT=3000',
        'export DB_NAME="my_db"',
        "SINGLE_QUOTED='single'",
        'ESCAPED="hello\\nworld"'
    ].join('\n');
    const { entries, eol } = (0, envFile_1.parseEnv)(text);
    assert.strictEqual(eol, '\n');
    assert.strictEqual(entries.get('PORT'), '3000');
    assert.strictEqual(entries.get('DB_NAME'), 'my_db');
    assert.strictEqual(entries.get('SINGLE_QUOTED'), 'single');
    assert.strictEqual(entries.get('ESCAPED'), 'hello\nworld');
    assert.strictEqual(entries.has('# Comment line'), false);
    // CRLF detection
    const crlfText = 'A=1\r\nB=2\r\n';
    const crlfRes = (0, envFile_1.parseEnv)(crlfText);
    assert.strictEqual(crlfRes.eol, '\r\n');
    assert.strictEqual(crlfRes.entries.get('A'), '1');
}
console.log('✓ parseEnv passed');
// ============================================================================
// 9. Phase 3: Env Upsert & Example Entry (upsertEnvEntry, ensureExampleEntry)
// ============================================================================
{
    // Add to empty text
    const res1 = (0, envFile_1.upsertEnvEntry)('', 'API_KEY', 'abc123xyz');
    assert.strictEqual(res1.status, 'added');
    assert.strictEqual(res1.finalName, 'API_KEY');
    assert.strictEqual(res1.text, 'API_KEY=abc123xyz\n');
    // Add when file lacks trailing newline
    const res2 = (0, envFile_1.upsertEnvEntry)('FOO=bar', 'BAZ', 'qux');
    assert.strictEqual(res2.status, 'added');
    assert.strictEqual(res2.text, 'FOO=bar\nBAZ=qux\n');
    // Already present (same name and value)
    const res3 = (0, envFile_1.upsertEnvEntry)('API_KEY=abc123xyz\n', 'API_KEY', 'abc123xyz');
    assert.strictEqual(res3.status, 'already-present');
    assert.strictEqual(res3.finalName, 'API_KEY');
    assert.strictEqual(res3.text, 'API_KEY=abc123xyz\n');
    // Renamed to _2 and then _3 when value differs
    const res4 = (0, envFile_1.upsertEnvEntry)('API_KEY=abc123xyz\n', 'API_KEY', 'different_val');
    assert.strictEqual(res4.status, 'renamed');
    assert.strictEqual(res4.finalName, 'API_KEY_2');
    assert.strictEqual(res4.text, 'API_KEY=abc123xyz\nAPI_KEY_2=different_val\n');
    const res5 = (0, envFile_1.upsertEnvEntry)(res4.text, 'API_KEY', 'third_val');
    assert.strictEqual(res5.status, 'renamed');
    assert.strictEqual(res5.finalName, 'API_KEY_3');
    // CRLF preserved
    const resCrlf = (0, envFile_1.upsertEnvEntry)('A=1\r\n', 'B', '2');
    assert.strictEqual(resCrlf.text, 'A=1\r\nB=2\r\n');
    // Value needing quotes (spaces, #, quotes)
    const resQuotes = (0, envFile_1.upsertEnvEntry)('', 'SECRET', 'hello world #1');
    assert.strictEqual(resQuotes.text, 'SECRET="hello world #1"\n');
    // ensureExampleEntry
    const ex1 = (0, envFile_1.ensureExampleEntry)('', 'API_KEY');
    assert.strictEqual(ex1, 'API_KEY=\n');
    const ex2 = (0, envFile_1.ensureExampleEntry)(ex1, 'API_KEY');
    assert.strictEqual(ex2, 'API_KEY=\n', 'ensureExampleEntry must be idempotent');
}
console.log('✓ upsertEnvEntry & ensureExampleEntry passed');
// ============================================================================
// 10. Phase 3: Gitignore Env Management (isEnvIgnored, addEnvToGitignore)
// ============================================================================
{
    assert.strictEqual((0, gitignoreFile_1.isEnvIgnored)('.env', '.env'), true);
    assert.strictEqual((0, gitignoreFile_1.isEnvIgnored)('/.env', '.env'), true);
    assert.strictEqual((0, gitignoreFile_1.isEnvIgnored)('.env*', '.env'), true);
    assert.strictEqual((0, gitignoreFile_1.isEnvIgnored)('*.env', '.env'), true);
    assert.strictEqual((0, gitignoreFile_1.isEnvIgnored)('# .env', '.env'), false, 'Comments must be ignored');
    // Negation line wins if later
    const negation = ['.env', '!.env'].join('\n');
    assert.strictEqual((0, gitignoreFile_1.isEnvIgnored)(negation, '.env'), false, 'Negation !.env should override earlier .env');
    // .env.example must not be treated as ignored just because .env* is present
    assert.strictEqual((0, gitignoreFile_1.isEnvIgnored)('.env*', '.env.example'), false, '.env.example must not be ignored by wildcard');
    // addEnvToGitignore
    assert.strictEqual((0, gitignoreFile_1.addEnvToGitignore)('', '.env'), '.env\n');
    assert.strictEqual((0, gitignoreFile_1.addEnvToGitignore)('node_modules\n', '.env'), 'node_modules\n# Environment variables\n.env\n');
    assert.strictEqual((0, gitignoreFile_1.addEnvToGitignore)('node_modules', '.env'), 'node_modules\n# Environment variables\n.env\n');
    assert.strictEqual((0, gitignoreFile_1.addEnvToGitignore)('node_modules\r\n', '.env'), 'node_modules\r\n# Environment variables\r\n.env\r\n');
    // Idempotent when already ignored
    assert.strictEqual((0, gitignoreFile_1.addEnvToGitignore)('.env\n', '.env'), '.env\n');
}
console.log('✓ isEnvIgnored & addEnvToGitignore passed');
// ============================================================================
// 11. Phase 3: Language Env Access Expressions (getEnvAccessExpression)
// ============================================================================
{
    assert.strictEqual((0, envAccess_1.getEnvAccessExpression)('javascript', 'API_KEY')?.expression, 'process.env.API_KEY');
    assert.strictEqual((0, envAccess_1.getEnvAccessExpression)('typescript', 'API_KEY')?.expression, 'process.env.API_KEY');
    assert.strictEqual((0, envAccess_1.getEnvAccessExpression)('python', 'API_KEY')?.expression, 'os.environ["API_KEY"]');
    assert.strictEqual((0, envAccess_1.getEnvAccessExpression)('python', 'API_KEY')?.importLine, 'import os');
    assert.strictEqual((0, envAccess_1.getEnvAccessExpression)('ruby', 'API_KEY')?.expression, 'ENV["API_KEY"]');
    assert.strictEqual((0, envAccess_1.getEnvAccessExpression)('php', 'API_KEY')?.expression, "getenv('API_KEY')");
    assert.strictEqual((0, envAccess_1.getEnvAccessExpression)('go', 'API_KEY')?.expression, 'os.Getenv("API_KEY")');
    assert.strictEqual((0, envAccess_1.getEnvAccessExpression)('java', 'API_KEY')?.expression, 'System.getenv("API_KEY")');
    assert.strictEqual((0, envAccess_1.getEnvAccessExpression)('csharp', 'API_KEY')?.expression, 'Environment.GetEnvironmentVariable("API_KEY")');
    assert.strictEqual((0, envAccess_1.getEnvAccessExpression)('shellscript', 'API_KEY')?.expression, '${API_KEY}');
    assert.strictEqual((0, envAccess_1.getEnvAccessExpression)('unsupported_xyz', 'API_KEY'), undefined);
}
console.log('✓ getEnvAccessExpression passed');
// ============================================================================
// 12. Phase 3: Scanner Meta Validation
// ============================================================================
{
    // Populated for assignment secrets
    const assignHit = (0, scanner_1.scanText)('const apiKey = "AKIAIOSFODNN7EXAMPLE";');
    assert.strictEqual(assignHit.length >= 1, true);
    const secretHit = assignHit.find(f => f.ruleId === 'secret');
    assert.ok(secretHit?.meta, 'Meta should be populated for assignment secret');
    assert.strictEqual(secretHit.meta.value, 'AKIAIOSFODNN7EXAMPLE');
    assert.strictEqual(secretHit.meta.keyName, 'apiKey');
    assert.strictEqual(secretHit.meta.quote, '"');
    assert.strictEqual(secretHit.meta.literalEndCol - secretHit.meta.literalStartCol, ' "AKIAIOSFODNN7EXAMPLE"'.trim().length, 'literalStartCol..literalEndCol must include quotes');
    // Populated for bare AWS access key
    const bareAwsHit = (0, scanner_1.scanText)('doSomething("AKIAIOSFODNN7EXAMPLE");');
    assert.strictEqual(bareAwsHit.length, 1);
    assert.ok(bareAwsHit[0].meta);
    assert.strictEqual(bareAwsHit[0].meta.keyName, 'AWS_ACCESS_KEY_ID');
    // Populated for high-entropy string
    const entropyHit = (0, scanner_1.scanText)('const payload = "q8Zr3KfX2mVn9LpA7sTyWb4Hc1Jd";');
    assert.strictEqual(entropyHit.length, 1);
    assert.ok(entropyHit[0].meta);
    assert.strictEqual(entropyHit[0].meta.value, 'q8Zr3KfX2mVn9LpA7sTyWb4Hc1Jd');
    assert.strictEqual(entropyHit[0].meta.keyName, 'payload');
    // NOT populated for template literals with ${}
    const templateHit = (0, scanner_1.scanText)('const key = `secret_${userId}_1234567890abcdef`;');
    for (const f of templateHit) {
        assert.strictEqual(f.meta, undefined, 'Template literal with ${} must NOT populate meta');
    }
    // NOT populated for partial strings (e.g. Bearer AKIA...)
    const partialHit = (0, scanner_1.scanText)('const auth = "Bearer AKIAIOSFODNN7EXAMPLE";');
    assert.strictEqual(partialHit.length, 1);
    assert.strictEqual(partialHit[0].meta, undefined, 'Partial string match must NOT populate meta');
    // NOT populated for rules other than secret/high-entropy-string
    const logHit = (0, scanner_1.scanText)('console.log("hello");');
    assert.strictEqual(logHit.length, 1);
    assert.strictEqual(logHit[0].meta, undefined, 'console-log must NOT populate meta');
    const debugHit = (0, scanner_1.scanText)('debugger;');
    assert.strictEqual(debugHit.length, 1);
    assert.strictEqual(debugHit[0].meta, undefined, 'debugger must NOT populate meta');
}
console.log('✓ Scanner meta validation passed');
console.log('\nAll GitSanity Phase 1, Phase 2, and Phase 3 tests passed successfully!');
//# sourceMappingURL=scanner.test.js.map