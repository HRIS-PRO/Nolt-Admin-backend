import pool from '../config/db.js';

async function migrate() {
    const client = await pool.connect();
    try {
        console.log("Starting migration: update_investments_for_corporate");
        
        await client.query(`
            ALTER TABLE investments 
            ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'INDIVIDUAL',
            ADD COLUMN IF NOT EXISTS tin TEXT,
            ADD COLUMN IF NOT EXISTS business_nature TEXT,
            ADD COLUMN IF NOT EXISTS business_address TEXT,
            ADD COLUMN IF NOT EXISTS is_authorized_rep BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS auth_rep_phone TEXT,
            ADD COLUMN IF NOT EXISTS directors JSONB DEFAULT '[]'::jsonb;
        `);

        console.log("Migration completed successfully.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        client.release();
    }
}

migrate();
