import 'dotenv/config';
import pool from './config/db.js';

async function migrate() {
    try {
        console.log("Starting migration: Adding last_selfie_verified_at to customers table...");
        await pool.query(`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS last_selfie_verified_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS is_identity_verified BOOLEAN DEFAULT FALSE;
        `);
        console.log("Migration successful!");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

migrate();
