
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log("Adding missing columns to 'loans' table (topup_amount, buy_over_amount, casa, etc.)...");

        await client.query(`
            ALTER TABLE loans
            ADD COLUMN IF NOT EXISTS topup_amount NUMERIC(15, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS buy_over_amount NUMERIC(15, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS casa NUMERIC(15, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS buy_over_company_name TEXT,
            ADD COLUMN IF NOT EXISTS buy_over_company_account_name TEXT,
            ADD COLUMN IF NOT EXISTS buy_over_company_account_number TEXT;
        `);

        await client.query('COMMIT');
        console.log("Migration successful: added topup and buy-over columns.");
        process.exit(0);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Migration failed:", err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
