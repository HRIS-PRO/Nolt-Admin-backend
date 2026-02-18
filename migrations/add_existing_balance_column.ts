import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function runMigration() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Add existing_loan_balance
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loans' AND column_name = 'existing_loan_balance') THEN
                    ALTER TABLE loans ADD COLUMN existing_loan_balance NUMERIC(15, 2) DEFAULT 0;
                END IF;
            END
            $$;
        `);

        await client.query('COMMIT');
        console.log('Migration completed successfully: added existing_loan_balance column');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
