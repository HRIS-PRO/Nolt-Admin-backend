
import 'dotenv/config';
import pool from '../config/db.js';

const runMigration = async () => {
    try {
        console.log("Running migration: fix_investment_type_check...");

        // 1. Drop old constraint
        await pool.query(`
            ALTER TABLE investments 
            DROP CONSTRAINT IF EXISTS investments_investment_type_check;
        `);

        // 2. Add new constraint with uppercase and Surge support
        await pool.query(`
            ALTER TABLE investments 
            ADD CONSTRAINT investments_investment_type_check 
            CHECK (investment_type IN ('NOLT_RISE', 'NOLT_VAULT', 'NOLT_SURGE'));
        `);

        console.log("Migration 'fix_investment_type_check' completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
