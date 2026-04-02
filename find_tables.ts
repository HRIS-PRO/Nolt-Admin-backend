import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function find() {
    const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%invest%';");
    console.log(res.rows);
    process.exit(0);
}
find();
