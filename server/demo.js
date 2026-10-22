'use strict';
/* `npm run demo`: rebuilds storage/demo.db with fictional activity and starts the hub on it. */
process.env.DB_PATH = process.env.DEMO_DB_PATH || 'storage/demo.db';
process.env.DEMO_MODE = '1';
process.env.DATABASE_URL = ''; // the demo always uses a local SQLite file
process.env.POSTGRES_URL = '';
const { seedDemo } = require('./seed-demo');
seedDemo()
  .then(() => require('./server').start())
  .catch((err) => { console.error(err); process.exit(1); });
