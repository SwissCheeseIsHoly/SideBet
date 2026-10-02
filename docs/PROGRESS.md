# SideBet rebuild checkpoint

Working repository: `/Users/gradyhendrix/Documents/GitHub/SideBet`
Branch: `codex/social-sidebet`
The original course-repository copy is unchanged.

Goal: social profiles, friend links/codes/QR, private credit-only group challenges, participant-confirmed results, pairwise IOUs, recipient-approved settlement notes. Existing Supabase project requested by user. Never silently treat local demo data as shared real accounts.

Architecture: React + TypeScript + Vite frontend; existing Supabase Auth + PostgreSQL with RLS and transactional RPCs. Standalone demo for preview. GitHub Pages build workflow.

## Completed October 1, 2026

- Rebuilt the responsive landing page and application: profiles, friend requests and shareable codes/links/QR, group bets, comments, unanimous result confirmation, IOU ledger, settlement approval, and inbox.
- Added signup, login, email recovery, pending invitation preservation, account-scoped data loading, and a separate persistent demo.
- Resumed the existing Supabase project and installed the new schema. All original tables remain intact. Nine new tables have row-level security; authenticated functions enforce mutations.
- Passed a hosted PostgreSQL two-user lifecycle test, with all synthetic test rows rolled back. No real payment or email was sent.
- Saved production and localhost authentication redirect URLs.
- Passed 38 automated tests and the production build. Browser checks covered creating and joining bets, comments, result confirmation, friend acceptance, QR/link display, partial settlement submission, and incoming settlement acceptance.
- Added the locked-dependency GitHub Pages workflow: pull requests validate; main deploys.
- Saved incremental local Git checkpoints through `7cf35be`, with a remote backup branch at `codex/social-sidebet`.
- Opened [pull request #1](https://github.com/SwissCheeseIsHoly/SideBet/pull/1). [GitHub Actions validation](https://github.com/SwissCheeseIsHoly/SideBet/actions/runs/36958267572) passed locked installation, all tests, and the production build. Deployment was correctly skipped for the pull request.

## Remaining launch steps

1. SMTP configuration is complete: the owner entered the credential directly in Supabase, and enabled status persisted after a dashboard reload. No credential is stored in this repository.
2. Verify real signup confirmation and password recovery. The owner’s signup form is open in the local preview; actual email delivery has not yet been confirmed.
3. Review and merge the rebuild pull request, then verify the Pages deployment and the two-account flow on the public URL. The public site still serves the earlier version until that deployment.

GitHub Pages source is now set to GitHub Actions (saved and verified October 2, 2026), ready for the checked-in workflow.

See `docs/VERIFICATION.md` for validation scope and the security advisor review. Never commit credentials, `.env`, `node_modules`, or generated test data. The Supabase publishable key is public by design; database permissions enforce security.
