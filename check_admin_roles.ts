import dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
    try {
        const staffTbl = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_name = 'staff'`);
        if (staffTbl.rows.length === 0) {
            console.log("No staff table found.");
        } else {
             const r1 = await pool.query("SELECT email FROM staff WHERE role IN ('compliance', 'finance')");
             console.log("staff: ", r1.rows);
        }
        
        const r2 = await pool.query("SELECT email, role FROM customers WHERE role IN ('compliance', 'finance')");
        console.log("customers: ", r2.rows);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
