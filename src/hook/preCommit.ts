import { runGit } from '../git/gitRunner';
import { runPrecommit } from './precommitCore';

async function main(): Promise<void> {
  const cwd = process.cwd();
  const rootRes = await runGit(['rev-parse', '--show-toplevel'], cwd);
  const root = rootRes.code === 0 && rootRes.stdout.trim() ? rootRes.stdout.trim() : cwd;

  const exitCode = await runPrecommit({ root });
  process.exit(exitCode);
}

main().catch(() => {
  process.exit(0);
});
