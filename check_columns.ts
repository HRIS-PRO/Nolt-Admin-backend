
import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

const checkColumns = async () => {
    try {
        const res = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'customers' 
            AND column_name IN ('reset_password_token', 'reset_password_expires');
        `);
        console.log('Found columns:', res.rows.map(r => r.column_name));
    } catch (error) {
        console.error('Error checking columns:', error);
    } finally {
        await pool.end();
    }
};

checkColumns();
