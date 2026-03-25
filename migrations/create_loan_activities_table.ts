
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
        console.log("Creating 'loan_activities' table...");

        await client.query(`
            CREATE TABLE IF NOT EXISTS loan_activities (
                id SERIAL PRIMARY KEY,
                loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES customers(id),
                action_type TEXT NOT NULL,
                description TEXT,
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Add index for performance since it's queried frequently
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_loan_activities_loan_id ON loan_activities(loan_id);
        `);

        await client.query('COMMIT');
        console.log("Migration successful: 'loan_activities' table created.");
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
