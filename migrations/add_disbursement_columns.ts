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

        // Add apply_management_fee
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loans' AND column_name = 'apply_management_fee') THEN
                    ALTER TABLE loans ADD COLUMN apply_management_fee BOOLEAN DEFAULT FALSE;
                END IF;
            END
            $$;
        `);

        // Add apply_insurance_fee
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loans' AND column_name = 'apply_insurance_fee') THEN
                    ALTER TABLE loans ADD COLUMN apply_insurance_fee BOOLEAN DEFAULT FALSE;
                END IF;
            END
            $$;
        `);

        // Add disbursement_amount
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loans' AND column_name = 'disbursement_amount') THEN
                    ALTER TABLE loans ADD COLUMN disbursement_amount NUMERIC(15, 2);
                END IF;
            END
            $$;
        `);

        await client.query('COMMIT');
        console.log('Migration completed successfully: added disbursement columns');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
