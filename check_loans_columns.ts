
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkColumns() {
    try {
        const res = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'loans';
        `);
        console.log("Columns in 'loans' table:");
        res.rows.forEach(r => console.log(`- ${r.column_name}`));
        await pool.end();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkColumns();
