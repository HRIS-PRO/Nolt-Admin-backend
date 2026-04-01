import pool from './config/db.js';

async function migrate() {
    try {
        console.log("Adding original_investment_id and is_top_up tracking columns to investments...");
        await pool.query(`
            ALTER TABLE investments 
            ADD COLUMN IF NOT EXISTS is_top_up BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS original_investment_id INTEGER;

            -- Add foreign key constraint to link top-ups to original investments
            ALTER TABLE investments
            ADD CONSTRAINT fk_original_investment
            FOREIGN KEY (original_investment_id) 
            REFERENCES investments(id)
            ON DELETE SET NULL;
        `);
        console.log("Success! Top-Up columns and relation added.");
        process.exit(0);
    } catch (err) {
        if (err.code === '42710') {
            console.log("Constraint already exists, skipping...");
            process.exit(0);
        }
        console.error("Migration Failed", err);
        process.exit(1);
    }
}

migrate();
