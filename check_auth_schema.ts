
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

        // Check customers table
        const customersRes = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'customers';
        `);
        console.log("Customers Table Columns:", customersRes.rows.map(r => `${r.column_name} (${r.data_type})`).sort());

        // Check staff table (if exists) or users table
        const staffRes = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'staff';
        `);
        console.log("Staff Table Columns:", staffRes.rows.map(r => `${r.column_name} (${r.data_type})`).sort());

        // Check users table (if exists)
        const usersRes = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users';
        `);
        console.log("Users Table Columns:", usersRes.rows.map(r => `${r.column_name} (${r.data_type})`).sort());

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

checkSchema();
