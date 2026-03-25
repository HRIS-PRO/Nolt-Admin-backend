import 'dotenv/config';
import pool from '../config/db.js';

const runMigration = async () => {
    try {
        console.log("Running migration: add_contribution_frequency_and_stage...");

        await pool.query(`
            ALTER TABLE investments 
            ADD COLUMN IF NOT EXISTS contribution_frequency TEXT,
            ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'submitted';
        `);

        console.log("Migration 'add_contribution_frequency_and_stage' completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
