# SideBet setup

## 1. Open the existing Supabase project

Open [the SideBet project dashboard](https://supabase.com/dashboard/project/rrfiyvflpzegpzrcpdhd). Confirm it is active; resume it if the dashboard reports that it is paused. Use the project's Connect dialog to verify the project URL and browser publishable key.

The current URL is `https://rrfiyvflpzegpzrcpdhd.supabase.co`. On October 1, 2026, the paused project was resumed and reported healthy. The new SideBet migration was applied successfully; all four original public tables were preserved.

Copy `.env.example` to `.env.local`. If the dashboard shows different values, update `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Restart Vite after changing them. Both values are compiled into the browser bundle; use only a publishable key. Never use a `service_role` key, secret key, database password, or personal access token. [Supabase API key documentation](https://supabase.com/docs/guides/getting-started/api-keys).

## 2. Apply the database migration

The frontend cannot create its own production schema. Apply [202610010001_sidebet.sql](../supabase/migrations/202610010001_sidebet.sql) before trying live accounts. This migration runs in a single transaction and creates `sb_` tables without modifying the original app tables.

1. In the existing Supabase dashboard, open **SQL Editor** and create a new query.
2. Open the SQL files in `supabase/migrations/` in filename order.
3. Copy each complete file into the editor and run it once. Check that it completes successfully before continuing to the next file.
4. Keep a record of which migrations were applied. Future migrations must also be applied in order.

Read the migration before running it against a project containing existing data. The migration supplies the app's tables, row-level security policies, and authenticated application functions. Do not disable row-level security to work around an error. Do not run the frontend with a privileged key.

Migration `202610010001_sidebet.sql` was applied to this hosted project on October 1, 2026. Do not re-run it on the same project; these steps are for a fresh installation. Original local-storage data is not automatically migrated into shared accounts.

## 3. Configure email authentication

In Supabase **Authentication**, enable email/password sign-in. If email confirmation is enabled, a new user must follow the confirmation email before signing in. The application does not require anonymous sign-ins.

The following URLs were saved in **Authentication → URL Configuration** on October 1, 2026:

| Setting | Value |
| --- | --- |
| Site URL | `https://swisscheeseisholy.github.io/SideBet/` |
| Allowed redirect | `https://swisscheeseisholy.github.io/SideBet/` |
| Local development redirect | `http://127.0.0.1:5173/` |
| Local preview redirect | `http://127.0.0.1:4173/` |

If Vite starts on a different port, allow that exact local URL too. Use the app's base URL for authentication redirects. App navigation and invitation links use URL fragments, so GitHub Pages does not need server routing rules. Keep the trailing slash on `/SideBet/`.

Custom Gmail SMTP has been saved by the owner and verified enabled after a dashboard reload. This confirms configuration persistence, not email delivery. For a fresh installation, configure **Authentication → Emails → SMTP Settings**, with SMTP credentials entered directly in the dashboard. Keep email confirmation enabled. The default Supabase sender only delivers to project team addresses. See [Supabase SMTP requirements](https://supabase.com/docs/guides/auth/auth-smtp).

After SMTP is configured, send a test confirmation email and follow it back into the app. If you have customized Supabase email templates, ensure their links use the configured redirect correctly. See [Supabase redirect URL documentation](https://supabase.com/docs/guides/auth/redirect-urls).

## 4. Validate locally

Use Node.js 24 and pnpm 11.25.0:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm dev
```

The demo runs in the current browser and does not create accounts, write to Supabase, or send real friend invitations. Demo credits are sample data. Live mode requires a reachable Supabase project with the migration installed.

Use two separate browser profiles for the following live acceptance test:

1. Create two accounts and complete email confirmation if enabled. Set distinct profiles.
2. Share one account's invite link or code with the other, send a friend request, and accept it in the recipient's account.
3. Create a bet with a fixed stake, two choices, a future deadline, and the accepted friend as an invitee. Join from the invited account and pick the other choice.
4. Add a comment from each account and confirm both can read the conversation.
5. Lock the bet, propose an outcome, and have all joined participants approve. Verify the resulting IOU appears for both parties with opposite perspectives.
6. From the debtor's account, submit a partial settlement note. Confirm the balance remains unchanged while the note is pending.
7. Decline the note from the creditor's account. Confirm the balance still has not changed. Submit another note and accept it; confirm the approved amount is deducted on both accounts.
8. Reload each browser and confirm shared profiles, friendships, bets, and balances persist. Sign out and confirm private account data is no longer visible.

## 5. Publish with GitHub Pages

In [repository settings](https://github.com/SwissCheeseIsHoly/SideBet/settings/pages), set **Pages → Build and deployment → Source** to **GitHub Actions**. If project values changed, add these repository variables under **Settings → Secrets and variables → Actions → Variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The repository's Pages source was set to GitHub Actions on October 2, 2026. The rebuild remains on its pull-request branch until release; changing the source did not deploy it.

The values are public browser configuration, not privileged secrets. Rebuild after changing them. The app uses its existing project configuration when overrides are not supplied.

The workflow installs from `pnpm-lock.yaml`, runs tests, and produces a production build. Pull requests targeting `main` run validation without publishing. A push to `main`, including a merged pull request, publishes the successful build. You can also run the workflow manually on `main`; a manual run on another branch validates without publishing.

The deploy job uses the `github-pages` environment and the standard Pages deployment action. Production is [https://swisscheeseisholy.github.io/SideBet/](https://swisscheeseisholy.github.io/SideBet/). See [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

After deployment, repeat the two-account test on the production URL, including opening an invitation link on another device. A successful frontend build does not verify that the hosted migration, project availability, or Auth redirect configuration is correct.

## Credit and settlement rules

Each joined participant agrees to the same fixed credit stake. Winners share each losing participant's stake equally, calculated in hundredths of a credit. Any indivisible remainder is assigned by a stable participant ID order so credits are not lost through rounding. If everybody wins or nobody wins, no debt is created.

Credit obligations are recorded only after all joined participants approve the proposed result. Rejecting a result returns the bet to locked status so a joined player can propose a new result. Choices can change only while the bet is open and before its deadline. The host can cancel only while the bet is open.

The ledger records debts between people. There is no funded wallet or payment processor. A note saying “Paid 40 via Venmo” is a claim from the debtor; SideBet does not send or verify that payment. The creditor must accept the note before the ledger decreases. A declined or pending note changes no balance.

Pending settlement notes reserve the amount against that person's debt to avoid duplicate claims. A decline releases the reservation; acceptance pays down the oldest outstanding obligations first. Opposing debts remain separate records rather than automatically canceling one another out.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Cannot connect or failed to fetch | Confirm the Supabase project is active, the hostname resolves, and the project URL is correct. |
| Sign-in works but app data fails | Confirm all checked-in migrations were applied successfully to the same project used by the frontend. |
| Account created but cannot sign in | Complete email confirmation, check spam, and verify the project's email settings. |
| Confirmation link opens the wrong site | Check Site URL, allowed redirect URLs, and any customized email templates. |
| CI installation fails with a frozen lockfile error | Run `pnpm install` locally using pnpm 11.25.0 and commit the updated lockfile with dependency changes. |
| Pages workflow cannot deploy | Set Pages source to GitHub Actions and confirm the run uses `main` and the `github-pages` environment permits it. |
| Local changes work but production does not | Confirm the intended commit reached `main` and its deployment finished; environment values take effect only after a build. |
