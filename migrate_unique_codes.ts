import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('sslmode=disable') || !process.env.DATABASE_URL?.includes('supabase')
        ? false
        : { rejectUnauthorized: false }
});

const generateUniqueCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded O, 0, I, 1
    let result = '';
    for (let i = 0; i < 5; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

async function run() {
    console.log("Starting promotions unique_code migration...");
    try {
        // Step 1: Add the column if it doesn't exist
        await pool.query(`
            ALTER TABLE promotions 
            ADD COLUMN IF NOT EXISTS unique_code VARCHAR(10) UNIQUE;
        `);
        console.log("Added unique_code column constraints to promotions table (or already exists).");

        // Step 2: Backfill any existing promotions that don't have a unique_code
        const noCodeResult = await pool.query('SELECT id FROM promotions WHERE unique_code IS NULL OR unique_code = \'\'');
        let backfilled = 0;
        
        for (const row of noCodeResult.rows) {
            let uniqueCode = generateUniqueCode();
            let isUnique = false;
            let attempts = 0;
            
            while (!isUnique && attempts < 10) {
                try {
                    await pool.query('UPDATE promotions SET unique_code = $1 WHERE id = $2', [uniqueCode, row.id]);
                    isUnique = true;
                    backfilled++;
                } catch (err: any) {
                    if (err.code === '23505') { // Unique violation
                        uniqueCode = generateUniqueCode(); // Retry
                        attempts++;
                    } else {
                        throw err;
                    }
                }
            }
        }
        
        console.log(`Successfully backfilled ${backfilled} existing promotions with a unique_code.`);
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        pool.end();
    }
}

run();
