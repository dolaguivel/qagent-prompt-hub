/*
 * QAgent Prompt Hub — prompt catalog
 * ------------------------------------------------------------------
 * This is the only file you need to edit to add or improve prompts.
 * The server reloads it automatically when it changes.
 *
 * How to add a prompt:
 *   1. Copy an existing object in `prompts` and give it a unique `id`
 *      (lowercase letters, numbers and dashes).
 *   2. Pick a `category` and `stage` from the lists below.
 *   3. Set `ticket`:
 *        'required'  the prompt is about a specific work item
 *        'optional'  a work item adds context but is not needed
 *        'none'      the prompt never uses a work item
 *      The hub adds the platform, the work item link and the instruction
 *      to load it at the top of the prompt, so templates should not repeat them.
 *   4. Write the template. Wrap anything the user fills in with
 *      {{VARIABLE_NAME}}. Known variables (see `variables`) get labels,
 *      dropdowns and placeholders; new ones become text fields.
 *      {{PLATFORM_NOTES}} inserts the notes of the selected platform and
 *      {{CODE_EVIDENCE}} the standard code-reading rules (see `snippets`).
 *   5. Open a pull request. Tip: build it in the app under "My prompts"
 *      and use "Copy as catalog entry" to get a ready-made object.
 *
 * Never put real patient data, customer data or credentials in here.
 */
