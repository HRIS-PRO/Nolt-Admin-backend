import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('sslmode=disable')
        ? false
        : { rejectUnauthorized: false }
});

async function checkColumns() {
    try {
        const result = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'investments';
        `);
        console.log("Investments columns:", result.rows.map(r => r.column_name).join(', '));
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}
checkColumns();
