# SideBet V4

V4 is now a true multi-page website.

Pages:
- index.html — Home
- create-bet.html — Create a bet
- my-bets.html — Active bet portfolio
- past-bets.html — Closed bet history
- profile.html — Profile and local data tools
- market.html — Individual market detail page

Shared files:
- styles.css
- common.js
- page.js

## IntelliJ setup
Replace your current SideBet project contents with the files in this folder.
The easiest approach is to copy all V4 files into the main SideBet project folder.

Then open `index.html` in the browser.

Every page has a hamburger menu in the top-right that links to the other pages.

## Notes
This is still a front-end/local-storage MVP.
Data persists between these pages because they share the same browser localStorage.
Real multi-user sync still requires a backend/database.
