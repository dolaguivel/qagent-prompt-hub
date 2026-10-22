# QAgent Prompt Hub

A shared library of ready-to-use prompts for **QAgent**, Qualifacts' PDLC agent,
covering Credible, CareLogic and InSync. People pick a prompt, fill in a few
details and copy **one message** into QAgent: the platform, the work item and
the request are already in it.

It also turns the analysis QAgent exports (PDF or Word) into a **ready-to-paste
Azure DevOps comment** for the ticket owner.

There are two editions, built from the same code:

| | Server edition (this project) | Local edition (one HTML file) |
|---|---|---|
| Who it is for | Everyone at Qualifacts, on a company server or Vercel | One person, or while the server is not hosted yet |
| Sign-in | Corporate @qualifacts.com accounts | None |
| Where data is saved | The database (PostgreSQL or SQLite) | That person's browser |
| Admin dashboards | Yes | No |
| Prompts, favorites, ratings, comment generator | Yes | Yes |

## What it does

**For everyone**

- **56 prompts in 14 categories**, mapped to the 8 PDLC stages, including
  code-reading prompts (*Why an option does not appear*, *Trace an error
  message to the code*, *Configuration, data or code defect?*) that ask QAgent
  to cite files and lines, give read-only SQL and end with a verdict.
- **One message to send** to QAgent, with `Platform:` and `Work item:` lines.
- **Choose the QAgent agent** under **Options > QAgent agent**: the agent
  already active in the chat, **Product Agent** (`/product`, with the work item
  link right after the command) or any other agent by typing its command
  (`/switch` in QAgent lists them). The prompt then starts with that command.
- **Answer as a file**: under **Options > Also deliver the answer as a file**,
  choose **Word** or **Excel** and the prompt ends by asking QAgent to attach
  its complete answer as a `.docx` or `.xlsx` (Excel: one sheet with the whole
  answer plus one sheet per table). If QAgent cannot create files it is asked
  to say so and return text ready to paste.
- **Ticket comment generator** (see below).
- **Troubleshooting guide** with the common causes of each symptom.
- **Star ratings**, **favorites**, **My prompts**, search (`/` or `Ctrl K`),
  filters, light and dark themes, mobile layout.

**For the admin** (`admin` account only)

- **Overview**: active people, prompts copied, time in the hub, ratings,
  **ticket comments**, each compared with the previous period; daily trend;
  top prompts; copies by system, stage and category; **ticket comments by
  decision** (confirmed defect, duplicate, more information, configuration,
  working as designed, could not reproduce) and by structure; weekday and hour
  heatmap.
- **Prompts** (including copies by QAgent agent and answers requested as Word
  or Excel), **Teams & people** (including comments per team, area, system and
  person), **Feedback & searches**, **User accounts**.
- **Filters** on every report: date range, team, area, system, category,
  PDLC stage and person. Tables export to CSV; the raw event log exports for
  Excel or Power BI.

## Ticket comment generator

Menu: **Ticket comment**.

1. Add the analysis exported from QAgent (**PDF** or **Word .docx**). The file
   is read in the browser and is **never uploaded**.
2. The hub detects the work item, title, partner, case, platform, verdict,
   plain-language summary, what it is not, what to tell the partner, root
   cause, files, proposed fix and verification. Everything stays editable.
3. Choose the **ticket owner** from the list (typed as `@Full Name`) and the
   people **in copy**; the comment ends with `CC. @Eduardo Diaz`.
4. Choose the **decision**: confirmed defect (code analysis only, reproduced,
   or QA will reproduce), duplicate (original ID and reason), more information
   needed (checklist of what to ask, business days on hold), configuration or
   working as designed (steps for the administrator), or could not reproduce.
   The next ADO step is suggested for each decision.
5. Choose the **structure**. **Model 5, two layers** (Support first, technical
   details for Dev and QA below a line) is the default; models 1 to 4 are
   Decision first, Summary table, SBAR and Questions and answers. English or
   Spanish labels.
6. **Copy** with formatting (pastes with bold and lists into ADO), as plain
   text, or only the Support part. **Improve with QAgent** copies a prompt that
   asks QAgent to polish the draft without adding facts.

Other details:

- **People lists**: a team list managed by the admin plus each person's own
  list. "Always CC" adds someone to every new comment.
- **Presets** save a combination of decision, structure, language, sections,
  next step and CC. The last configuration and the signature are remembered.
- **PHI check**: the hub warns when the report or the comment looks like it
  contains SSNs, dates of birth, MRNs, phone numbers or personal emails. It is
  a hint, not a guarantee.
- **ADO mentions**: pasted `@Name` text is not a real mention. After pasting,
  retype `@` before each name and pick the person so ADO notifies them.
- SQL is never copied into the comment; the comment points to the attached
  analysis.

## Requirements

Node.js **22.13 or later** (Node 24 LTS works too). The only dependency is the
PostgreSQL driver (`npm install`).

