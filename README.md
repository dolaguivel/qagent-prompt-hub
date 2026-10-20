# QAgent Prompt Hub

A shared library of ready-to-use prompts for **QAgent**, Qualifacts' PDLC agent,
covering Credible, CareLogic and InSync. People pick a prompt, fill in a few
details and copy **one message** into QAgent: the platform, the work item and
the request are already in it.

Version 2 adds corporate accounts, star ratings, favorites and an admin
dashboard with usage reports.

## What it does

**For everyone**

- **56 prompts in 14 categories**, mapped to the 8 PDLC stages.
- **Code-reading prompts.** QAgent searches the platform repositories and reads
  the code. Prompts such as *Why an option does not appear*, *Trace an error
  message to the code* and *Configuration, data or code defect?* ask it to cite
  files and lines, give read-only SQL and end with a verdict.
- **One message to send.** The prompt starts with `Platform:` and
  `Work item:` lines and the instruction to load the ticket, followed by the
  request. An option puts `/product <url>` on the first line instead.
- **Troubleshooting guide** with the common causes of each symptom (missing
  options, errors, validations, customer differences, saves, reports,
  integrations, performance, regressions, dates) and the prompts for each.
- **Platform notes** that code prompts include automatically, so QAgent knows
  where each platform keeps configuration and permissions.
- **Star ratings** (1 to 5) with an optional comment for the maintainers.
- **Favorites** saved to the account, plus "you copy these often" and
  "recently copied" lists.
- **My prompts**: personal prompts saved to the account, exportable, and
  convertible into a catalog entry for a pull request.
- Search (`/` or `Ctrl K`), filters by category, stage and type, light and
  dark themes, mobile layout.

**For the admin**

- **Overview**: active people, prompts copied, time in the hub, time per
  person, views that led to a copy, average rating, new accounts and prompts
  in use, each compared with the previous period; daily trend; top prompts;
  copies by system, PDLC stage and category; weekday and hour heatmap.
- **Prompts**: views, copies, copy rate, people, rating, saves and last use per
  prompt; prompts nobody copied; low-rated prompts.
- **Teams & people**: activity and time by team, area, system and person.
- **Feedback & searches**: rating distribution, comments, top searches and
  searches with no results (candidates for new prompts).
- **User accounts**: edit team, area and system, reset a password, deactivate
  or reactivate.
- **Filters** on every report: date range (presets or custom), team, area,
  system, category, PDLC stage and person. Tables export to CSV, and the raw
  event log exports for Excel or Power BI.

## Requirements

Node.js **22.13 or later** (Node 24 LTS works too). There is nothing to
install: the server uses only Node's built-in modules, including the built-in
SQLite driver.

## Local edition: one HTML file, no server

For people who just need the prompts, or while the server is not hosted yet:

```bash
npm run build:local
```

This writes `dist/qagent-prompt-hub-local.html`. Share that file by Teams or
email; people open it with a double click in Edge or Chrome.

It has every prompt, the single "Send to QAgent" message, favorites, star
ratings, My prompts and the troubleshooting guide. Everything is saved in each
person's browser, so there is no sign-in, ratings are personal and there are no
admin dashboards. Export and import under Settings move a person's prompts,
favorites and ratings between computers or into the server version.

Rebuild the file after changing the catalog; never edit the generated file.

## Try it with demo data

```bash
npm run demo
```

Open http://localhost:3000. The demo database (`storage/demo.db`) is rebuilt
with 43 fictional people and 90 days of activity every time you run it.

- Admin: user `admin`, password `654321`
- Any demo person, for example `ana.coleman.demo@qualifacts.com`, password `123456`

## Run it for real

```bash
npm start
```

The real database is `storage/hub.db`. It starts with only the admin account;
everyone else creates their own account.

### Accounts

- Only `@qualifacts.com` addresses can create an account or sign in. Any other
  domain gets the message "Only corporate @qualifacts.com email addresses can
  sign in or create an account."
- New accounts get the initial password **123456**. People change it under
  **Settings > Password**; until they do, a banner reminds them.
- The **admin** account (`admin` / `654321`) is the only one that sees the
  dashboards and manages accounts. Change its password after the first sign-in.
- Forgotten password: the admin selects **Reset password**, which sets it back
  to the initial password and signs the person out.
- Set `REQUIRE_PASSWORD_CHANGE=true` to make people replace the initial
  password before they can use the hub.

