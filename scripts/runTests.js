const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function findTestFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findTestFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      out.push(full);
    }
  }
  return out;
}

const outDir = path.join(__dirname, '..', 'out');
const testFiles = findTestFiles(outDir);

if (testFiles.length === 0) {
  console.error('No .test.js files found under out/. Run npm run compile first.');
  process.exit(1);
}

console.log(`Found ${testFiles.length} test suite(s). Executing...\n`);

let hasFailures = false;

for (const testFile of testFiles) {
  const rel = path.relative(path.join(__dirname, '..'), testFile);
  console.log(`>>> Running ${rel}`);
  const res = spawnSync(process.execPath, [testFile], {
    stdio: 'inherit',
    env: process.env
  });

  if (res.status !== 0) {
    console.error(`FAILED: ${rel} (exit code ${res.status})`);
    hasFailures = true;
  }
  console.log('');
}

if (hasFailures) {
  console.error('One or more test suites failed.');
  process.exit(1);
} else {
  console.log('All GitSanity test suites passed successfully!');
  process.exit(0);
}
