
import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1, // Use minimal connections for migration
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

const runMigration = async () => {
    try {
        console.log('Adding reset_password_token and reset_password_expires columns to customers table...');

        await pool.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255);');
        await pool.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP;');

        console.log('Columns added successfully.');
    } catch (error) {
        console.error('Error running migration:', error);
    } finally {
        await pool.end();
    }
};

runMigration();
