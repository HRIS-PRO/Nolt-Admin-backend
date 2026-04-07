import pool from './config/db.js';

async function checkSchema() {
    try {
        const res = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'investments'
        `);
        console.log("Columns in 'investments' table:");
        console.log(res.rows.map(r => r.column_name).join(', '));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkSchema();
