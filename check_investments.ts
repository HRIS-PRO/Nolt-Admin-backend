import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
    const res = await pool.query("SELECT * FROM investments LIMIT 1;");
    console.log(res.rows);
    process.exit(0);
}
check();
