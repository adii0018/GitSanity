// =============================================================================
// GitSanity Test File (JavaScript)
// =============================================================================

// --- Phase 1: Core Rules ---

// 1. console-log (Severity: Warning, Quick Fix available)
console.log("Debugging user session");

// 2. Stray breakpoint (Severity: Error)
debugger;

// 3. AWS Access Key assigned to variable (Movable to .env)
const awsAccessKey = "AKIAIOSFODNN7EXAMPLE";

// 4. Hardcoded apiKey assignment (Movable to .env)
const apiKey = "secret_token_1234567890abcdef";

// 5. Hex Secret in Assignment (32+ hex chars, Movable to .env)
const token = "4f53c89b33a5b3a4f53c89b33a5b3a4f4f53c89b33a5b3a4f53c89b33a5b3a4f";

// --- Phase 2: Entropy Detection & Ignore Directives ---

// 6. High-Entropy String (Movable to .env)
const payload = "q8Zr3KfX2mVn9LpA7sTyWb4Hc1Jd";

// 7. Same-line ignore directive (SAFE: rule ignored on this line)
console.log("Allowed console log"); // gitsanity-ignore console-log

// 8. Next-line ignore directive (SAFE: next line ignored)
// gitsanity-ignore-next-line debugger
debugger;

// --- Phase 3: Auto-Fix Edge Cases (NO Move to .env expected) ---

// 9. Bearer string: secret is only PART of larger string (NO .env fix offered)
const authHeader = "Bearer AKIAIOSFODNN7EXAMPLE";

// 10. Template literal containing ${}: (NO .env fix offered)
const userId = "user123";
const dynamicSecret = `token_${userId}_1234567890abcdef`;

// --- False-Positive Guards (SAFE: NONE of these should be flagged) ---

// Guard 1: Bare Hex Hash / Git Commit SHA
const gitCommitSha = "4f53c89b33a5b3a4f53c89b33a5b3a4f4f53c89b";

// Guard 2: Non-conflict separator (5 equals signs)
// ===== Safe Section Heading =====

// Guard 3: UUID string
const recordId = "123e4567-e89b-12d3-a456-426614174000";

// Guard 4: URL endpoint
const apiEndpoint = "https://example.com/api/v1/auth/callback/token";

// Guard 5: Long camelCase identifier string
const label = "thisIsJustALongCamelCaseName";

// --- Conflict Markers ---

// 11. Merge Conflict Markers (Severity: Error)
<<<<<<< HEAD
const activeBranch = "feature/phase-3";
=======
const activeBranch = "main";
>>>>>>> main