> Because everyone starts with the same initial password, anyone who knows a
> colleague's email could sign in as them until that person changes it. For a
> company-wide rollout, turn on `REQUIRE_PASSWORD_CHANGE`, or plan a move to
> Microsoft Entra ID single sign-on.

### Configuration

Set these as environment variables or in a `.env` file (see `.env.example`).

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `storage/hub.db` | SQLite database file |
| `SQLITE_JOURNAL_MODE` | `WAL` | Use `DELETE` when the database is on network storage (Azure App Service `/home`, file shares) |
| `ALLOWED_DOMAIN` | `qualifacts.com` | Email domain allowed to register |
| `DEFAULT_PASSWORD` | `123456` | Initial password for new accounts and resets |
| `ADMIN_USERNAME` | `admin` | Admin sign-in name |
| `ADMIN_PASSWORD` | `654321` | Admin password, used only when the admin account is first created |
| `REQUIRE_PASSWORD_CHANGE` | `false` | Force people to change the initial password |
| `SESSION_DAYS` | `30` | How long a sign-in lasts |
| `REPORT_TIMEZONE` | `America/Chicago` | Time zone used to group reports by day and hour |
| `TRUST_PROXY` | `false` | Set to `true` behind a reverse proxy or load balancer |
| `COOKIE_SECURE` | `auto` | `true` forces Secure cookies; `auto` uses them on HTTPS |

## Deploy

The server needs a place where `storage/` persists between restarts.

- **Azure App Service (Linux, Node 22 or 24)**: deploy the repository, set the
  start command to `npm start`, set `DB_PATH=/home/data/hub.db`,
  `SQLITE_JOURNAL_MODE=DELETE` and `TRUST_PROXY=true`, turn on Always On and
  HTTPS Only, and keep the app on **one instance** (SQLite does not support
  several servers writing to the same file).
- **Docker**: `docker build -t qagent-prompt-hub .` then
  `docker run -p 3000:3000 -v hub-data:/app/storage qagent-prompt-hub`.
- **A Windows or Linux server**: run `npm start` as a service (for example with
  NSSM on Windows or systemd on Linux) behind IIS or nginx with HTTPS.

**Backups**: copy `storage/hub.db` together with its `-wal` file, or run
`sqlite3 storage/hub.db ".backup backup.db"` while the server runs.

## What is tracked

The hub records sign-ins, which prompts people open and copy, ratings,
favorites, searches (the words typed and whether anything matched) and time
while the hub tab is visible and in use. Team, area and system are stored with
each event so reports stay correct if someone changes team. Admin activity is
not recorded.

The text people type or paste into a prompt (code, logs, documents, customer
codes) is **never sent to the server**. Work item links and short fields are
remembered only in the person's browser.

## Add or improve a prompt

All content lives in `public/data/prompts.js`; the server reloads it when it
changes.

1. Build and test the prompt in QAgent with a real work item.
2. In the hub, save it under **My prompts** and select **Copy as catalog entry**.
3. Paste the entry into the `prompts` list in `public/data/prompts.js`.
4. Open a pull request.

| Field | Notes |
|---|---|
| `id` | Unique, lowercase, dashes. Used in links and reports. |
| `title`, `description` | What the prompt produces, in plain words. |
| `category`, `stage` | Ids from `categories` and `stages`. |
| `ticket` | `required`, `optional` or `none`. The hub adds the work item lines. |
| `tags` | Used by search. |
| `template` | The prompt. `{{VARIABLE}}` for anything the user fills in. |
| `featured` | Optional. Shows the prompt on the home page. |

`{{CODE_EVIDENCE}}` inserts the standard code-reading rules and
`{{PLATFORM_NOTES}}` the notes of the selected platform.

**Platform notes**: the CareLogic and InSync entries in `platforms` have empty
`notes`. Each team should add its repositories and where customer settings and
role permissions are stored, so code prompts point QAgent to the right place.

## Project structure

```
server/server.js        HTTP server and JSON API
server/metrics.js       Admin reports
server/db.js            SQLite schema and migrations
server/config.js        Settings and .env loading
server/seed-demo.js     Demo data generator
public/index.html       App shell
public/data/prompts.js  Prompt catalog, categories, stages, platforms, troubleshooting guide
public/assets/js/       app.js (app), admin.js (dashboards), charts.js (charts)
public/assets/css/      Styles with the Qualifacts palette, light and dark
storage/                Databases (not committed)
```
