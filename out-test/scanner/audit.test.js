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
const hookText_1 = require("../git/hookText");
console.log('Running Audit & Edge-Case Tests...');
// 1. Markdown Setext headings must NOT trigger conflict-marker
{
    const markdownHeading = 'My Document Title\n=======';
    const findings = (0, scanner_1.scanText)(markdownHeading);
    assert.strictEqual(findings.filter(f => f.ruleId === 'conflict-marker').length, 0, 'Markdown setext heading should not trigger conflict-marker');
    const crlfHeading = 'Section Heading\r\n=======';
    const crlfFindings = (0, scanner_1.scanText)(crlfHeading);
    assert.strictEqual(crlfFindings.filter(f => f.ruleId === 'conflict-marker').length, 0, 'CRLF Markdown setext heading should not trigger conflict-marker');
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
    const findings = (0, scanner_1.scanText)(conflictText);
    const conflictMarkers = findings.filter(f => f.ruleId === 'conflict-marker');
    assert.strictEqual(conflictMarkers.length, 3, 'Should flag head, separator, and end conflict markers');
}
// 3. Standalone ======= without preceding title should still trigger conflict-marker
{
    const standalone = (0, scanner_1.scanText)('=======');
    assert.strictEqual(standalone.length, 1);
    assert.strictEqual(standalone[0].ruleId, 'conflict-marker');
}
// 4. Secret rule must NOT flag UUIDs
{
    const uuidFinding = (0, scanner_1.scanText)('const token = "12345678-1234-1234-1234-123456789abc";');
    assert.strictEqual(uuidFinding.filter(f => f.ruleId === 'secret').length, 0, 'UUID should not be flagged as secret');
}
// 5. Secret rule must NOT flag lockfile integrity strings
{
    const integrityFinding = (0, scanner_1.scanText)('const token = "sha512-u1234567890abcdef1234567890abcdef==";');
    assert.strictEqual(integrityFinding.filter(f => f.ruleId === 'secret').length, 0, 'Lockfile integrity string should not be flagged as secret');
}
// 6. Secret rule must NOT flag example placeholders
{
    const placeholderFinding = (0, scanner_1.scanText)('const apiKey = "your-api-key-here";');
    assert.strictEqual(placeholderFinding.filter(f => f.ruleId === 'secret').length, 0, 'Placeholder "your-api-key-here" should not be flagged as secret');
    const dummyFinding = (0, scanner_1.scanText)('const secret = "dummy-secret-placeholder";');
    assert.strictEqual(dummyFinding.filter(f => f.ruleId === 'secret').length, 0, 'Placeholder "dummy-secret-placeholder" should not be flagged as secret');
}
// 7. Secret rule must NOT flag Git commit hashes
{
    const gitHashFinding = (0, scanner_1.scanText)('const commit_sha = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";');
    assert.strictEqual(gitHashFinding.filter(f => f.ruleId === 'secret').length, 0, 'Git commit SHA should not be flagged as secret');
}
// 8. Secret rule MUST still flag actual secrets
{
    const realKey = (0, scanner_1.scanText)('const apiKey = "1234567890abcdef1234";');
    assert.strictEqual(realKey.some(f => f.ruleId === 'secret'), true);
    const awsKey = (0, scanner_1.scanText)('const key = "AKIAIOSFODNN7EXAMPLE";');
    assert.strictEqual(awsKey.some(f => f.ruleId === 'secret'), true);
}
// 9. BOM handling
{
    const bomText = '\uFEFFconst x = 1;\nconsole.log(x);';
    const findings = (0, scanner_1.scanText)(bomText);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].ruleId, 'console-log');
}
// 10. ReDoS resilience on 100 KB line
{
    const longLine = 'const payload = "' + 'a'.repeat(100000) + '";';
    const start = Date.now();
    const findings = (0, scanner_1.scanText)(longLine);
    const duration = Date.now() - start;
    assert.strictEqual(duration < 100, true, `Scanning 100KB line took too long: ${duration} ms`);
}
// 11. Emoji UTF-16 offset mapping
{
    const emojiLine = '🔑 console.log("secret");';
    const findings = (0, scanner_1.scanText)(emojiLine);
    assert.strictEqual(findings.length, 1);
    // '🔑 ' is 2 code units for emoji + 1 for space = 3
    assert.strictEqual(findings[0].startCol, 3);
    assert.strictEqual(findings[0].endCol, 15); // 'console.log(' is 12 chars: 3 + 12 = 15
}
// 12. Hook LF (\n) enforcement
{
    const crlfHook = '#!/bin/sh\r\necho "test"\r\n';
    const updated = (0, hookText_1.installHookBlock)(crlfHook);
    assert.strictEqual(updated.includes('\r'), false, 'Hook script must not contain carriage returns');
}
console.log('All Audit & Edge-Case Tests Passed!');
//# sourceMappingURL=audit.test.js.map