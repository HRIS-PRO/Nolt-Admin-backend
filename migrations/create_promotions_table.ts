import 'dotenv/config';
import pool from '../config/db.js';

const runMigration = async () => {
    try {
        console.log("Running migration: create_promotions_table...");

        await pool.query(`
            CREATE TABLE IF NOT EXISTS promotions (
                id SERIAL PRIMARY KEY,
                utm_campaign VARCHAR(255) UNIQUE NOT NULL,
                target_product VARCHAR(100) NOT NULL,
                utm_source VARCHAR(255),
                utm_medium VARCHAR(255),
                benefit_value VARCHAR(255),
                expiry_date TIMESTAMP,
                max_redemptions INT,
                current_redemptions INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Table 'promotions' created successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
