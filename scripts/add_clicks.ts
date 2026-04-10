import "dotenv/config"
import pool from '../config/db.js';

async function run() {
    try {
        await pool.query('ALTER TABLE promotions ADD COLUMN IF NOT EXISTS clicks INT DEFAULT 0;');
        console.log('Added clicks column');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
