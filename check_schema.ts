
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
    try {
        console.log('Connecting to DB...');
        const res = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'loans';
        `);
        console.log("Columns:", res.rows.map(r => r.column_name).sort());
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

checkSchema();