## Local edition: one HTML file, no server

```bash
npm install
npm run build:local
```

This writes `dist/qagent-prompt-hub-local.html` (about 2.5 MB, it includes the
PDF and Word readers). Share it by Teams or email; people open it with a double
click in Edge or Chrome. Rebuild it after changing the catalog; never edit the
generated file.

## Try the server with demo data

```bash
npm install
npm run demo
```

Open http://localhost:3000. The demo database (`storage/demo.db`) is rebuilt
with 43 fictional people, 90 days of activity and ticket comments every time.

- Admin: user `admin`, password `654321`
- Any demo person, for example `paula.huaman.demo@qualifacts.com`, password `123456`

## Run it for real

```bash
npm install
npm start
```

- With **`DATABASE_URL`** set, the hub uses **PostgreSQL** (recommended for a
  shared server; required on Vercel).
- Without it, it uses **SQLite** in `storage/hub.db` (fine for one server
  with a persistent disk).

Tables are created and migrated automatically on start. The database starts
with only the admin account; everyone else creates their own account.

### Accounts

- Only `@qualifacts.com` addresses can create an account or sign in. Any other
  domain gets "Only corporate @qualifacts.com email addresses can sign in or
  create an account."
- New accounts get the initial password **123456**; people change it under
  **Settings > Password**.
- The **admin** account (`admin` / `654321`) is the only one that sees the
  dashboards, manages accounts and edits the team list of people for comments.
  **Change its password right after the first deployment.**
- Forgotten password: the admin selects **Reset password**.
- `REQUIRE_PASSWORD_CHANGE=true` forces people to replace the initial password
  before using the hub. Recommended for a company-wide rollout, since everyone
  starts with the same password.

## Deploy

### Option A: Vercel + Neon (PostgreSQL)

Use a Vercel team and repository owned by Qualifacts, not a personal account,
because the database holds company usage data.

1. Push this project to a Git repository (Azure DevOps, GitHub or GitLab).
2. In Vercel, **Add New > Project**, import the repository. Framework preset:
   **Other**. Leave build and output settings as they are (`vercel.json`
   sets them).
3. In the project, **Storage > Create Database > Neon (Postgres)** and connect
   it to the project. This adds `DATABASE_URL` to the environment variables.
4. Optional: add `ADMIN_PASSWORD`, `REQUIRE_PASSWORD_CHANGE`,
   `REPORT_TIMEZONE` under **Settings > Environment Variables**.
5. **Deploy**. Open `https://<project>.vercel.app/healthz`; it should answer
   `{"ok":true,"database":"postgres"}`.
6. Sign in as `admin` / `654321` and change the password.

How it runs: `public/` is served by Vercel's CDN; `api/index.js` runs the API
as a serverless function. The prompt catalog is only served to signed-in
people (`/api/catalog.js`). Sign-in attempts are throttled per function
instance.

### Option B: company server with Docker (hub + PostgreSQL)

```bash
cp .env.example .env      # set DB_PASSWORD and ADMIN_PASSWORD
docker compose up -d --build
```

The hub listens on port 3000; put it behind the company's HTTPS reverse proxy
(IIS, nginx, Azure Application Gateway) and set `TRUST_PROXY=true`. The data
lives in the `pgdata` volume.

To use an existing company PostgreSQL instead, run only the image:

```bash
docker build -t qagent-prompt-hub .
docker run -d -p 3000:3000 -e DATABASE_URL=postgres://user:pass@host:5432/hub qagent-prompt-hub
```

### Option C: Windows or Linux server without Docker

Install Node.js 22 LTS or later, copy the project, then `npm ci --omit=dev`
and `npm start`. Run it as a service (NSSM on Windows, systemd on Linux)
behind IIS or nginx with HTTPS. Set `DATABASE_URL` for PostgreSQL, or leave it
empty for SQLite in `storage/`.

### Option D: Azure App Service (Linux)

Deploy the repository with start command `npm start`, set `DATABASE_URL`
(Azure Database for PostgreSQL) and `TRUST_PROXY=true`, and turn on HTTPS Only.
With SQLite instead, set `DB_PATH=/home/data/hub.db` and
`SQLITE_JOURNAL_MODE=DELETE` and keep a single instance.

### Configuration

