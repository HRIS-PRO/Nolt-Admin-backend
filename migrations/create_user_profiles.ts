
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

        console.log("Creating user_profiles table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_profiles (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id INTEGER NOT NULL UNIQUE,
                first_name TEXT,
                surname TEXT,
                middle_name TEXT,
                phone_number TEXT,
                personal_email TEXT,
                state_of_origin TEXT,
                state_of_residence TEXT,
                address TEXT,
                bvn TEXT,
                nin TEXT,
                date_of_birth DATE,
                is_identity_verified BOOLEAN DEFAULT FALSE,
                verification_ref TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Adding minor beneficiary fields to investments...");
        // Add columns if they don't exist
        await client.query(`
            ALTER TABLE investments 
            ADD COLUMN IF NOT EXISTS is_minor_beneficiary BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS guardian_confirmed BOOLEAN DEFAULT FALSE;
        `);

        await client.query('COMMIT');
        console.log("Migration completed successfully!");
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Migration failed:", err);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
