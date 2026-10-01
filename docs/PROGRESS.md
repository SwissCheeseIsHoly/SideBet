# SideBet rebuild checkpoint

Working repository: `/Users/gradyhendrix/Documents/GitHub/SideBet`
Branch: `codex/social-sidebet`
The original course-repository copy is unchanged.

Goal: social profiles, friend links/codes/QR, private credit-only group challenges, participant-confirmed results, pairwise IOUs, recipient-approved settlement notes. Existing Supabase project requested by user. Never silently treat local demo data as shared real accounts.

Architecture: React + TypeScript + Vite frontend; existing Supabase Auth + PostgreSQL with RLS and transactional RPCs. Standalone demo for preview. GitHub Pages build workflow. SQL migration must be applied to the existing project before live features work.

In progress: UI, database/RPCs, client/demo adapter. Save tracked files in small Git commits; never commit credentials, .env, node_modules, or test-generated data. Supabase publishable key is public by design; database permissions must enforce security.
