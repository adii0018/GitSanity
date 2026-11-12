const path = require('path');
const fs = require('fs');

async function runSelfScan() {
  const rootDir = path.join(__dirname, '..');
  // Load pure scanner and config loader from out-test or out
  const outTestDir = path.join(rootDir, 'out-test');
  const outDir = fs.existsSync(outTestDir) ? outTestDir : path.join(rootDir, 'out');

  const { scanProject } = require(path.join(outDir, 'scanner', 'projectScanner.js'));
  const { parseConfig, DEFAULT_CONFIG } = require(path.join(outDir, 'config', 'configSchema.js'));

  let config = DEFAULT_CONFIG;
  const configPath = path.join(rootDir, '.gitsanity.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    config = parseConfig(raw).config;
  }

  console.log('Running GitSanity self-scan on repository root...');
  const result = await scanProject(rootDir, { config });

  console.log(`Self-scan complete:`);
  console.log(`- Files scanned: ${result.filesScanned}`);
  console.log(`- Errors: ${result.countsBySeverity.error}`);
  console.log(`- Warnings: ${result.countsBySeverity.warning}`);

  if (result.countsBySeverity.error > 0) {
    console.error('\nSelf-scan detected errors:');
    for (const [file, findings] of result.byFile.entries()) {
      for (const f of findings) {
        if (f.severity === 'error') {
          console.error(`  ${file}:${f.line + 1} [${f.ruleId}] ${f.message}`);
        }
      }
    }
    process.exit(1);
  }

  console.log('\nGitSanity self-scan passed with zero errors!');
}

runSelfScan().catch((err) => {
  console.error('Self-scan failed with error:', err);
  process.exit(1);
});
