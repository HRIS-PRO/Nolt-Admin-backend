import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function migrate() {
    try {
        console.log("Starting migration: Adding has_failed_selfie column...");
        await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS has_failed_selfie BOOLEAN DEFAULT FALSE;`);
        console.log("Migration successful: Added has_failed_selfie to customers table.");
        
        // Also check if column exists now
        const res = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='customers' AND column_name='has_failed_selfie';
        `);
        console.log("Verification:", res.rows);
        
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
