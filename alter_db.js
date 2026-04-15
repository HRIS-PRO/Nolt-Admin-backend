import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('sslmode=disable')
        ? false
        : { rejectUnauthorized: false }
});

async function alterTable() {
    try {
        await pool.query(`
            ALTER TABLE investments 
            ADD COLUMN IF NOT EXISTS promotion_id INTEGER REFERENCES promotions(id) ON DELETE SET NULL;
        `);
        console.log("Added promotion_id to investments");
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}
alterTable();
