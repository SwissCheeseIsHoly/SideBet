# SideBet

Make everyday rivalries a little more interesting. SideBet lets friends and family create private challenges, pick a side, confirm the result, and keep track of the credits they owe one another.

## What it does

- Personal profiles with a handle, bio, and avatar color.
- Friend requests using a personal invitation link, code, or QR code.
- Private group bets with a fixed stake, deadline, choices, and comments.
- Results confirmed by every joined participant before IOUs are created.
- A credit ledger showing what you owe and what friends owe you.
- Settlement notes such as “Paid 40 via Venmo,” which the person owed must accept or decline.
- An isolated browser demo for exploring the experience without an account.

SideBet records credits and acknowledgments. It does not hold money, transfer payments, connect to Venmo, or verify that an external payment happened. A settlement changes the ledger only after its recipient accepts it.

## Run locally

Use Node.js 24 and pnpm 11.25.0.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open the URL printed by Vite. The demo is available immediately. Shared accounts and data require the database migration and Supabase Auth configuration described in [Setup](docs/SETUP.md).

```sh
pnpm test
pnpm build
pnpm preview
```

## Shared accounts and hosting

The app uses React, TypeScript, and Vite with Supabase Auth and PostgreSQL. Database permissions and transactional functions enforce who may join a bet, confirm a result, and acknowledge a settlement. The frontend can be hosted on GitHub Pages; Supabase stores shared data.

The existing Supabase project `rrfiyvflpzegpzrcpdhd` was resumed on October 1, 2026. The social schema and authentication redirect URLs are installed. A transactional live test passed the complete two-user friendship → bet → result → IOU → settlement flow, then rolled back its test data. Custom SMTP is working: real signup email delivery, confirmation, and login were verified on October 2. The password-recovery email flow still needs an end-to-end check.

[Setup](docs/SETUP.md) covers migration, email confirmation, production configuration, and a two-account acceptance test. The [GitHub Actions workflow](.github/workflows/deploy.yml) tests and builds pull requests; only `main` can deploy to Pages. The intended production URL is [SideBet on GitHub Pages](https://swisscheeseisholy.github.io/SideBet/).

## Project map

| Location | Purpose |
| --- | --- |
| `src/` | Application, Supabase adapter, and isolated demo |
| `supabase/migrations/` | Database schema, access policies, and application functions |
| `tests/` | Automated behavior checks |
| `docs/SETUP.md` | Supabase and GitHub Pages setup |
| `docs/PROGRESS.md` | Saved implementation checkpoint |

The rebuilt app does not import the original browser-only balances as shared debts. Demo data and live account data remain separate.
