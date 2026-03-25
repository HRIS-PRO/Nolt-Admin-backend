import 'dotenv/config';
import pool from '../config/db.js';

const runMigration = async () => {
    const client = await pool.connect();
    try {
        console.log("Running migration: create_yield_rates_table...");

        await client.query(`
            CREATE TABLE IF NOT EXISTS yield_rates (
                id SERIAL PRIMARY KEY,
                plan_name TEXT NOT NULL,
                currency TEXT NOT NULL DEFAULT 'NGN',
                tenure_months INTEGER NOT NULL,
                min_amount NUMERIC(15, 2) NOT NULL,
                max_amount NUMERIC(15, 2), -- NULL means Infinity
                interest_rate NUMERIC(5, 2) NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Table 'yield_rates' created successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    } finally {
        client.release();
    }
};

runMigration();
