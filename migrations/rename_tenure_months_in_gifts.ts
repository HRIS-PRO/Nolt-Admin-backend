
import 'dotenv/config';
import pool from '../config/db.js';

const runMigration = async () => {
    const client = await pool.connect();
    try {
        console.log("Running migration: rename_tenure_months_to_tenure_days in investment_gifts...");

        await client.query(`
            ALTER TABLE investment_gifts RENAME COLUMN tenure_months TO tenure_days;
        `);

        console.log("Column 'tenure_months' renamed to 'tenure_days' in 'investment_gifts' table.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    } finally {
        client.release();
    }
};

runMigration();
