"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const gitRunner_1 = require("../git/gitRunner");
const precommitCore_1 = require("./precommitCore");
async function main() {
    const cwd = process.cwd();
    const rootRes = await (0, gitRunner_1.runGit)(['rev-parse', '--show-toplevel'], cwd);
    const root = rootRes.code === 0 && rootRes.stdout.trim() ? rootRes.stdout.trim() : cwd;
    const exitCode = await (0, precommitCore_1.runPrecommit)({ root });
    process.exit(exitCode);
}
main().catch(() => {
    process.exit(0);
});
//# sourceMappingURL=preCommit.js.map