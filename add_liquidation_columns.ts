import pool from './config/db.js';

async function migrate() {
    try {
        console.log("Adding liquidation tracking columns to investments...");
        await pool.query(`
            ALTER TABLE investments 
            ADD COLUMN IF NOT EXISTS is_liquidating BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS liquidation_type VARCHAR(20),
            ADD COLUMN IF NOT EXISTS liquidation_requested_amount DECIMAL(15,2),
            ADD COLUMN IF NOT EXISTS liquidation_penalty_amount DECIMAL(15,2),
            ADD COLUMN IF NOT EXISTS liquidation_stage VARCHAR(50);
        `);
        console.log("Success! Columns added.");
        process.exit(0);
    } catch (err) {
        console.error("Migration Failed", err);
        process.exit(1);
    }
}

migrate();