Environment variables, or a `.env` file (see `.env.example`).

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | empty | PostgreSQL connection string. `POSTGRES_URL` also works. Empty means SQLite |
| `DB_POOL_MAX` | `10` (`3` on Vercel) | PostgreSQL connections per server or function instance |
| `DB_PATH` | `storage/hub.db` | SQLite file, when there is no `DATABASE_URL` |
| `SQLITE_JOURNAL_MODE` | `WAL` | `DELETE` on network storage |
| `PORT` | `3000` | HTTP port |
| `ALLOWED_DOMAIN` | `qualifacts.com` | Email domain allowed to register |
| `DEFAULT_PASSWORD` | `123456` | Initial password for new accounts and resets |
| `ADMIN_USERNAME` | `admin` | Admin sign-in name |
| `ADMIN_PASSWORD` | `654321` | Admin password, used only when the admin account is first created |
| `REQUIRE_PASSWORD_CHANGE` | `false` | Force people to change the initial password |
| `SESSION_DAYS` | `30` | How long a sign-in lasts |
| `REPORT_TIMEZONE` | `America/Chicago` | Time zone for grouping reports by day and hour |
| `TRUST_PROXY` | `false` (`true` on Vercel) | Behind a reverse proxy or load balancer |
| `COOKIE_SECURE` | `auto` | `true` forces Secure cookies; `auto` uses them on HTTPS |

### Backups

- PostgreSQL: `pg_dump "$DATABASE_URL" > hub-backup.sql` (Neon also keeps
  point-in-time history).
- SQLite: `sqlite3 storage/hub.db ".backup backup.db"` while the server runs.

## Data saved for the dashboards

Everything people do is stored in the database, so future dashboards and
charts (in the hub or in Power BI connected to PostgreSQL) can use it.

| Table | What it holds |
|---|---|
| `users` | Accounts: email, name, team, area, main system, role, created, last sign-in and last seen |
| `events` | One row per action: sign-in, prompt view, copy, search, share, download, favorite, rating, **comment**, with day, hour, weekday, team, area and system at that moment |
| `visits` | Time in the hub: active seconds per visit |
| `ratings` | Stars and optional comment per person and prompt |
| `favorites` | Saved prompts |
| `custom_prompts` | Each person's own prompts |
| `contacts` | People for ticket comments: team list (no owner) and personal lists |
| `user_prefs` | Comment generator presets, last configuration and signature |
| `auth_sessions` | Active sign-ins (hashed tokens) |

Admin activity is not recorded. **Raw events (CSV)** in the admin dashboard downloads the
`events` table as CSV for Excel or Power BI.

**What is never sent to the server**: the text people paste into prompts
(code, logs, documents), the QAgent reports they open in the comment generator
and the comments they write. For a ticket comment the server only stores its
decision type, structure, language and how it was copied. For a prompt copy it
stores the answer length, the guardrail, the QAgent agent command and the file
type requested.

## Add or improve a prompt

All content lives in `catalog/prompts.js`; the server reloads it when it
changes. It is not in `public/`, so it is only served to signed-in people.

1. Build and test the prompt in QAgent with a real work item.
2. In the hub, save it under **My prompts** and select **Copy as catalog entry**.
3. Paste the entry into the `prompts` list in `catalog/prompts.js`.
4. Open a pull request, then redeploy (and `npm run build:local` for the local
   edition).

| Field | Notes |
|---|---|
| `id` | Unique, lowercase, dashes. Used in links and reports. |
| `title`, `description` | What the prompt produces, in plain words. |
| `category`, `stage` | Ids from `categories` and `stages`. |
| `ticket` | `required`, `optional` or `none`. The hub adds the work item lines. |
| `tags` | Used by search. |
| `template` | The prompt. `{{VARIABLE}}` for anything the user fills in. |

`{{CODE_EVIDENCE}}` inserts the standard code-reading rules and
`{{PLATFORM_NOTES}}` the notes of the selected platform. The CareLogic and
InSync entries in `platforms` have empty `notes`: each team should add its
repositories and where settings and permissions are stored.

**Agents and file requests** are also in the catalog:

- `agents`: the agents offered under **Options > QAgent agent**
  (`cmd`, `name`, `desc`, and `takesWorkItem` when the command accepts the work
  item link after it). Product Agent is included; send `/switch` in QAgent to
  see the other agents your teams use and add them here.
- `fileOutputs`: the exact text added at the end of the prompt when someone
  chooses Word or Excel. Adjust it if QAgent's file export works differently.

Never put patient data, customer data or credentials in the catalog.

## Project structure

```
api/index.js              Vercel entry point (serverless API)
server/app.js             JSON API: accounts, prompts, comments, people, metrics
server/server.js          Standalone server: static files + API
server/db.js              SQLite and PostgreSQL adapters, migrations
server/metrics.js         Admin reports and CSV export
server/config.js          Settings and .env loading
server/seed-demo.js       Demo data generator
catalog/prompts.js        Prompt catalog, categories, stages, platforms, guide
public/index.html         App shell
public/assets/js/         app.js, comment.js (comment generator), admin.js, charts.js
public/assets/vendor/     PDF.js and Mammoth (licenses included), loaded on demand
public/assets/css/        Styles with the Qualifacts palette, light and dark
tools/build-local.js      Builds the one-file local edition into dist/
vercel.json               Vercel settings and security headers
Dockerfile, docker-compose.yml
storage/                  SQLite databases (not committed)
```
