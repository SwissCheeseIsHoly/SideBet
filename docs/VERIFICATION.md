# Verification record — October 1, 2026

- Production build passes (React, TypeScript, Vite).
- 38 automated tests pass: 21 PostgreSQL integration checks through PGlite and 17 demo behavior checks.
- Browser checks: responsive landing/dashboard; create a group bet; join an invitation and add a comment; provide the final result confirmation and verify the new 5-credit IOU; accept a friend request; display a personal invite link/code/QR; accept an incoming 40-credit note (owed total decreased 80 → 40); send a partial note (owed balance remains unchanged pending recipient confirmation).
- Existing Supabase project resumed; all four original public tables preserved.
- `202610010001_sidebet.sql` applied successfully. Nine new tables have RLS enabled. `anon` cannot execute snapshot; authenticated users cannot directly insert credit obligations.
- `supabase/verify-live.sql` passed on the hosted PostgreSQL instance. Two synthetic users connected, created/joined a bet, unanimously confirmed the result, generated 40 credits owed, declined a partial settlement without changing the balance, accepted the full settlement, and rejected duplicate acceptance. All test rows rolled back. No emails or real payments were sent.
- Site URL and exact production/local Auth redirects saved.

## Advisor review

Supabase’s security advisor was run after migration. The authenticated `SECURITY DEFINER` endpoints are intentional: users have no direct write privileges; each RPC checks identity, ownership/membership, lifecycle, amounts, and recipient consent. These checks are covered by integration tests. Private helper execution is revoked. The allocation table intentionally has no client policy or privileges (deny all); RPCs maintain its audit records.

[Security-definer advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). [Deny-all RLS policy guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

The project has pre-existing anonymous Auth enabled. The new frontend uses email accounts, and its policies restrict rows to the caller’s relationships and participation. Anonymous Auth identities still have unique IDs and cannot read unrelated data. [Anonymous Auth policy guidance](https://supabase.com/docs/guides/database/database-advisors?lint=0012_auth_allow_anonymous_sign_ins).

The project’s leaked-password protection is disabled. It was left unchanged; see [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Not yet verified

Public email sign-up, confirmation, and password recovery need the owner’s SMTP provider configured. Shared database behavior is verified; no claim of a completed real-email end-to-end test is made. The old browser-only data is preserved under `legacy/` and is not imported as real debts.
