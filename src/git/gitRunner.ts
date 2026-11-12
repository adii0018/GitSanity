import { execFile, spawn } from 'child_process';
import * as readline from 'readline';

export interface RunGitOptions {
  timeoutMs?: number;
  input?: string;
  maxBuffer?: number;
  signal?: AbortSignal;
}

export interface RunGitResult {
  stdout: string;
  stderr: string;
  code: number;
}

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024; // 64 MB

/**
 * Runs a git command with an argument array using execFile.
 * Never throws on non-zero exit codes.
 */
export function runGit(
  args: string[],
  cwd: string,
  opts?: RunGitOptions
): Promise<RunGitResult> {
  return new Promise((resolve) => {
    const timeout = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBuffer = opts?.maxBuffer ?? DEFAULT_MAX_BUFFER;

    const child = execFile(
      'git',
      args,
      {
        cwd,
        timeout,
        maxBuffer,
        windowsHide: true,
        encoding: 'utf8',
        signal: opts?.signal
      },
      (error, stdout, stderr) => {
        let code = 0;
        if (error) {
          code = typeof error.code === 'number' ? error.code : 1;
        }
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          code
        });
      }
    );

    if (opts?.input && child.stdin) {
      child.stdin.write(opts.input);
      child.stdin.end();
    }
  });
}

/**
 * Checks whether git is installed and executable.
 */
export async function isGitInstalled(): Promise<boolean> {
  try {
    const res = await runGit(['--version'], process.cwd(), { timeoutMs: 5000 });
    return res.code === 0 && res.stdout.toLowerCase().includes('git version');
  } catch {
    return false;
  }
}

/**
 * Streaming git execution that yields stdout lines as they arrive.
 * Supports cancellation via AbortSignal.
 */
export function spawnGitLines(
  args: string[],
  cwd: string,
  onLine: (line: string) => void,
  signal?: AbortSignal
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    if (signal) {
      if (signal.aborted) {
        child.kill();
        resolve(130);
        return;
      }
      signal.addEventListener('abort', () => {
        child.kill();
        resolve(130);
      });
    }

    const rl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity
    });

    rl.on('line', (line) => {
      onLine(line);
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      resolve(code ?? 0);
    });
  });
}
