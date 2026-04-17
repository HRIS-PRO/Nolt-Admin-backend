import 'dotenv/config';
import pool from '../config/db.js';

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting migration: Add contribution_frequency to yield_rates...');
        
        // Add contribution_frequency column
        await client.query(`
            ALTER TABLE yield_rates 
            ADD COLUMN IF NOT EXISTS contribution_frequency VARCHAR(20) DEFAULT 'monthly';
        `);
        
        console.log('Migration successful: contribution_frequency added.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        client.release();
    }
}

migrate();
