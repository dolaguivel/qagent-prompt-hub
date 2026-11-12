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
2. **The form fills itself as soon as the file is added.** The hub reads the
   work item, title, partner, case and CRM, platform, the decision (from the
   verdict, classification, assessment or result), confidence, plain-language
   summary, what it is not, what to tell the partner, workaround, root cause,
   solution, validation, files, proposed fix, verification, the original
   ticket of a duplicate, the questions for the reporter, and what was tried
   (with the domain) when it could not be reproduced.
   - **Every ticket field is replaced** when a report is added, so nothing
     from the previous ticket stays behind (a field the new report does not
     have is left empty). People, CC, structure, language and options are
     kept. **Undo** under the file brings back the previous fields.
   - Fields filled from the report are highlighted and tagged **from the
     report**; the tag goes away as soon as you edit the field. The panel
     under the file lists what was filled (a dashed chip means the value is
     kept for another decision, for example questions while the decision is
     "Confirmed defect") and what was **not in the report**, to fill in by
     hand.
   - **Work item**: the ticket the report is about wins over other tickets it
     mentions ("duplicate of #301596", "related to ADO 309999", "caused
     by…"). A number in the file name (`ado-312530-….pdf`) and the work item
     in the page header help decide. If the header has another work item,
     the field says so.
   - **Decision**: a verdict, classification or conclusion line wins over an
     assessment, and both over "Result:"/"Status:" lines (a "Result:" inside
     reproduction or validation steps is a step result). Negations count:
     "not a duplicate of…", "Configuration issue — not a code defect",
     "It looked like a configuration issue, but it is a code defect".
   - Reports can be laid out in many ways: headings ("Root Cause",
     "2. Root cause (technical)", "Two-Sentence Ticket Summary"), sub-headings
     inside a section ("Solution" › "Option A", "Change 1"), labels on a line
     ("Verdict: Code defect", "Partner: …"), tables of labels and values (Word
     or PDF) and Markdown (`| Partner | … |`, `## Root cause`).
   - A **Permissions**, **Data** or **Environment** verdict is a configuration
     decision of that kind ("This is a permissions issue." / "a data issue" /
     "an environment issue"); the kind can be changed under the decision.
     Steps under "Verdict and Steps for Support" › "Classification: …" fill
     the Solution, nested under their intro line as in the team's format.
   - When a report does not state a decision, step 4 says so and the preview
     warns ("Pick one in step 4") until a decision is picked or the selected
     one is clicked to confirm it; copying before that shows a warning too.
   - Page headers and footers (repeated on the pages, "Page 2 of 5", a
     browser's print date and address) are left out.
   - **SQL and code never go into the comment**: code lines are dropped and
     SQL inside a sentence is replaced by "(SQL in the attached analysis)";
     a sentence that introduced the code ("…would run:") points to the
     attached analysis. Links keep their address in view: "text (https://…)".
   - **Partner** comes from Partner, Customer, Agency or Organization lines.
     A "Client:" line is never used: in Credible a client is a person
     receiving services.
   - Everything stays editable. If a file cannot be read (scanned image,
     password-protected PDF, damaged file, old .doc), the message names the
     file and the report that was already loaded stays as it was. Only the
     last file added is used.
3. Choose the **ticket owner** from the list (typed as `@Full Name`) and the
   people **in copy**. The CC line is always the last line of the comment:
   `CC: @Tim Mitchell @David Olaguivel @Eduardo Diaz`. By default the owner is
   mentioned in that line, as in the team format; the owner can instead be
   greeted ("Hi @Owner,"), put on the first line, or left out. An optional
   signature goes just before the CC line.
4. Choose the **decision**: confirmed defect (code analysis only, reproduced,
   or QA will reproduce), duplicate (original ID and reason), more information
   needed (checklist of what to ask plus other questions for the reporter,
   business days on hold), configuration issue (the solution with the
   administrator's steps), working as designed (the options the partner has),
   or could not reproduce (domain, role, what was tried, questions for the
   reporter). The next ADO step is suggested for each decision.
5. Choose the **structure**. The default, **Model 6: Root cause, solution,
   validation**, follows the Sustainment team's format: an opening verdict
   ("This is a configuration issue.") and bullet sections, always in this
   order and only when they have content:

   | Decision | Sections |
   |---|---|
   | Configuration issue | Root Cause, Solution (what to change, the administrator's steps nested under it, the result), Validation |
   | Working as designed | Root Cause, Suggested Solution, Validation, Root Cause (Technical Explanation) |
   | Confirmed defect | Root Cause, Solution (what has to change, proposed fix, workaround), Validation (reproduction), Root Cause (Technical Explanation), Next Steps |
   | Duplicate | Root Cause, Duplicate Of (original ticket, reason, link), Validation, Root Cause (Technical Explanation), Next Steps |
   | More information needed | What We Checked, Information Needed, Validation, Technical Details, Next Steps |
   | Could not reproduce | What We Checked, What We Tested, Information Needed, Technical Details, Next Steps |

   Next Steps appears for defects, duplicates, "could not reproduce" and "more
   information needed"; for configuration and working as designed (as in the
   team's examples) only when there is something to tell the partner or a
   next step was picked on purpose. The technical section appears when
   "Include technical details" is on and it has content (technical
   explanation, files, verification, attached analysis); the proposed fix
   list only appears for confirmed defects. The other structures are Model 5 (two layers: Support, then
   technical), Decision first, Summary table, SBAR and Questions and answers.
   English or Spanish labels.

   **Writing the sections.** Root cause, Solution, Suggested solution,
   Validation and Technical explanation accept one bullet per line; a line
   that starts with two spaces (or a tab) nests under the bullet above, and
   deeper indentation nests further; lines between two ```` ``` ```` lines
   form a code block (for example a stored procedure call). Text pasted from
   an ADO comment keeps its bullets, nesting and code, and numbered lines
   become bullets. A single paragraph in Root cause becomes one bullet per
   sentence. Buttons insert recurring text ("Not a recent change", "Steps for
   the administrator", "Sign out and back in", "Data update with the DBA
   team", "Enhancement request"); replace the text in [brackets] before
   copying, the hub reminds you. The comment being written survives a reload
   of the browser tab; **New comment** clears it.
6. **Copy** with formatting (pastes with bold, lists and code into ADO's rich
   text editor), as plain text (with `*` bullets and ```` ``` ```` code blocks,
   which ADO's Markdown editor renders), or only the Support part (without
   the technical section). **Improve with QAgent** copies a prompt that
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
- SQL from the report is never copied into the comment by itself; the comment
  points to the attached analysis. Code you write or paste in the technical
  explanation is kept as a code block.

## Requirements

Node.js **24 LTS** (22.13 or later also works on your own server). Dependencies
are the two PostgreSQL drivers (`npm install`): Neon's serverless driver for
Neon and `pg` for any other PostgreSQL.

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

Vercel functions have no disk that survives between requests, so the SQLite
file cannot be used there: on Vercel the hub needs **Neon**, a serverless
PostgreSQL that Vercel offers in its Marketplace (free plan available). The hub
talks to Neon over HTTPS with Neon's serverless driver, so no database
connection has to stay open between requests, and it creates its tables by
itself on the first visit.

Use a Vercel team and repository owned by Qualifacts, not a personal account,
because the database holds company usage data.

1. **Repository.** Push this project to a Git repository (Azure DevOps,
   GitHub or GitLab). Do not commit `.env`, `node_modules` or `storage/*.db`
   (`.gitignore` already excludes them).
2. **Project.** In Vercel, **Add New > Project** and import the repository.
   Framework preset: **Other**. Leave Build Command and Install Command at
   their defaults (there is no build step; Vercel runs `npm install`) and do
   not override Output Directory: `vercel.json` sets it to `public` and routes
   `/api/*` to the serverless function. Node.js 24 comes from `package.json`. You can deploy now; the site will say it has no database yet.
3. **Database.** In the project open **Storage**, choose **Create Database**
   (or **Connect Database**), pick **Neon (Serverless Postgres)**, accept the
   integration, choose the **Free** plan and the region **Washington, D.C. /
   AWS us-east-1** (the same region as Vercel's default functions), and create
   it. When Vercel asks which environments to connect, select **Production,
   Preview and Development** and leave the prefix empty. Vercel then adds
   `DATABASE_URL` (and a few other `PG*`/`POSTGRES_*` variables) to the
   project.
4. **Redeploy.** Environment variables only reach new deployments: open
   **Deployments**, select the latest one and choose **Redeploy**.
5. **Check.** Open `https://<your-project>.vercel.app/healthz`. It should show
   `"ok":true,"database":"postgres","driver":"neon"`. If it shows an error,
   the message says what is missing.
6. **Admin.** Sign in as `admin` / `654321` and change the password under
   **Settings > Password**.
7. Optional variables under **Settings > Environment Variables**:
   `REQUIRE_PASSWORD_CHANGE`, `REPORT_TIMEZONE`, `ADMIN_PASSWORD` (only used
   when the admin account is first created). Redeploy after changing them.

If the organization cannot install Marketplace integrations, create the
database at [neon.tech](https://neon.tech) instead (**New project**, region AWS
us-east-1), copy the connection string from **Connect** (it looks like
`postgresql://user:password@ep-....us-east-1.aws.neon.tech/neondb?sslmode=require`),
add it in Vercel as the environment variable `DATABASE_URL` for all
environments, and redeploy.

**Test the connection from your PC** before or after deploying. With the
connection string in `.env` (`DATABASE_URL=...`) or in the terminal:

```bash
npm install
npm run db:check
```

It connects, creates or updates the tables, creates the admin account and lists
each table with its number of rows.

**Troubleshooting**

| What you see | What to do |
|---|---|
| "The hub is not ready yet ... has no database yet" | The database is not connected to this project or the deployment is older than the connection: connect Neon (step 3) and redeploy (step 4). |
| `/healthz` shows `password authentication failed` | The connection string is outdated (password reset in Neon). Reconnect the database or update `DATABASE_URL`, then redeploy. |
| `/healthz` shows `"driver":"pg"` with a Neon host | Remove `DB_DRIVER` from the environment variables, or set it to `auto`. |
| Build fails with a Node.js version message | In **Settings > Build and Deployment > Node.js Version** choose 24.x, or keep `engines` in `package.json` as it is. |
| A 404 for `/api/...` | Check that `vercel.json` and the `api/` folder are at the root of the repository (the folder that holds `package.json`), or set **Root Directory** to that folder. |

How it runs: `public/` is served by Vercel's CDN; `api/index.js` runs the API
as a serverless function. The prompt catalog is only served to signed-in
people (`/api/catalog.js`). Sign-in attempts are throttled per function
instance. If the database is asleep or unreachable on the first request, a
later request starts the hub again instead of leaving it broken.

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

Install Node.js 24 LTS (or 22.13 or later), copy the project, then `npm ci --omit=dev`
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
| `DATABASE_URL` | empty | PostgreSQL connection string. `POSTGRES_URL` and prefixed names from the Vercel Marketplace (for example `STORAGE_DATABASE_URL`) also work. Empty means SQLite (not possible on Vercel) |
| `DB_DRIVER` | `auto` | `auto` uses Neon's serverless driver for `*.neon.tech` hosts and `pg` for any other PostgreSQL; `neon` or `pg` force one |
| `DB_POOL_MAX` | `10` (`3` on Vercel) | Connections per instance with the `pg` driver |
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
`events` table, with the dashboard filters applied, as CSV for Excel or Power BI.
Long periods are split into parts (12,000 rows each on Vercel, whose responses
are limited to 4.5 MB; 100,000 rows on a normal server). For the full history,
connect Power BI directly to the PostgreSQL database.

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
server/util.js            Passwords, tokens, dates and catalog loading
server/seed-demo.js       Demo data generator (npm run seed:demo)
server/demo.js            npm run demo: rebuilds the demo database and starts the server
catalog/prompts.js        Prompt catalog, categories, stages, platforms, guide
public/index.html         App shell
public/assets/js/         boot.js (theme before first paint), app.js, comment.js (comment generator), admin.js, charts.js
public/assets/vendor/     PDF.js and Mammoth (licenses included), loaded on demand
public/assets/css/        Styles with the Qualifacts palette, light and dark
tools/build-local.js      Builds the one-file local edition into dist/
tools/db-check.js         npm run db:check: tests the database connection and creates the tables
vercel.json               Vercel settings and security headers
Dockerfile, docker-compose.yml
storage/                  SQLite databases (not committed)
```