window.QPH_DATA = {
  meta: {
    appName: 'QAgent Prompt Hub',
    version: '2.0.0',
    updated: '2026-10-14',
    maintainers: 'Sustainment team',
    // Optional: a link that opens QAgent (for example a Teams deep link). Empty hides the button.
    qagentLink: '',
    // Optional: where people send feedback or request prompts.
    feedbackLink: ''
  },

  // Appended to every prompt while the "PHI guardrail" option is on.
  guardrail:
    'Guardrails: Do not reproduce protected health information (patient names, dates of birth, MRNs, SSNs, addresses, phone numbers) in your answer; refer to records by internal IDs only. If information is missing or uncertain, say so explicitly instead of assuming.',

  // Appended according to the "Answer length" option.
  lengths: {
    standard: { label: 'Standard', text: '' },
    concise: { label: 'Concise', text: 'Keep the answer concise: under 250 words, bullet points where possible.' },
    detailed: { label: 'Detailed', text: 'Be thorough: explain your reasoning and include every relevant detail you can find.' }
  },

  // Reusable text blocks. Use them in templates as {{NAME}}.
  snippets: {
    CODE_EVIDENCE:
      'Search the {{PLATFORM}} codebase and read the relevant files before answering. For every finding, cite the repository, the file path and the lines involved, and quote the code that matters. If you cannot find the code, say so instead of guessing.'
  },

  // Areas people choose when they create an account (used to filter reports).
  areas: ['Development', 'Quality assurance', 'Business analysis', 'Product management', 'Support', 'Implementation', 'Leadership', 'Other'],

  // Optional: team names suggested on the sign-up form. People can also type their own.
  teams: [],

  // Platforms. `match` detects the platform from the work item URL.
  // `notes` is inserted into code-reading prompts through {{PLATFORM_NOTES}};
  // each platform team should keep its notes current.
  platforms: [
    {
      name: 'Credible',
      match: ['crediblebh', 'credible'],
      notes: 'Credible combines Classic ASP pages (.asp) and ASP.NET Web Forms pages (.aspx with VB.NET or C# code-behind) on SQL Server; the main repository is QSI-Credible-Platform/CBH.CredibleCoreWeb. Customer settings live in the PartnerConfig table of the CWMF_Partner database, and some of them are loaded into Session at login, so a configuration change can need a logout and login before it shows.'
    },
    {
      name: 'CareLogic',
      match: ['carelogic'],
      notes: '' // TODO (CareLogic team): repositories, where customer configuration and role permissions live.
    },
    {
      name: 'InSync',
      match: ['insync'],
      notes: '' // TODO (InSync team): repositories, where customer configuration and role permissions live.
    },
    { name: 'Other', match: [], notes: '' }
  ],
  // Used when the selected platform has no notes.
  platformNotesFallback: 'Before concluding, find where this platform stores customer configuration, role permissions and feature toggles, and check each one.',

  // PDLC stages. Adjust names and descriptions to match the official framework.
  stages: [
    { id: 'intake',   name: 'Intake',   goal: 'Understand what was reported and whether the ticket is complete.', done: 'The problem is understood and any missing information has been requested.' },
    { id: 'triage',   name: 'Triage',   goal: 'Size the issue, confirm severity and reproduce it.', done: 'Severity and priority are agreed and the issue is reproduced or clearly blocked.' },
    { id: 'analyze',  name: 'Analyze',  goal: 'Find the root cause and the real impact.', done: 'The root cause is confirmed with evidence and the impact is sized.' },
    { id: 'design',   name: 'Design',   goal: 'Choose the fix and make the requirements unambiguous.', done: 'An approach is agreed and acceptance criteria are testable.' },
    { id: 'build',    name: 'Build',    goal: 'Implement, review and hand off the change.', done: 'Code is reviewed, scripts are ready and QA has a handoff note.' },
    { id: 'validate', name: 'Validate', goal: 'Prove the fix works and nothing else broke.', done: 'The fix is verified and regression testing has passed.' },
    { id: 'release',  name: 'Release',  goal: 'Ship safely and tell the right people.', done: 'The change is deployed, release notes are published and customers are updated.' },
    { id: 'learn',    name: 'Learn',    goal: 'Capture what we learned so it does not happen again.', done: 'A knowledge base article or postmortem exists and follow-ups are logged.' }
  ],

  categories: [
    { id: 'triage',       name: 'Ticket review & triage',   color: '#13A396', description: 'Understand, size and reproduce a new work item.' },
    { id: 'visibility',   name: 'Missing options & access', color: '#D9822B', description: 'Options, links or buttons that do not appear, are disabled or are blocked by a role.' },
    { id: 'rootcause',    name: 'Diagnosis & root cause',   color: '#6A4BC4', description: 'Get from symptom to a confirmed cause.' },
    { id: 'debug',        name: 'Errors & debugging',       color: '#2F6BD8', description: 'Trace error messages to the code, follow code paths and read logs.' },
    { id: 'config',       name: 'Configuration vs. defect', color: '#7B8B1E', description: 'Decide whether a bug is configuration, data or code, and compare customers.' },
    { id: 'explore',      name: 'Code exploration',         color: '#2A7F9E', description: 'How a feature works, where a value comes from and who uses a piece of code.' },
    { id: 'solution',     name: 'Solution design',          color: '#0E9CC4', description: 'Compare fixes and plan the implementation.' },
    { id: 'code',         name: 'Code review',              color: '#4B3FB8', description: 'Review changes for correctness and security.' },
    { id: 'testing',      name: 'Test cases & QA',          color: '#2E9E5B', description: 'Test cases, edge cases, regression and UAT.' },
    { id: 'requirements', name: 'Use cases & requirements', color: '#B7791F', description: 'Use cases, user stories and PRD reviews.' },
    { id: 'sql',          name: 'SQL & data',               color: '#C2562B', description: 'Diagnostic queries, procedures and data fixes.' },
    { id: 'comms',        name: 'Communication & docs',     color: '#C23D78', description: 'Updates, handoffs, release notes and KB articles.' },
    { id: 'compliance',   name: 'Compliance & risk',        color: '#8E3FB5', description: 'PHI, HIPAA, clinical and billing impact.' },
    { id: 'release',      name: 'Release & postmortem',     color: '#5A6B8C', description: 'Deployment readiness and learning from incidents.' }
  ],

  // Built-in QAgent commands (from the QAgent help card).
  commands: [
    { cmd: '/product', args: '<work item URL>', group: 'Work items', desc: 'Loads an Azure DevOps work item and summarizes it. QAgent may ask which platform the item belongs to before pulling it.', when: 'You only want the summary of a ticket. Prompts from this hub already include the work item and the platform, so they do not need it.' },
    { cmd: '/new', aliases: ['/clear', '/reset'], group: 'Sessions', desc: 'Starts a brand-new session, clearing the current state and conversation history.', when: 'You move to a different ticket, so details from the previous one do not leak into the answer.' },
    { cmd: '/sessions', group: 'Sessions', desc: 'Lists this conversation’s past sessions that can be resumed.', when: 'You want to find the session where you worked on a ticket earlier.' },
    { cmd: '/resume', group: 'Sessions', desc: 'Points the conversation back at a past session.', when: 'You want to continue a ticket where you left off, with its context intact.' },
    { cmd: '/status', group: 'Sessions', desc: 'Shows which agent is active in this conversation and how it was chosen.', when: 'Answers look off and you want to confirm you are talking to the right agent.' },
    { cmd: '/switch', group: 'Agents', desc: 'Lists the agents you can reach, with their slash commands, so you can switch to one.', when: 'A task belongs to a different agent.' },
    { cmd: '/stop', group: 'Control', desc: 'Stops the agent’s current in-progress response.', when: 'The agent is going in the wrong direction and you want to redirect it.' },
    { cmd: '/stop-notifications', group: 'Control', desc: 'Stops this agent from sending you proactive notifications in this chat.', when: 'You only want answers you ask for.' },
    { cmd: '/reconnect', group: 'Control', desc: 'Forces a brand-new sign-in link for a connected service.', when: 'A sign-in link stops working or a code or work item lookup fails with an authentication error.' },
    { cmd: '/refine', args: '[draft message]', group: 'Writing', desc: 'Sharpens a draft message before acting on it. Used on its own, it sharpens your previous message.', when: 'A prompt did not land and you want QAgent to improve the request before answering.' }
  ],

  // Known variables. Anything not listed here becomes a plain text field.
  variables: {
    WORK_ITEM_URL: { label: 'Work item URL', type: 'text', placeholder: 'https://dev.azure.com/CredibleBH/Sustainment/_workitems/edit/307940' },
    WORK_ITEM_ID: { label: 'Work item ID', type: 'text', placeholder: '307940', help: 'Filled in automatically from the URL.' },
    PLATFORM: { label: 'Platform', type: 'select', options: 'platforms' },
    ENVIRONMENT: { label: 'Environment', type: 'select', options: ['QA', 'Staging / UAT', 'Production', 'Dev / local'] },
    TECH_STACK: { label: 'Technology', type: 'select', options: ['Classic ASP / VBScript', 'ASP.NET Web Forms (VB.NET)', '.NET / C#', 'SQL Server (T-SQL)', 'JavaScript / front end', 'Integration / API', 'Not sure'] },
    AUDIENCE: { label: 'Audience', type: 'select', options: ['Customer', 'Support case owner', 'Internal dev and QA team', 'Leadership'] },
    STATUS: { label: 'Current status', type: 'select', options: ['Investigating', 'Root cause identified', 'Fix in development', 'Fix in QA', 'Fix released', 'Waiting for information'] },

    SCREEN: { label: 'Screen or page', type: 'text', placeholder: 'billing/admin.aspx (Billing > Admin)' },
    MISSING_ITEM: { label: 'What does not appear', type: 'text', placeholder: 'Billing Clearinghouse Files link' },
    CONTROL: { label: 'Button or field', type: 'text', placeholder: 'Save button on the client profile' },
    ACTION: { label: 'What the user tries to do', type: 'text', placeholder: 'Sign a progress note for another clinician' },
    FEATURE: { label: 'Feature', type: 'text', placeholder: 'Outsource billing upload' },
    FIELD_NAME: { label: 'Field or value', type: 'text', placeholder: 'Number of days on a Predefined Red X' },
    REPORT_NAME: { label: 'Report or export', type: 'text', placeholder: 'Unsigned visits report' },
    INTEGRATION: { label: 'Integration or interface', type: 'text', placeholder: 'Clearinghouse 837 upload, HL7 lab results, eRx' },
    JOB_NAME: { label: 'Job or process', type: 'text', placeholder: 'Nightly claims batch' },
    CODE_ELEMENT: { label: 'Function, procedure, table or column', type: 'text', placeholder: 'psp_required_visitrecipienttypes_update' },
    USER_ROLE: { label: 'User role or profile', type: 'text', optional: true, placeholder: 'Clinician, Billing supervisor', fallback: 'Not specified. Check every role-based condition you find.' },
    CUSTOMER: { label: 'Customer or partner', type: 'text', optional: true, placeholder: 'CGC', fallback: 'Not specified.' },
    CUSTOMER_FAILS: { label: 'Customer where it fails', type: 'text', placeholder: 'CGC' },
    CUSTOMER_WORKS: { label: 'Customer where it works', type: 'text', placeholder: 'CGCTEST' },
    EXPECTED: { label: 'Expected behavior', type: 'textarea', rows: 3, placeholder: 'What should happen' },
    ACTUAL: { label: 'Actual behavior', type: 'textarea', rows: 3, placeholder: 'What happens instead' },
    SYMPTOM: { label: 'What the user sees', type: 'textarea', rows: 3, placeholder: 'Visits saved on Saturday night show Friday’s date' },
    WORKED_UNTIL: { label: 'When it last worked', type: 'text', optional: true, placeholder: 'Before the 2026.09 release', fallback: 'Unknown.' },

    ERROR_TEXT: { label: 'Error message', type: 'textarea', rows: 4, placeholder: "Microsoft SQL Server Native Client 10.0 error '80040e14' Incorrect syntax near ','." },
    FILE_PATH: { label: 'File or location', type: 'text', optional: true, placeholder: '/common/util.asp, line 535', fallback: 'Not specified.' },
    CODE_FILE: { label: 'File path', type: 'text', placeholder: 'CredibleCore.Web/lookups/customredx.asp' },
    CODE_SNIPPET: { label: 'Code', type: 'textarea', rows: 8, placeholder: 'Paste the relevant code block' },
    CODE_OPTIONAL: { label: 'Code', type: 'textarea', rows: 6, optional: true, placeholder: 'Optional: paste the block you care about', fallback: 'Not pasted. Read the file from the {{PLATFORM}} repository.' },
    LOG_TEXT: { label: 'Logs', type: 'textarea', rows: 8, placeholder: 'Paste the log lines (remove patient names first)' },
    DIFF: { label: 'Code change (diff, PR link or snippet)', type: 'textarea', rows: 8, placeholder: 'Paste the diff, the changed code or the pull request link' },
    SQL_OBJECT: { label: 'Stored procedure or table', type: 'text', placeholder: 'psp_required_visitrecipienttypes_update' },
    SQL_CODE: { label: 'SQL code', type: 'textarea', rows: 8, optional: true, placeholder: 'Optional: paste the procedure or query', fallback: 'Not pasted. Read the object definition from the repository.' },
    SCHEMA_NOTES: { label: 'Relevant tables and columns', type: 'textarea', rows: 3, optional: true, fallback: 'Not known. Find the likely tables in the code and confirm the names before writing queries.' },
    GOAL: { label: 'What you need to find or fix', type: 'textarea', rows: 3, placeholder: 'e.g. every Predefined Red X configuration where number_of_days is NULL' },
    PRD_TEXT: { label: 'PRD or feature description', type: 'textarea', rows: 10, placeholder: 'Paste the PRD, epic or feature description' },
    CHANGE_SUMMARY: { label: 'Change summary', type: 'textarea', rows: 3, placeholder: 'e.g. wrap numberOfDays, reqVisits1 and reqVisits2 with dbn() in customredx.asp' },
    APPROACH: { label: 'Agreed approach', type: 'textarea', rows: 3, placeholder: 'The fix the team agreed on' },
    ALREADY_TRIED: { label: 'What you have already tried', type: 'textarea', rows: 3, optional: true, fallback: 'Nothing yet.' },
    INCIDENT_TIMELINE: { label: 'Timeline notes', type: 'textarea', rows: 4, optional: true, fallback: 'Use the dates and comments in the work item history.' },
    RELEASE_VERSION: { label: 'Release', type: 'text', optional: true, placeholder: '2026.10', fallback: 'the next scheduled release' },
    EXTRA_CONTEXT: { label: 'Additional context', type: 'textarea', rows: 3, optional: true, fallback: 'None.' }
  },

  // Curated sequences of prompts for common situations.
  recipes: [
    { id: 'new-bug', title: 'A new bug lands in my queue', when: 'From first read to a proposed fix.', steps: ['ticket-review', 'severity-priority', 'config-or-defect', 'rca', 'solution-options', 'status-comment'] },
    { id: 'missing-option', title: 'An option does not appear', when: 'Menus, links, buttons or fields that are missing.', steps: ['missing-option', 'role-access', 'feature-switches', 'customer-difference', 'customer-update'] },
    { id: 'error-message', title: 'Users get an error message', when: 'From the message on screen to the line of code.', steps: ['error-in-code', 'error-decoder', 'legacy-trace', 'sql-diagnostic', 'test-cases'] },
    { id: 'fix-to-qa', title: 'My fix is ready for QA', when: 'Hand a finished change over safely.', steps: ['code-review', 'handoff-note', 'test-cases', 'regression-risk', 'release-notes'] },
    { id: 'escalation', title: 'Customer escalation', when: 'High visibility, impact first.', steps: ['ticket-review', 'clinical-impact', 'phi-check', 'customer-update', 'decision-brief'] },
    { id: 'prd-review', title: 'Enhancement or PRD review', when: 'Before development starts.', steps: ['prd-gap', 'feature-walkthrough', 'use-cases', 'edge-cases', 'test-cases'] }
  ],

  // Common bug causes, shown on the Troubleshooting page.
  troubleshooting: {
    intro: 'Most sustainment bugs come from a short list of causes. Check the cheap ones first: configuration, permissions and stale sessions explain many issues before any code is wrong.',
    rules: [
      { verdict: 'Configuration', test: 'The code does exactly what it was written to do, and the outcome changes when a setting, role right or customer option changes.' },
      { verdict: 'Data', test: 'It only fails for specific records (a NULL, a deleted reference, an unusual value) and works for others with the same setup.' },
      { verdict: 'Code defect', test: 'With valid configuration and valid data, the code does not do what the requirement says, or it fails on input it should handle.' },
      { verdict: 'Environment', test: 'The same build and configuration behave differently between environments, servers or browsers.' }
    ],
    symptoms: [
      {
        id: 'missing', title: 'An option, link, menu item or field does not appear',
        causes: [
          { cause: 'The role or security profile lacks the right', check: 'Compare the user’s rights with a user who can see it; find the right checked in the page code.' },
          { cause: 'A customer setting is off or incomplete', check: 'Find the condition that renders it and read every setting it depends on for that customer.' },
          { cause: 'Only some of the required settings exist', check: 'Conditions are often an AND of several values; one empty value hides the option.' },
          { cause: 'Values cached in the session at login', check: 'Log out and back in after changing settings, then retest.' },
          { cause: 'The module, license or feature flag is disabled', check: 'Look for module or flag checks around the render condition.' },
          { cause: 'No data meets the display condition', check: 'Some options only show when related records exist; confirm with a read-only query.' },
          { cause: 'Configuration not migrated between environments', check: 'Compare the settings in the environment where it works.' },
          { cause: 'A wrong operator or inverted condition in code', check: 'Read the condition literally and test it against the actual values.' }
        ],
        prompts: ['missing-option', 'role-access', 'feature-switches', 'customer-difference']
      },
      {
        id: 'disabled', title: 'A button or field is disabled, read-only or does nothing',
        causes: [
          { cause: 'Record status locks it (signed, approved, billed, closed)', check: 'Find the status checks that set the control to read-only.' },
          { cause: 'The user is not the owner or supervisor of the record', check: 'Look for ownership or supervisor comparisons in the code.' },
          { cause: 'A front-end script disables it or fails before enabling it', check: 'Check the browser console for script errors.' },
          { cause: 'A prerequisite field is empty', check: 'Find the client-side validation tied to the control.' }
        ],
        prompts: ['disabled-control', 'role-access']
      },
      {
        id: 'error', title: 'An error message appears on save or load',
        causes: [
          { cause: 'Blank or NULL values concatenated into SQL', check: 'Look for string-built SQL calls without a NULL helper around each parameter.' },
          { cause: 'A value too long or of the wrong type for the column', check: 'Compare the input with the column definition and the procedure parameter types.' },
          { cause: 'A missing or deleted reference record', check: 'Query the foreign keys of the failing record.' },
          { cause: 'A configuration loop touches every record, not only the one saved', check: 'Check whether the save iterates through all configurations and one of them is malformed.' },
          { cause: 'Timeouts, locks or deadlocks', check: 'Correlate the time of the error with database blocking or long-running jobs.' },
          { cause: 'A recent deployment changed the code path', check: 'Compare with the last release that touched the file.' }
        ],
        prompts: ['error-in-code', 'error-decoder', 'legacy-trace', 'sql-diagnostic']
      },
      {
        id: 'validation', title: 'A validation message blocks the user',
        causes: [
          { cause: 'A configurable rule is turned on for the customer', check: 'Find the rule in the code and the setting that enables it.' },
          { cause: 'The rule checks a field the user cannot see', check: 'List every field the rule reads.' },
          { cause: 'The date or time comparison uses a different time zone', check: 'Check how both sides of the comparison are converted.' }
        ],
        prompts: ['validation-rule', 'config-or-defect']
      },
      {
        id: 'customer', title: 'It works for one customer and not another',
        causes: [
          { cause: 'Different customer settings', check: 'Compare every setting read by the code path, side by side.' },
          { cause: 'Different reference data (service types, payers, forms)', check: 'Compare the related lookup records.' },
          { cause: 'Custom forms or templates', check: 'Check whether the customer uses a custom version of the form.' },
          { cause: 'Data volume or old records', check: 'Look for records created before a feature existed.' }
        ],
        prompts: ['customer-difference', 'config-or-defect', 'feature-switches']
      },
      {
        id: 'save', title: 'A value does not save or changes back',
        causes: [
          { cause: 'The field is not mapped to the save procedure', check: 'Trace the field from the form to the procedure parameter.' },
          { cause: 'A trigger, job or later save overwrites it', check: 'Search for other writers of the same column.' },
          { cause: 'A silent validation or caught exception', check: 'Look for empty catch blocks or error handling that hides the failure.' },
          { cause: 'Two people edited the same record', check: 'Check for last-write-wins behavior.' }
        ],
        prompts: ['save-path', 'data-lineage']
      },
      {
        id: 'report', title: 'A report or export shows wrong or missing data',
        causes: [
          { cause: 'Filters or date boundaries exclude records', check: 'Check inclusive and exclusive date comparisons and time zones.' },
          { cause: 'Joins duplicate or drop rows', check: 'Count rows before and after each join.' },
          { cause: 'Rows with NULL values are filtered out', check: 'Look for conditions that silently exclude NULLs.' },
          { cause: 'Results are scoped by the user’s permissions', check: 'Run it as another role.' },
          { cause: 'Reporting data is refreshed on a schedule', check: 'Check when the reporting copy was last refreshed.' }
        ],
        prompts: ['wrong-data-report', 'data-lineage', 'sql-diagnostic']
      },
      {
        id: 'integration', title: 'An interface, file transfer or scheduled job fails',
        causes: [
          { cause: 'Credentials, host or certificate expired or not configured', check: 'Read the connection settings the job uses for that customer.' },
          { cause: 'The job is disabled or not scheduled', check: 'Check the scheduler and the last successful run.' },
          { cause: 'The file or message format changed', check: 'Compare a failing payload with a working one.' },
          { cause: 'The partner rejected the data', check: 'Read the acknowledgement or rejection file.' },
          { cause: 'Network or firewall changes', check: 'Test the connection from the server that runs the job.' }
        ],
        prompts: ['integration-failure', 'scheduled-job']
      },
      {
        id: 'slow', title: 'A page is slow or times out',
        causes: [
          { cause: 'A missing index or a query that scans', check: 'Capture the slow query and its execution plan.' },
          { cause: 'Queries inside loops', check: 'Count database calls per page load.' },
          { cause: 'Large result sets without paging', check: 'Check how many rows the page loads.' },
          { cause: 'Blocking from jobs or other users', check: 'Check for locks at the time it was slow.' }
        ],
        prompts: ['slow-page']
      },
      {
        id: 'regression', title: 'It broke after a release',
        causes: [
          { cause: 'A code change in the path', check: 'List commits and pull requests that touched the files involved.' },
          { cause: 'A database script did not run or ran in the wrong order', check: 'Compare object definitions with the release scripts.' },
          { cause: 'A setting default changed', check: 'Compare configuration before and after the release.' }
        ],
        prompts: ['regression-trace', 'impact-analysis']
      },
      {
        id: 'dates', title: 'Dates or times are wrong',
        causes: [
          { cause: 'Server, database and user time zones differ', check: 'Trace each conversion from input to storage to display.' },
          { cause: 'Daylight saving changes', check: 'Test dates on both sides of the change.' },
          { cause: 'Date-only values stored as midnight datetimes', check: 'Look for conversions that shift the day.' },
          { cause: 'Locale formats (month and day swapped)', check: 'Check parsing of user input.' }
        ],
        prompts: ['dates-times']
      }
    ]
  },

  prompts: [
    /* ---------------- Ticket review & triage ---------------- */
    {
      id: 'ticket-review',
      title: 'Ticket deep review',
      category: 'triage', stage: 'intake', ticket: 'required', featured: true,
      tags: ['bug', 'readiness', 'first read'],
      description: 'Turn a work item into a structured review: what is proven, what is missing and whether it is ready to work.',
      template: `Act as a senior sustainment engineer doing a first-pass review before anyone starts working on this ticket.

Give me:
1. Summary: the problem in two sentences, in plain language.
2. Facts vs. assumptions: what the ticket proves (evidence, screenshots, logs) versus what is only claimed.
3. Missing information: anything needed to reproduce or fix it (environment, customer configuration, user role, data, dates, frequency).
4. Reproduction quality: are the steps complete and deterministic? Rewrite them if they are not.
5. Affected area: module, screen, form, service type or workflow involved.
6. First guess at the type of problem: configuration, permissions, data, code defect or environment, with the reason.
7. Open questions for the reporter, the support case owner and the dev team, grouped separately.
8. Readiness verdict: Ready to work / Needs info / Needs product decision, with one sentence of justification.

Flag contradictions between the description, comments and attachments. Do not guess missing details; mark them as unknown.

Additional context: {{EXTRA_CONTEXT}}`
    },
    {
      id: 'severity-priority',
      title: 'Severity and priority check',
      category: 'triage', stage: 'triage', ticket: 'required',
      tags: ['severity', 'priority', 'impact'],
      description: 'Rate the ticket across clinical, billing, compliance and breadth dimensions and confirm whether its severity and priority are right.',
      template: `Assess whether the current severity and priority of this work item are right.

Rate each dimension Low / Medium / High with a one-line reason:
- Clinical or patient-safety impact (documentation integrity, signatures, medication, care delivery)
- Billing and revenue impact (claims, authorizations, payer rules)
- Compliance and regulatory impact (HIPAA, state reporting, audit trails)
- Breadth: number of customers, users or records affected
- Workaround: does one exist, and how painful is it?
- Frequency: always, intermittent, or edge case

Then:
1. Recommend severity and priority, and say whether they match the current values.
2. Name the single strongest factor behind your recommendation.
3. List the new information that would raise or lower the rating.

If the ticket lacks data for a dimension, write "insufficient information" instead of inferring.`
    },
    {
      id: 'repro-plan',
      title: 'Reproduction plan',
      category: 'triage', stage: 'triage', ticket: 'required',
      tags: ['reproduce', 'test data', 'environment'],
      description: 'Exact preconditions, synthetic test data and numbered steps to reproduce the issue, plus variations to try if it does not reproduce.',
      template: `Create a reproduction plan for this work item in the {{ENVIRONMENT}} environment.

Include:
1. Preconditions: customer configuration, feature flags, user role and permissions, reference data that must exist.
2. Test data: the minimum records needed, using synthetic data only.
3. Numbered steps: exact navigation paths, field values and buttons.
4. Expected vs. actual result at each checkpoint.
5. Variations to try if the first attempt does not reproduce (different role, service type, browser, date, data state, a fresh login).
6. Evidence to capture: screenshots, SQL Profiler trace, browser console, server logs.

If the issue seems to depend on data or configuration (for example a NULL or a missing setting), read the code to find the condition and include a read-only query to find records in that state.`
    },
    {
      id: 'duplicate-check',
      title: 'Duplicate and related issues check',
      category: 'triage', stage: 'intake', ticket: 'required',
      tags: ['duplicate', 'search', 'pattern'],
      description: 'Extract distinctive search terms and find out whether this is a duplicate or part of a larger pattern before investing time.',
      template: `Before we invest time in this work item, help me check whether it is a duplicate or part of a larger pattern.

1. Extract the 8 to 10 most distinctive search terms (error codes, file names, form names, stored procedures, customer codes).
2. Suggest Azure DevOps search queries using those terms, including title and "contains" variations.
3. List other features or forms likely to share the same code path, where a similar bug may already have been reported.
4. Describe the signals that would confirm a duplicate versus a new issue with the same symptom.

If you can see related or linked work items, list them with one line on how each relates.`
    },
    {
      id: 'explain-ticket',
      title: 'Explain this ticket to someone new',
      category: 'triage', stage: 'intake', ticket: 'required',
      tags: ['onboarding', 'context', 'glossary'],
      description: 'Business and clinical context for engineers who are new to the module: the workflow, the terms and where to start looking in the code.',
      template: `Explain this work item to an engineer who is new to this area of {{PLATFORM}}.

1. What this part of the product does and who uses it, in clinical or business terms.
2. The normal workflow, step by step, as it should work.
3. What goes wrong and why it matters to the user.
4. Terms and acronyms in the ticket, explained.
5. Where in the codebase and database a new engineer should start looking: search the repository and list the main files, procedures and tables, with paths.`
    },

    /* ---------------- Missing options & access ---------------- */
    {
      id: 'missing-option',
      title: 'Why an option does not appear',
      category: 'visibility', stage: 'analyze', ticket: 'optional', featured: true,
      tags: ['menu', 'link', 'hidden', 'permissions', 'configuration'],
      description: 'Find the code that decides whether a menu item, link, tab or field is shown, every condition behind it, and how to make it appear.',
      template: `On {{SCREEN}}, users do not see: {{MISSING_ITEM}}.
User role: {{USER_ROLE}}
Customer: {{CUSTOMER}}

{{CODE_EVIDENCE}}

Platform notes: {{PLATFORM_NOTES}}

Work through it layer by layer:
1. Markup: find where {{MISSING_ITEM}} is rendered on {{SCREEN}} and the condition that wraps it.
2. Logic: follow that condition to the code that sets it (code-behind, include files, helper methods) and show every branch that turns it off.
3. Sources: trace each value the condition reads to where it comes from: role or security rights, customer settings tables, feature flags or modules, session values loaded at login, or data that must exist.
4. Database: name the tables, columns and keys involved, and give read-only SQL to check the values for this customer.

Then give me:
- A table: # | Cause | How to verify (query or check) | Likely for this case?
- The configuration path an admin follows to make it appear, including whether a logout and login is needed.
- A short flow summary (text diagram) from the screen to the stored values.
- Verdict: configuration, permissions, data or code defect, and the evidence for it.`
    },
    {
      id: 'disabled-control',
      title: 'Why a button or field is disabled',
      category: 'visibility', stage: 'analyze', ticket: 'optional',
      tags: ['read-only', 'disabled', 'button', 'locked'],
      description: 'Trace what makes a control read-only, disabled or unresponsive: record status, ownership, rights, scripts or prerequisites.',
      template: `On {{SCREEN}}, the control "{{CONTROL}}" is disabled, read-only or does nothing when clicked.
User role: {{USER_ROLE}}
Customer: {{CUSTOMER}}

{{CODE_EVIDENCE}}

Platform notes: {{PLATFORM_NOTES}}

1. Find where the control is rendered and every place that disables it or hides its action, server side and in JavaScript.
2. For each condition, explain what triggers it: record status (signed, approved, billed, closed), ownership or supervisor checks, role rights, customer settings, required fields left empty, or a script error.
3. Give read-only SQL to check the record status and settings involved.
4. Tell me what to check in the browser (console errors, network calls) if the server-side conditions look fine.
5. Verdict: expected behavior, configuration, permissions, data or code defect, with evidence.`
    },
    {
      id: 'role-access',
      title: 'Role and permission trace',
      category: 'visibility', stage: 'analyze', ticket: 'optional',
      tags: ['security', 'roles', 'rights', 'access denied'],
      description: 'Why a role can or cannot do something: the rights checked in code, where they are granted and how to compare two users.',
      template: `Users with the role or profile "{{USER_ROLE}}" cannot do this: {{ACTION}}.
Screen: {{SCREEN}}
Customer: {{CUSTOMER}}

{{CODE_EVIDENCE}}

Platform notes: {{PLATFORM_NOTES}}

1. Find every permission, right or role check on this path (page load, button, save, API or procedure). Quote each check.
2. For each one, say where the right is granted (security profile, role table, customer setting) and its default.
3. Explain whether the checks are consistent: for example, is the option shown but the save blocked, or the reverse?
4. Give read-only SQL to list the rights of a user who fails and one who succeeds, so they can be compared.
5. Say whether the behavior is by design (and where that is documented in code) or a defect.
6. If any check could expose data to the wrong role, flag it as a compliance risk.`
    },

    /* ---------------- Diagnosis & root cause ---------------- */
    {
      id: 'rca',
      title: 'Root cause analysis',
      category: 'rootcause', stage: 'analyze', ticket: 'required', featured: true,
      tags: ['5 whys', 'root cause', 'evidence'],
      description: 'Symptom, trigger, 5 Whys and a one-sentence root cause, backed by the code and evidence for each step, with a confidence level.',
      template: `Perform a root cause analysis for this work item. Read the code involved; do not stop at the ticket text.

1. Symptom: what the user experiences, and exactly where it happens.
2. Trigger: the specific condition (input, data state, configuration, timing) that causes it.
3. 5 Whys: walk from symptom to underlying cause, one line per "why".
4. Root cause statement, in one sentence: "The defect occurs because ... when ...".
5. Code evidence: the files, lines and procedures involved, quoted.
6. Contributing factors, grouped by Code, Data, Configuration, Process and Environment.
7. Why now: was this introduced by a recent change, or is it a latent defect exposed by new data?
8. Confidence: High / Medium / Low, and the single check that would confirm it.

If an investigation is already documented in the ticket, validate it against the code instead of repeating it: point out gaps or alternative explanations.`
    },
    {
      id: 'impact-analysis',
      title: 'Impact and blast radius',
      category: 'rootcause', stage: 'analyze', ticket: 'required',
      tags: ['impact', 'data', 'customers'],
      description: 'Who and what else is affected: shared code paths, data saved incorrectly, other customers and downstream systems.',
      template: `Analyze the blast radius of the defect in this work item. Search the codebase for every caller of the code involved.

Cover:
1. Users and roles affected, and in which workflows.
2. Other screens, forms, service types, reports, interfaces or batch jobs that use the same code path or data.
3. Data impact: could records have been saved incorrectly, partially or not at all? Since when?
4. Customer impact: only the reporting customer, or any customer with a similar configuration?
5. Downstream effects: billing, clinical documentation, state reporting, integrations, exports.
6. Read-only checks to size the impact (for example "count configurations where X is NULL").

Finish with a short impact statement I can paste into the ticket.`
    },
    {
      id: 'hypothesis-matrix',
      title: 'Hypothesis matrix',
      category: 'rootcause', stage: 'analyze', ticket: 'required',
      tags: ['unknown cause', 'investigation', 'prioritize'],
      description: 'When the cause is unclear: competing hypotheses, evidence for and against, and the cheapest test to rule each one out.',
      template: `We do not know the root cause of this work item yet. Build a hypothesis matrix.

For 4 to 6 plausible hypotheses (include configuration, permissions, data, session or cache, code and environment where they apply), give a table:
| Hypothesis | Evidence for | Evidence against | Fastest test to confirm or rule out | Effort (S/M/L) |

Use the code to sharpen each hypothesis where you can. Then recommend the order to test them, cheapest and most discriminating first, and say which result would eliminate each one.

What we have already tried: {{ALREADY_TRIED}}`
    },
    {
      id: 'regression-trace',
      title: 'It worked before: find the change',
      category: 'rootcause', stage: 'analyze', ticket: 'optional',
      tags: ['regression', 'release', 'commits', 'pull requests'],
      description: 'Find the commits, pull requests, scripts or setting changes that touched the failing path since it last worked.',
      template: `This used to work and now it does not.
What fails: {{SYMPTOM}}
When it last worked: {{WORKED_UNTIL}}

{{CODE_EVIDENCE}}

1. Identify the files, procedures and settings on the failing path.
2. List the commits and pull requests that changed them in the relevant period, newest first, with author, date and a one-line summary of each change.
3. For each change, say whether it could cause this symptom and why.
4. Check for database scripts or setting defaults that changed in the same period.
5. Name the most likely change and how to confirm it (revert test, comparing behavior on the previous build).`
    },

    /* ---------------- Errors & debugging ---------------- */
    {
      id: 'error-in-code',
      title: 'Trace an error message to the code',
      category: 'debug', stage: 'analyze', ticket: 'optional', featured: true,
      tags: ['error message', 'exception', 'code search'],
      description: 'Find where an on-screen message or exception is raised, the conditions that trigger it and how to confirm which one fired.',
      template: `Users see this message on {{SCREEN}}:
{{ERROR_TEXT}}

Where it appears: {{FILE_PATH}}

{{CODE_EVIDENCE}}

Platform notes: {{PLATFORM_NOTES}}

1. Search the codebase for the exact text and for distinctive fragments of it. If the text is built dynamically or comes from a resource or database table, find where it is assembled.
2. If it is a generic or driver error, find the code that ran just before it (for example the line in the file named above) and the call that failed.
3. List every condition that leads to the message, with the file and lines.
4. Explain which inputs, settings or data states trigger each condition, and give a read-only query or check to see which one applies here.
5. Say whether the message is expected validation, a configuration problem, a data problem or a defect, and propose the fix if it is a defect.`
    },
    {
      id: 'error-decoder',
      title: 'Error message decoder',
      category: 'debug', stage: 'analyze', ticket: 'optional',
      tags: ['error', 'stack trace', 'causes'],
      description: 'Paste an error and get what it means, the most likely causes ranked, and a quick check for each one.',
      template: `Help me decode this error from {{PLATFORM}} ({{TECH_STACK}}).

Error:
{{ERROR_TEXT}}

Where it appears: {{FILE_PATH}}

1. Explain in plain words what the error means at the technology level (driver, provider, runtime).
2. List the most likely causes, ranked, with the reasoning for each.
3. For each cause, give a quick check to confirm or rule it out.
4. Describe the kind of code or data that usually produces this error (for example string-concatenated SQL, NULL values, type mismatch, missing object).
5. If the file is in the repository, read it and point to the most likely line.
6. Suggest the extra logging or tracing that would pinpoint it.

Be specific to the technology named; avoid generic advice.`
    },
    {
      id: 'debug-plan',
      title: 'Step-by-step debug plan',
      category: 'debug', stage: 'analyze', ticket: 'required',
      tags: ['breakpoints', 'tracing', 'isolation'],
      description: 'Entry point, call chain, breakpoints, SQL tracing and narrowing steps, with clear exit criteria.',
      template: `Create a step-by-step debugging plan for this work item. Technology involved: {{TECH_STACK}}.

1. Where to start: find the entry point (page, endpoint, job) in the code and list the call chain down to the database.
2. Breakpoints or log statements to add, with the exact variables to inspect at each one.
3. Database tracing: which statements to capture (SQL Profiler or Extended Events) and what a good call looks like compared with a bad one.
4. Data to prepare so the failing path is exercised.
5. How to isolate the failure: narrowing steps that halve the search space each time.
6. Exit criteria: how we know we found the defect and not just a symptom.

Keep each step short and actionable. Remind me to remove temporary logging and not to log PHI.`
    },
    {
      id: 'legacy-trace',
      title: 'Legacy ASP code path trace',
      category: 'debug', stage: 'analyze', ticket: 'optional',
      tags: ['classic asp', 'vbscript', 'null handling'],
      description: 'Walk through a legacy file, trace every value that reaches a SQL call and find where blanks or NULLs break it.',
      template: `Trace this legacy code path in {{PLATFORM}}.

File: {{CODE_FILE}}
Code: {{CODE_OPTIONAL}}

1. Explain what the code does, block by block, in plain language.
2. Trace every variable that ends up in a SQL statement, a redirect or an output: where it comes from and whether it can be empty, NULL or unexpected.
3. Identify where blank or NULL values are not handled, and show the malformed statement that would result.
4. Point out existing helper functions (for example NULL-conversion or escaping helpers) that should be applied but are not.
5. Flag security concerns: string-concatenated SQL, unescaped output, missing authorization checks.
6. Propose the minimal, safe change as a diff and explain why it is enough.`
    },
    {
      id: 'validation-rule',
      title: 'A validation message blocks saving',
      category: 'debug', stage: 'analyze', ticket: 'optional',
      tags: ['validation', 'rule', 'save blocked'],
      description: 'Find the validation rule behind a blocking message, every field it reads and the setting that turns it on.',
      template: `When saving on {{SCREEN}}, users are blocked by this message:
{{ERROR_TEXT}}

Customer: {{CUSTOMER}}

{{CODE_EVIDENCE}}

Platform notes: {{PLATFORM_NOTES}}

1. Find the validation that produces the message, client side and server side.
2. List every field, setting and record the rule reads, and the exact comparison it makes (including dates and time zones).
3. Say whether the rule is always on or enabled by a customer setting, and where that setting is managed.
4. Give the conditions a user must meet to pass the rule, in plain language for Support.
5. Verdict: working as designed, configuration, data or code defect, with evidence.`
    },
    {
      id: 'save-path',
      title: 'Value does not save or changes back',
      category: 'debug', stage: 'analyze', ticket: 'optional',
      tags: ['save', 'persistence', 'overwrite'],
      description: 'Trace a field from the form to the database and find where it is dropped, rejected or later overwritten.',
      template: `On {{SCREEN}}, the value "{{FIELD_NAME}}" does not save, or saves and later changes back.

Expected: {{EXPECTED}}
Actual: {{ACTUAL}}

{{CODE_EVIDENCE}}

1. Trace the field from the form input to the request, to the code that builds the save call, to the procedure or statement, to the column.
2. At each step, show how the value is read and transformed, and where it could be lost (wrong field name, missing parameter, type conversion, NULL handling).
3. Search for every other writer of the same column (triggers, jobs, other screens, integrations) that could overwrite it later.
4. Look for error handling that hides a failure (empty catch blocks, ignored return values).
5. Give read-only SQL to see the stored value and, if available, its audit history.
6. Name the most likely cause and the fix.`
    },
    {
      id: 'integration-failure',
      title: 'Interface or integration failure',
      category: 'debug', stage: 'analyze', ticket: 'optional',
      tags: ['hl7', '837', 'clearinghouse', 'ftp', 'erx', 'api'],
      description: 'Trace an interface end to end: configuration, credentials, payload building, transfer, partner response and logs.',
      template: `The integration "{{INTEGRATION}}" is failing.
What happens: {{SYMPTOM}}
Customer: {{CUSTOMER}}

{{CODE_EVIDENCE}}

Platform notes: {{PLATFORM_NOTES}}

1. Find the code that runs this integration: entry point, how it is triggered (user action, schedule, queue) and the main classes or procedures.
2. List every setting it reads (endpoints, hosts, credentials, folders, partner IDs, certificates) and where each is stored. Do not reveal secret values; only say whether they are present.
3. Describe how the payload or file is built and the fields most likely to break it.
4. Explain how errors and partner responses (acknowledgements, rejections) are logged, and where to find them.
5. Give a ranked list of likely causes for this symptom with a check for each: missing or expired configuration, disabled job, format change, partner rejection, network.
6. Give read-only SQL to inspect the configuration and the latest runs for this customer.`
    },
    {
      id: 'scheduled-job',
      title: 'Scheduled job did not run or produced nothing',
      category: 'debug', stage: 'analyze', ticket: 'optional',
      tags: ['batch', 'scheduler', 'job'],
      description: 'Find how a background job is scheduled, what it selects, why it may skip records and where it logs.',
      template: `The job or process "{{JOB_NAME}}" did not run, failed, or ran without producing the expected result.
What we see: {{SYMPTOM}}

{{CODE_EVIDENCE}}

1. Find how the job is scheduled and started (scheduler, SQL Agent, service, timer) and the settings that enable it per customer.
2. Describe the selection criteria: which records it picks, and conditions that would make it pick none.
3. Find where it records runs, errors and counts, and the query to read the latest runs.
4. List the likely causes for this symptom with a check for each.
5. Say how to safely re-run it for one customer, if that is possible.`
    },
    {
      id: 'slow-page',
      title: 'Slow page or timeout',
      category: 'debug', stage: 'analyze', ticket: 'optional',
      tags: ['performance', 'timeout', 'query plan'],
      description: 'Find the expensive queries and loops behind a slow page and the safest improvements for a sustainment release.',
      template: `{{SCREEN}} is slow or times out.
What we see: {{SYMPTOM}}

{{CODE_EVIDENCE}}

1. List every database call made while the page loads or saves, in order, and flag calls inside loops.
2. For the heaviest queries or procedures, point out non-SARGable filters, missing indexes, large result sets without paging and parameter-sniffing risks.
3. Note external calls or file operations on the same request.
4. Tell me what to capture to confirm (execution plans, timings, blocking at that moment).
5. Propose improvements ranked by impact and risk, marking which are safe for a sustainment release.`
    },
    {
      id: 'dates-times',
      title: 'Wrong dates or times',
      category: 'debug', stage: 'analyze', ticket: 'optional',
      tags: ['timezone', 'daylight saving', 'dates'],
      description: 'Trace how a date is entered, converted, stored and displayed to find where it shifts.',
      template: `Dates or times are wrong on {{SCREEN}}.
What the user sees: {{SYMPTOM}}
Customer: {{CUSTOMER}}

{{CODE_EVIDENCE}}

1. Trace the value from input (or source system) to storage to display, listing every conversion: time zone, date-only vs. datetime, string formats.
2. Identify which time zone each step assumes (server, database, customer setting, user) and where that is configured.
3. Check behavior around daylight saving changes and midnight.
4. Give read-only SQL to see the stored value for an example record.
5. Name the step that introduces the error and the fix.`
    },
    {
      id: 'log-analysis',
      title: 'Log and trace analysis',
      category: 'debug', stage: 'analyze', ticket: 'optional',
      tags: ['logs', 'timeline', 'correlation'],
      description: 'Build a timeline from pasted logs, separate cause from consequence and state what the logs can and cannot prove.',
      template: `Analyze these logs from {{PLATFORM}}.

Logs:
{{LOG_TEXT}}

1. Build a timeline of the relevant events.
2. Highlight errors, warnings and anomalies, and say whether each is a cause or a consequence.
3. Correlate entries by request, session or transaction where possible, and point to the code that wrote the key lines.
4. State what the logs prove, what they suggest, and what they cannot tell us.
5. Recommend additional logging that would close the gap.

Refer to users and patients only by internal IDs. Do not repeat any PHI that appears in the logs.`
    },

    /* ---------------- Configuration vs. defect ---------------- */
    {
      id: 'config-or-defect',
      title: 'Configuration, data or code defect?',
      category: 'config', stage: 'triage', ticket: 'required', featured: true,
      tags: ['classification', 'configuration', 'support'],
      description: 'Decide with evidence whether a ticket is a setup issue Support can fix, a data problem or a real code defect.',
      template: `Decide whether this work item is a configuration issue, a permissions issue, a data problem, an environment difference or a code defect.

{{CODE_EVIDENCE}}

Platform notes: {{PLATFORM_NOTES}}

1. Read the code path behind the reported behavior and state what the code is designed to do.
2. List every setting, role right and data condition that changes the outcome, and where each is managed.
3. Compare the reported behavior with what the code does for those settings. Is the outcome the expected result of the current setup?
4. Give read-only SQL or checks that prove which case applies for this customer.
5. Verdict with confidence (High / Medium / Low):
   - If configuration or permissions: the exact steps Support or the customer admin should follow, and whether a logout and login is needed.
   - If data: which records are affected and how to correct them safely.
   - If code defect: where it is and the proposed fix.
6. A two-sentence summary I can paste into the ticket.`
    },
    {
      id: 'customer-difference',
      title: 'Works for one customer, fails for another',
      category: 'config', stage: 'analyze', ticket: 'optional',
      tags: ['customer', 'compare', 'settings'],
      description: 'Compare every setting and reference record a feature reads for two customers to find the difference that matters.',
      template: `The behavior differs between customers.
Feature or screen: {{SCREEN}}
Fails for: {{CUSTOMER_FAILS}}
Works for: {{CUSTOMER_WORKS}}
What happens: {{SYMPTOM}}

{{CODE_EVIDENCE}}

Platform notes: {{PLATFORM_NOTES}}

1. List every customer setting, role right, reference record (service types, payers, forms, templates) and feature flag this code path reads.
2. Write read-only SQL that returns those values for both customers side by side, flagging differences.
3. Explain which differences can change the outcome and how.
4. Note other differences to check that are not in the database (custom forms, versions, integrations).
5. Conclude whether aligning the configuration would fix it or whether the code mishandles a valid setup.`
    },
    {
      id: 'feature-switches',
      title: 'Map every setting that controls a feature',
      category: 'config', stage: 'design', ticket: 'optional',
      tags: ['settings', 'feature flags', 'support guide'],
      description: 'A reference table of every setting, right and flag that turns a feature on or changes how it behaves.',
      template: `Map every setting that controls the feature "{{FEATURE}}" in {{PLATFORM}}.

{{CODE_EVIDENCE}}

Platform notes: {{PLATFORM_NOTES}}

Produce a table with one row per setting:
| Setting or right | Where it is stored (table, key) | Where an admin changes it | Default | Effect on the feature | Read at login or live? |

Then:
1. Describe the minimum setup needed for the feature to work end to end.
2. List combinations of settings that produce confusing behavior (for example a setting that is on but another required value is empty).
3. Give a read-only query that shows the full configuration of the feature for one customer.
4. Write a short checklist Support can follow before escalating a ticket about this feature.`
    },
    {
      id: 'billing-rule-trace',
      title: 'Why a service was or was not billed',
      category: 'config', stage: 'analyze', ticket: 'optional',
      tags: ['billing', 'claims', 'payer', 'rules'],
      description: 'Trace the billing rules a service passes through to explain a missing, wrong or rejected charge.',
      template: `Explain why a service was billed incorrectly, not billed, or rejected.
What happened: {{SYMPTOM}}
Customer: {{CUSTOMER}}

{{CODE_EVIDENCE}}

Platform notes: {{PLATFORM_NOTES}}

1. Find the code and procedures that decide whether and how a service becomes a billable charge or claim line.
2. List every rule and setting on that path (payer setup, service type, authorization, credentials, modifiers, rates, dates) and what each does.
3. Identify which rule most likely produced this outcome, and the read-only SQL to confirm it for a service ID.
4. Say whether the fix is configuration (and where), data, or code.
5. Flag any revenue or compliance risk and whether other services could be affected.

Refer to services and clients by internal IDs only.`
    },

    /* ---------------- Code exploration ---------------- */
    {
      id: 'feature-walkthrough',
      title: 'Explain how a feature works in code',
      category: 'explore', stage: 'design', ticket: 'optional', featured: true,
      tags: ['walkthrough', 'architecture', 'onboarding'],
      description: 'A guided tour of a feature: screens, files, classes, procedures and tables, and how a request flows through them.',
      template: `Explain how the feature "{{FEATURE}}" works in {{PLATFORM}}.

{{CODE_EVIDENCE}}

Platform notes: {{PLATFORM_NOTES}}

1. Entry points: screens, menus, endpoints or jobs where the feature starts.
2. Flow: what happens on load and on save, step by step, with file paths, classes, methods and procedures.
3. Data: the tables and key columns it reads and writes.
4. Settings and rights that change its behavior.
5. A text diagram of the flow from screen to database.
6. Known fragile spots: legacy code, string-built SQL, missing NULL handling, duplicated logic.`
    },
    {
      id: 'data-lineage',
      title: 'Where does this value come from?',
      category: 'explore', stage: 'analyze', ticket: 'optional',
      tags: ['lineage', 'source', 'calculation'],
      description: 'Trace a value shown on screen or in a report back to its tables, calculations and the code that writes it.',
      template: `On {{SCREEN}}, where does the value "{{FIELD_NAME}}" come from?

{{CODE_EVIDENCE}}

1. Find where it is displayed and the query or method that supplies it.
2. Trace it back to the table and column, including joins, calculations, defaults and formatting.
3. List every place in the code that writes that column (screens, procedures, jobs, integrations).
4. Note conditions under which the value would be empty, stale or different from what the user expects.
5. Give a read-only query that returns the value and its source fields for one record ID.`
    },
    {
      id: 'change-impact-code',
      title: 'Who uses this code? Impact of a change',
      category: 'explore', stage: 'design', ticket: 'optional',
      tags: ['references', 'callers', 'impact'],
      description: 'Find every caller of a function, procedure, table or column before changing it, and what each one expects.',
      template: `Before we change "{{CODE_ELEMENT}}" in {{PLATFORM}}, find everything that depends on it.

Planned change: {{CHANGE_SUMMARY}}

{{CODE_EVIDENCE}}

1. Search the codebase and database objects for every reference: pages, classes, procedures, views, triggers, jobs, reports and integrations.
2. For each reference, say how it uses the element and whether the planned change would break it or change its behavior.
3. Flag dynamic references that a plain search can miss (string-built SQL, reflection, configuration-driven names).
4. Recommend the regression tests needed, grouped by area.`
    },

    /* ---------------- Solution design ---------------- */
    {
      id: 'solution-options',
      title: 'Solution options and trade-offs',
      category: 'solution', stage: 'design', ticket: 'required',
      tags: ['options', 'effort', 'risk'],
      description: 'Two or three distinct fixes compared on effort, risk, data correction and testing, with a recommendation for a sustainment release.',
      template: `Propose solution options for this work item. Base them on the actual code involved.

Give 2 or 3 distinct approaches, for example a minimal targeted fix, a more robust fix and a structural fix. For each:
- What changes (files, procedures, data, configuration), with paths
- Effort estimate (S / M / L) and why
- Regression risk and the areas it touches
- Whether existing records need a data correction
- Testing effort
- Customer-visible impact and whether a release note is needed

Recommend one option for a sustainment release and explain the trade-off. Say explicitly whether a follow-up ticket should be created for a structural fix.`
    },
    {
      id: 'decision-brief',
      title: 'Decision brief',
      category: 'solution', stage: 'design', ticket: 'required',
      tags: ['leadership', 'one page', 'options'],
      description: 'A one-page brief with the decision needed, options, recommendation and the risk of not acting.',
      template: `Write a one-page decision brief about this work item.
Audience: {{AUDIENCE}}

1. Decision needed, in one sentence.
2. Background: what is happening and who is affected (3 to 4 sentences, no code).
3. Options: 2 or 3 options with cost, risk and time to deliver.
4. Recommendation and the main reason for it.
5. Risks of not acting.
6. Next steps and owners, if known.

Keep it under 350 words, in plain language, with no PHI.`
    },
    {
      id: 'implementation-plan',
      title: 'Implementation plan',
      category: 'solution', stage: 'build', ticket: 'required',
      tags: ['plan', 'rollback', 'definition of done'],
      description: 'Turn the agreed fix into files to change, order of work, rollback plan and a definition-of-done checklist.',
      template: `Turn the agreed fix for this work item into an implementation plan.

Agreed approach: {{APPROACH}}

Include:
1. Files, classes, pages and stored procedures to change (find them in the repository), with one sentence on each change.
2. Order of work, including any database script and its deployment order relative to the code.
3. Backward compatibility: what happens to existing data and to customers on older configurations.
4. Unit tests to add or update.
5. Feature flag or configuration needs, if any.
6. Rollback plan.
7. A definition-of-done checklist I can paste into the ticket.`
    },

    /* ---------------- Code review ---------------- */
    {
      id: 'code-review',
      title: 'Code review for a fix',
      category: 'code', stage: 'build', ticket: 'optional',
      tags: ['review', 'blockers', 'quality'],
      description: 'Review a change for correctness, side effects, security, PHI exposure and missing tests, with findings labelled by severity.',
      template: `Review this code change in {{PLATFORM}}. Technology: {{TECH_STACK}}.

Change:
{{DIFF}}

Read the surrounding code in the repository, then review for:
1. Correctness: does it fix the root cause, including NULL, blank and boundary values?
2. Side effects on other callers of the changed code.
3. Security: SQL injection, input validation, output encoding, authorization.
4. Data and PHI: no PHI in logs, errors or messages.
5. Performance: extra queries, loops, locking.
6. Readability and consistency with the surrounding code.
7. Missing tests.

Label each finding Blocker / Should fix / Nit, quote the line it refers to and suggest the corrected code.`
    },
    {
      id: 'security-review',
      title: 'Injection and input handling review',
      category: 'code', stage: 'build', ticket: 'optional',
      tags: ['security', 'sql injection', 'validation'],
      description: 'Find every place a value reaches SQL, a path or HTML output, and check whether it is parameterized, escaped or validated.',
      template: `Do a focused security review of this file in {{PLATFORM}} ({{TECH_STACK}}).

File: {{CODE_FILE}}
Code: {{CODE_OPTIONAL}}

1. Find every place user-controlled or database-sourced values reach a SQL statement, file path, URL or HTML output.
2. For each one, say whether it is safely parameterized, escaped or validated, and describe the kind of input that would break it.
3. Recommend the safest fix that fits this codebase (parameterized commands, existing helpers, allow-lists).
4. Flag anything that could expose PHI or bypass role-based access.

Rank findings by severity. If a finding only causes errors with malformed input and is not exploitable, say so clearly.`
    },

    /* ---------------- Test cases & QA ---------------- */
    {
      id: 'test-cases',
      title: 'Test cases from a ticket',
      category: 'testing', stage: 'validate', ticket: 'required', featured: true,
      tags: ['test cases', 'ado', 'regression'],
      description: 'A ready-to-run test case table covering the fix, positive paths, negative and edge cases, roles and regression.',
      template: `Write test cases for this work item.

Produce a table with: ID | Title | Preconditions | Steps | Test data | Expected result | Type (Positive / Negative / Edge / Regression) | Priority.

Cover:
- The exact scenario from the ticket (fix verification)
- Positive paths for the same feature
- Negative and edge cases: blank, NULL, zero, maximum length, special characters, boundary dates
- Role and permission variations, and the customer settings the code reads
- Regression cases for features that share the code path (check the code for other callers)

Use synthetic test data only. Make the steps concrete enough that another QA analyst can run them without asking questions. After the table, list the 3 test cases to run first if time is short.`
    },
    {
      id: 'edge-cases',
      title: 'Edge case hunter',
      category: 'testing', stage: 'validate', ticket: 'required',
      tags: ['edge cases', 'nulls', 'concurrency'],
      description: 'A skeptical QA lead’s list of the edge cases most likely to break the feature, with how to test each one.',
      template: `Act as a skeptical QA lead. For the feature involved in this work item, list the edge cases most likely to break it. Read the code to find the conditions it actually checks.

Consider:
- Empty, NULL, zero and default values in every input and configuration field
- Very long text, special characters, apostrophes and Unicode
- Dates: time zones, daylight saving, month and year ends, backdated and future entries
- Concurrency: two users editing the same record, double submits, session timeouts
- Permissions: roles with partial access, supervisors, read-only users
- Data volume: many records, the first record ever, deleted or inactive references
- Configuration combinations across customers

For each edge case: why it is risky here, how to test it and the expected behavior. Put the top 5 first.`
    },
    {
      id: 'regression-risk',
      title: 'Regression risk and test scope',
      category: 'testing', stage: 'validate', ticket: 'required',
      tags: ['regression', 'risk', 'scope'],
      description: 'Rate the regression risk of a change and choose what must, should and could be retested.',
      template: `Assess regression risk for the fix on this work item.

Change summary: {{CHANGE_SUMMARY}}

1. Rate overall regression risk (Low / Medium / High) and justify it.
2. Search the code for every feature, form, report or integration that shares the changed code or data, and what could break in each.
3. Recommend a focused regression set: must test, should test and nice to test.
4. Identify customer configurations that deserve specific coverage.
5. Note anything that cannot be tested before release and how to monitor it afterwards.`
    },
    {
      id: 'uat-script',
      title: 'UAT script for non-technical users',
      category: 'testing', stage: 'validate', ticket: 'required',
      tags: ['uat', 'customer', 'plain language'],
      description: 'Plain-language acceptance steps with on-screen names and a "you should see" check after each key step.',
      template: `Write a user acceptance test (UAT) script for the fix in this work item that someone without technical knowledge can follow.
Audience: {{AUDIENCE}}

- Start with a two-sentence explanation of what was fixed.
- Numbered steps using the on-screen names of menus, buttons and fields.
- After each key step, a "You should see..." line.
- A short section on what to do if the result is different, including what to capture (screenshot, time, record ID; never patient names).
- Estimated time to complete.`
    },

    /* ---------------- Use cases & requirements ---------------- */
    {
      id: 'use-cases',
      title: 'Use cases and user stories',
      category: 'requirements', stage: 'design', ticket: 'required',
      tags: ['use cases', 'user stories', 'acceptance criteria'],
      description: 'Actors, main and alternate flows, business rules and user stories with Given / When / Then acceptance criteria.',
      template: `Derive use cases from this work item.

1. Actors, for example clinician, supervisor, front desk, billing specialist, administrator, external system.
2. For each main use case: goal, preconditions, main success flow (numbered), alternate flows, exception flows, postconditions.
3. Business rules the ticket implies, written as testable rules. Where the current code already implements a rule, cite it.
4. User stories in the form "As a ..., I want ..., so that ...", each with acceptance criteria in Given / When / Then.
5. Questions for the product owner where the expected behavior is ambiguous.`
    },
    {
      id: 'prd-gap',
      title: 'PRD gap analysis',
      category: 'requirements', stage: 'design', ticket: 'none',
      tags: ['prd', 'gaps', 'readiness'],
      description: 'Review a PRD for gaps, ambiguities, healthcare-specific risks and testability, and get a readiness verdict.',
      template: `Act as a senior product manager, business analyst, QA lead and solution architect reviewing this PRD for {{PLATFORM}} before development starts.

PRD:
{{PRD_TEXT}}

Identify gaps, ambiguities, contradictions, missing requirements, risks and testability issues across:
1. Functional requirements: business rules, workflows, user journeys, undefined system behavior
2. Non-functional: performance, security, accessibility, audit trail, availability
3. Healthcare-specific: PHI handling, clinical documentation rules, billing and payer rules, state reporting
4. Data: migration, defaults, NULL handling, reporting impact
5. Integrations and dependencies, and existing code or settings the feature must respect (search the codebase)
6. Roles and permissions
7. Error handling and edge cases
8. Acceptance criteria and testability

Output:
- A findings table: # | Area | Finding | Why it matters | Severity (Critical / High / Medium / Low) | Recommendation
- Clarification questions for the product owner, grouped by area
- A readiness verdict: Ready / Ready with clarifications / Not ready

Challenge assumptions. Do not fill gaps with guesses; flag them.`
    },

    /* ---------------- SQL & data ---------------- */
    {
      id: 'sql-diagnostic',
      title: 'Read-only diagnostic queries',
      category: 'sql', stage: 'analyze', ticket: 'optional', featured: true,
      tags: ['sql server', 'select only', 'impact'],
      description: 'SELECT-only queries to find affected records, returning IDs and counts (never PHI), with how to read the results.',
      template: `Write read-only diagnostic SQL (SQL Server) for {{PLATFORM}}.

What I need to find: {{GOAL}}
Relevant tables and columns: {{SCHEMA_NOTES}}

Rules:
- Confirm table and column names in the repository before using them.
- SELECT statements only. No INSERT, UPDATE, DELETE, DDL, or anything that writes to production.
- Return counts first, then a small sample (TOP 50) with IDs only; no patient names, dates of birth, SSNs or other PHI columns.
- Comment each query with what it proves.
- Flag any query that could be heavy on a large production database and how to limit it.

Tell me how to interpret the results: which outcome confirms the hypothesis and which one rules it out.`
    },
    {
      id: 'wrong-data-report',
      title: 'Report or export shows wrong data',
      category: 'sql', stage: 'analyze', ticket: 'optional',
      tags: ['report', 'export', 'missing rows'],
      description: 'Trace a report’s query, filters, joins and permission scoping to find why rows are missing, duplicated or wrong.',
      template: `The report or export "{{REPORT_NAME}}" shows wrong, missing or duplicated data.
Expected: {{EXPECTED}}
Actual: {{ACTUAL}}

{{CODE_EVIDENCE}}

1. Find the report definition and the query or procedure behind it.
2. Walk through its filters, date boundaries (inclusive or exclusive, time zones), joins and grouping, and explain which could drop or duplicate rows.
3. Check whether results are scoped by the user’s role, program or location.
4. Check whether it reads a reporting copy that is refreshed on a schedule.
5. Give read-only SQL that reproduces the report for one example and isolates the missing or extra rows.
6. Name the cause and the fix.`
    },
    {
      id: 'sp-review',
      title: 'Stored procedure review',
      category: 'sql', stage: 'build', ticket: 'optional',
      tags: ['stored procedure', 'performance', 'nulls'],
      description: 'Defects, NULL handling, performance and security in a stored procedure, and how callers might send malformed calls.',
      template: `Review this SQL Server stored procedure from {{PLATFORM}}.

Procedure: {{SQL_OBJECT}}
Code: {{SQL_CODE}}

1. Summarize what it does and its parameters, including which ones accept NULL.
2. Find defects: NULL handling, implicit conversions, data type mismatches, missing error handling, transaction scope.
3. Performance: non-SARGable predicates, scans, parameter sniffing, missing indexes, cursors.
4. Security: dynamic SQL, permissions, injection.
5. Search the codebase for its callers and describe how they pass values, including caller-side assumptions that could produce malformed calls.
6. Suggested improvements, marked "safe for a sustainment release" or "needs a separate change".`
    },
    {
      id: 'data-fix',
      title: 'Safe data correction script',
      category: 'sql', stage: 'build', ticket: 'required',
      tags: ['data fix', 'backup', 'rollback'],
      description: 'Preview, backup table, transaction with row-count checks and a rollback script, ready for review and approval.',
      template: `Draft a safe data correction script (SQL Server) for this work item.

What must be corrected: {{GOAL}}
Relevant tables and columns: {{SCHEMA_NOTES}}

The script must:
1. Start with a read-only preview that shows exactly which rows will change (IDs only, no PHI).
2. Back up the affected rows to a clearly named backup table that includes the work item number.
3. Run the change inside a transaction with row-count verification, rolling back if the counts do not match.
4. Include a rollback script that restores from the backup table.
5. Include before and after verification queries.

Add a header comment with the work item, author, purpose, and a reminder that the script needs review and approval before it runs in production.`
    },
    {
      id: 'duplicate-records',
      title: 'Duplicate or missing records',
      category: 'sql', stage: 'analyze', ticket: 'optional',
      tags: ['duplicates', 'missing', 'concurrency'],
      description: 'Find how records get created twice or not at all: double submits, retries, jobs, missing constraints.',
      template: `Records are duplicated or missing.
What we see: {{SYMPTOM}}
Screen or process: {{SCREEN}}

{{CODE_EVIDENCE}}

1. Find every code path that inserts these records (screens, procedures, jobs, integrations).
2. For each, check protection against double submits, retries and concurrent users, and whether unique constraints exist.
3. For missing records, find conditions that skip the insert or roll it back silently.
4. Give read-only SQL to find duplicates or gaps, returning IDs and counts only.
5. Name the likely cause, the fix, and whether a data correction is needed.`
    },

    /* ---------------- Communication & docs ---------------- */
    {
      id: 'info-request',
      title: 'Request missing information',
      category: 'comms', stage: 'intake', ticket: 'required',
      tags: ['support', 'questions', 'message'],
      description: 'A short, friendly message asking only for what is genuinely missing, and why each item matters.',
      template: `Draft a message asking for the information we still need to move this work item forward.
Recipient: {{AUDIENCE}}

Requirements:
- Open with one sentence restating the issue so they know we understand it.
- Ask only for what is genuinely missing, as a numbered list, most important first.
- For each item, say briefly why it matters.
- Ask for screenshots or record IDs, never patient names or other PHI.
- Close with the next step we will take once we have the answers.
- Tone: professional, friendly and concise. No internal jargon, file names or code.`
    },
    {
      id: 'customer-update',
      title: 'Customer or support update',
      category: 'comms', stage: 'release', ticket: 'required', featured: true,
      tags: ['customer', 'status', 'workaround'],
      description: 'A plain-language update on status, what we found and what happens next, with a workaround or configuration steps if there are any.',
      template: `Write an update about this work item.
Audience: {{AUDIENCE}}
Current status: {{STATUS}}

Guidelines:
- Plain language; no code, file names, stored procedures or internal names.
- Explain what is happening from the user's point of view, what we found (at a high level), what we are doing and when to expect the next update.
- If the fix is a configuration change, give the steps an administrator follows, as short numbered steps, including any logout and login.
- If there is a workaround, give it as short numbered steps.
- Do not mention other customers and do not include any PHI.
- Keep it under 180 words, professional and empathetic without over-apologizing.`
    },
    {
      id: 'release-notes',
      title: 'Release note entry',
      category: 'comms', stage: 'release', ticket: 'required',
      tags: ['release notes', 'support', 'customer'],
      description: 'A customer-facing sentence and an internal note for Support and Implementation, from the same fix.',
      template: `Write a release note entry for the fix in this work item, release {{RELEASE_VERSION}}.

Give two versions:
1. Customer-facing: one or two sentences starting "Resolved an issue where ...". Describe the user-visible behavior, with no internal details.
2. Internal, for Support and Implementation: area, root cause in one line, affected configurations, any action customers or Support must take, and the work item ID.

Do not include customer names or PHI.`
    },
    {
      id: 'handoff-note',
      title: 'Dev to QA handoff note',
      category: 'comms', stage: 'build', ticket: 'required',
      tags: ['handoff', 'qa', 'ado comment'],
      description: 'What changed, where it is deployed, how to verify it and what to regression test, formatted as an ADO comment.',
      template: `Write a handoff note for this work item from development to QA.

Change details: {{CHANGE_SUMMARY}}

Include:
- What was changed and why (root cause in one line)
- Files, pages and stored procedures touched
- Where it is deployed and the build or branch
- How to verify the fix: exact steps and test data
- Areas to regression test
- Known limitations and anything out of scope
- Database scripts or configuration QA must apply first

Format it as a comment I can paste into the Azure DevOps work item.`
    },
    {
      id: 'status-comment',
      title: 'Status comment for the work item',
      category: 'comms', stage: 'build', ticket: 'required',
      tags: ['status', 'ado comment', 'short'],
      description: 'A four-part status comment (status, done, next, blockers) in under 120 words.',
      template: `Write a short status comment for this Azure DevOps work item.

Current status: {{STATUS}}
Details: {{EXTRA_CONTEXT}}

Format:
Status: one line
Done: bullet list
Next: bullet list, with owner if known
Blockers or needs: bullet list, or "None"

Maximum 120 words, factual, no PHI.`
    },
    {
      id: 'kb-article',
      title: 'Knowledge base article',
      category: 'comms', stage: 'learn', ticket: 'required',
      tags: ['knowledge base', 'support', 'reuse'],
      description: 'A symptom-first internal article so the next engineer or support analyst can resolve a similar case quickly.',
      template: `Draft an internal knowledge base article based on this work item so the next engineer or support analyst can resolve a similar issue quickly.

Sections:
1. Title: symptom-based, the way a user would describe it
2. Symptoms, including the exact error text or the missing option
3. Affected versions, modules and configurations
4. Cause, explained plainly (configuration, data or code)
5. Resolution: fix released, configuration steps, workaround, and data correction if applicable
6. How to confirm a case matches this article (including a read-only check if useful)
7. Related work items and search keywords

No customer names and no PHI.`
    },

    /* ---------------- Compliance & risk ---------------- */
    {
      id: 'phi-check',
      title: 'PHI and HIPAA exposure check',
      category: 'compliance', stage: 'triage', ticket: 'required',
      tags: ['phi', 'hipaa', 'privacy'],
      description: 'Engineering triage for privacy risk: exposed or mis-routed PHI, PHI inside the ticket itself and what to escalate.',
      template: `Review this work item for privacy and HIPAA-related risk.

Assess:
1. Does the defect expose, alter, lose or mis-route protected health information? For example wrong-patient display, data in error messages or cross-customer access.
2. Do the ticket's attachments, screenshots, logs or comments contain PHI that should be redacted?
3. Could the defect affect audit trails, signatures or record integrity?
4. Is there a role or permission bypass? Check the access checks in the code involved.

Give a risk level (None / Low / Medium / High) with justification, list what should be escalated to the Privacy or Compliance team, and recommend redaction steps.

This is an engineering triage aid, not a legal determination; the Compliance team makes the final call.`
    },
    {
      id: 'clinical-impact',
      title: 'Clinical and billing impact',
      category: 'compliance', stage: 'triage', ticket: 'required',
      tags: ['clinical', 'billing', 'regulatory'],
      description: 'Rate the effect on clinical documentation, billing, regulatory reporting and staff workload, and who should be informed.',
      template: `Assess the clinical, billing and regulatory impact of this work item.

1. Clinical: does it affect documentation completeness, signatures, service records, treatment plans, medication or alerts clinicians rely on?
2. Billing: could services be billed incorrectly, not billed or rejected? Could it affect authorizations or payer rules?
3. Regulatory and reporting: state reporting, audits, accreditation evidence.
4. Operational: extra manual work for staff and the cost of the workaround.

Rate each area None / Low / Medium / High and explain in one or two sentences. Finish with the stakeholders who should be informed (for example Product, Support, Customer Success, Compliance).`
    },

    /* ---------------- Release & postmortem ---------------- */
    {
      id: 'deploy-checklist',
      title: 'Deployment readiness checklist',
      category: 'release', stage: 'release', ticket: 'required',
      tags: ['deployment', 'checklist', 'rollback'],
      description: 'Code, scripts, configuration, sign-off, communication, monitoring and rollback, as a checklist to paste into the ticket.',
      template: `Create a deployment readiness checklist for the fix in this work item, target release {{RELEASE_VERSION}}.

Cover:
- Code merged, reviewed and linked to the work item
- Database scripts: order, idempotency, rollback, tested on production-like data
- Configuration or feature flags per environment, and whether users must log out and in
- QA sign-off and regression results
- Release note and Support briefing
- Monitoring after release: what to watch, for how long, and by whom
- Rollback trigger and procedure

Present it as a checklist with owners left blank, ready to paste into the ticket.`
    },
    {
      id: 'postmortem',
      title: 'Blameless postmortem',
      category: 'release', stage: 'learn', ticket: 'required',
      tags: ['incident', 'postmortem', 'action items'],
      description: 'Summary, impact, timeline, root cause, detection gaps and owned action items, in a blameless tone.',
      template: `Draft a blameless postmortem for the incident behind this work item.

Timeline notes: {{INCIDENT_TIMELINE}}

Sections:
1. Summary: what happened, impact and duration
2. Impact: customers, users and records affected, and clinical or billing consequences
3. Timeline: detection, escalation, mitigation, resolution
4. Root cause and contributing factors
5. What went well and what went poorly
6. Detection: how it could have been caught earlier
7. Action items: specific, owned and dated, split into prevention, detection and response

Keep a blameless tone: focus on systems and processes, not individuals.`
    }
  ]
};
