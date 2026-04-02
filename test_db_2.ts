import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
    console.log("Connecting with URL:", process.env.DATABASE_URL?.substring(0, 50) + "...");
    try {
        const res = await pool.query("SELECT 1+1 AS result;");
        console.log("Query success! Result:", res.rows[0].result);
        const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%invest%';");
        console.log("Tables found:", tables.rows);
    } catch(e: any) {
        console.error("DB connection error:", e.message);
    } finally {
        await pool.end();
    }
}
run();
