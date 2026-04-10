import db from './config/db.js';
db.query('ALTER TABLE promotions ADD COLUMN IF NOT EXISTS clicks INT DEFAULT 0;').then(() => {console.log('done'); process.exit(0)}).catch(console.error);
