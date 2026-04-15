import dotenv from 'dotenv';
dotenv.config();
import pool from './config/db.js';

async function migrate() {
    try {
        await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS has_failed_selfie BOOLEAN DEFAULT FALSE;`);
        console.log("Migration successful: Added has_failed_selfie to customers table.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
