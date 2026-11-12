// =============================================================================
// GitSanity Test File (Phase 1)
// Contains examples of every detection rule and false-positive guards.
// =============================================================================

// Rule: console-log (Severity: Warning, Quick Fix available)
console.log("Debugging user session");

// Rule: stray debugging breakpoint (Severity: Error)
debugger;

// Rule: AWS Access Key (Severity: Error)
const awsAccessKey = "AKIAIOSFODNN7EXAMPLE";

// Rule: Generic Secret Assignment (Severity: Error)
const apiKey = "secret_token_1234567890abcdef";
const userPassword = "superSecurePassword9876_secret";

// Rule: Hex Secret in Assignment (32+ hex chars, Severity: Error)
const token = "4f53c89b33a5b3a4f53c89b33a5b3a4f4f53c89b33a5b3a4f53c89b33a5b3a4f";
const unquotedHexPassword = 4f53c89b33a5b3a4f53c89b33a5b3a4f;

// False-positive guard 1: Bare Hex Hash / Git Commit SHA (SAFE: Must NOT be flagged)
const gitCommitSha = "4f53c89b33a5b3a4f53c89b33a5b3a4f4f53c89b";

// False-positive guard 2: Non-conflict separator (SAFE: 5 equals signs, Must NOT be flagged)
// ===== Safe Section Heading =====

// Rule: Merge Conflict Markers (Severity: Error)
<<<<<<< HEAD
const activeBranch = "feature/phase-1";
=======
const activeBranch = "main";
>>>>>>> main
