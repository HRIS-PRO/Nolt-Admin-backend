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
        console.log("Starting migration: Adding selfie_verification_url column to customers...");
        await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS selfie_verification_url TEXT;`);
        console.log("Migration successful: Added selfie_verification_url to customers table.");
        
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
