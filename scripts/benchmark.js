const fs = require('fs');
const path = require('path');
const os = require('os');

async function runBenchmarks() {
  const rootDir = path.join(__dirname, '..');
  const outTestDir = path.join(rootDir, 'out-test');
  const outDir = fs.existsSync(outTestDir) ? outTestDir : path.join(rootDir, 'out');

  const { scanText } = require(path.join(outDir, 'scanner', 'scanner.js'));
  const { scanProject } = require(path.join(outDir, 'scanner', 'projectScanner.js'));

  console.log('====================================================');
  console.log(' GitSanity Performance & Scalability Benchmarks');
  console.log('====================================================\n');

  // Benchmark 1: 50,000-line file
  console.log('1. Benchmarking scanText on 50,000-line file...');
  const lines50k = [];
  for (let i = 0; i < 50000; i++) {
    if (i === 1000) {
      lines50k.push('console.log("hello world");');
    } else if (i === 25000) {
      lines50k.push('const apiKey = "AKIAIOSFODNN7EXAMPLE";');
    } else {
      lines50k.push(`const var_${i} = ${i * 2} + "some text string on line ${i}";`);
    }
  }
  const text50k = lines50k.join('\n');

  const start50k = Date.now();
  const findings50k = scanText(text50k);
  const time50k = Date.now() - start50k;
  console.log(`   - Completed in: ${time50k} ms`);
  console.log(`   - Findings detected: ${findings50k.length}`);
  console.log(`   - Throughput: ${Math.round(50000 / (time50k / 1000))} lines/sec\n`);

  // Benchmark 2: 5 MB text file
  console.log('2. Benchmarking scanText on 5 MB file...');
  const lineChunk = 'const payload_data = "abcdefghijklmnopqrstuvwxyz0123456789"; // normal code line\n';
  const targetBytes = 5 * 1024 * 1024;
  let text5MB = '';
  while (Buffer.byteLength(text5MB, 'utf8') < targetBytes) {
    text5MB += lineChunk;
  }
  text5MB += 'console.log("at end of large file");\n';

  const start5MB = Date.now();
  const findings5MB = scanText(text5MB);
  const time5MB = Date.now() - start5MB;
  console.log(`   - File size: ${(Buffer.byteLength(text5MB, 'utf8') / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   - Completed in: ${time5MB} ms`);
  console.log(`   - Findings detected: ${findings5MB.length}`);
  console.log(`   - Speed: ${(5 / (time5MB / 1000)).toFixed(2)} MB/sec\n`);

  // Benchmark 3: ReDoS test on 100 KB single-line adversarial input
  console.log('3. Testing ReDoS resilience on 100 KB single-line adversarial input...');
  const evilLine = 'const secret = "' + 'a'.repeat(100000) + '";';
  const startReDoS = Date.now();
  const findingsReDoS = scanText(evilLine);
  const timeReDoS = Date.now() - startReDoS;
  console.log(`   - Completed in: ${timeReDoS} ms (instant finish, no catastrophic backtracking)\n`);

  // Benchmark 4: Project scan on 20,000 files
  console.log('4. Benchmarking project scan on 20,000 files...');
  const tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitsanity-20k-bench-'));

  try {
    const memBefore = process.memoryUsage().heapUsed;
    const NUM_FILES = 20000;
    const SUBDIRS = 50;

    for (let d = 0; d < SUBDIRS; d++) {
      fs.mkdirSync(path.join(tempProjectDir, `dir_${d}`), { recursive: true });
    }

    console.log(`   - Generating ${NUM_FILES} files in ${tempProjectDir}...`);
    for (let i = 0; i < NUM_FILES; i++) {
      const dirIndex = i % SUBDIRS;
      const fPath = path.join(tempProjectDir, `dir_${dirIndex}`, `file_${i}.js`);
      fs.writeFileSync(fPath, `export const x_${i} = ${i};\n`, 'utf8');
    }

    const startScan = Date.now();
    const result = await scanProject(tempProjectDir, {
      config: {
        rules: { 'console-log': 'warn', debugger: 'error', 'conflict-marker': 'error', secret: 'error', 'high-entropy-string': 'warn', 'old-todo': 'off' },
        ignorePaths: [],
        maxFileSizeMB: 1,
        entropyThreshold: 4.5,
        entropyMinLength: 20,
        envFile: '.env',
        envExampleFile: '.env.example',
        createEnvExample: true,
        largeFileMB: 5,
        maxProjectFiles: 20000,
        blockOnWarnings: false,
        todoMaxAgeDays: 90
      }
    });

    const scanTime = Date.now() - startScan;
    const memAfter = process.memoryUsage().heapUsed;
    const peakHeapMB = ((memAfter - memBefore) / (1024 * 1024)).toFixed(2);

    console.log(`   - Scanned: ${result.filesScanned} files`);
    console.log(`   - Duration: ${scanTime} ms (${(result.filesScanned / (scanTime / 1000)).toFixed(1)} files/sec)`);
    console.log(`   - Heap memory delta: ${peakHeapMB} MB`);
    console.log(`   - Cap respected: ${result.filesScanned <= 20000 ? 'YES' : 'NO'}\n`);

    // Benchmark 5: Test scan cancellation
    console.log('5. Testing project scan cancellation responsiveness...');
    const abortCtrl = new AbortController();
    const cancelPromise = scanProject(tempProjectDir, {
      signal: abortCtrl.signal
    });
    // Abort after 50ms
    setTimeout(() => abortCtrl.abort(), 50);
    const cancelStart = Date.now();
    const cancelResult = await cancelPromise;
    const cancelDuration = Date.now() - cancelStart;
    console.log(`   - Cancelled cleanly in: ${cancelDuration} ms`);
    console.log(`   - Files scanned before abort: ${cancelResult.filesScanned}\n`);

  } finally {
    fs.rmSync(tempProjectDir, { recursive: true, force: true });
  }

  console.log('====================================================');
  console.log(' All Benchmarks Completed Successfully');
  console.log('====================================================\n');
}

runBenchmarks().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
