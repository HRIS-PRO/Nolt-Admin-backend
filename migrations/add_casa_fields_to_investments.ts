import dotenv from 'dotenv';
dotenv.config();

import pool from '../config/db.js';

async function migrate() {
    try {
        console.log("Adding CASA and Finance fields to 'investments' table...");

        await pool.query(`
            ALTER TABLE investments 
            ADD COLUMN IF NOT EXISTS interest_amount NUMERIC(15, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS wht_amount NUMERIC(15, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS casa_account_number VARCHAR(255) DEFAULT NULL;
        `);

        console.log("Migration successful!");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

migrate();
