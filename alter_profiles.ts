import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
    try {
        await pool.query(`
            ALTER TABLE user_profiles
            ADD COLUMN IF NOT EXISTS bank_name VARCHAR(255),
            ADD COLUMN IF NOT EXISTS bank_code VARCHAR(50),
            ADD COLUMN IF NOT EXISTS account_number VARCHAR(50),
            ADD COLUMN IF NOT EXISTS account_name VARCHAR(255),
            ADD COLUMN IF NOT EXISTS bank_statement_url TEXT,
            ADD COLUMN IF NOT EXISTS is_corporate_account BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS bank_verified BOOLEAN DEFAULT FALSE;
        `);
        console.log("user_profiles table altered successfully.");
    } catch (e) {
        console.error("Migration failed", e);
    } finally {
        process.exit(0);
    }
}
migrate();
