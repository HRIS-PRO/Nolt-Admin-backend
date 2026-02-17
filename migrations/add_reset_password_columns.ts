import pool from '../config/db.js';

const runMigration = async () => {
    try {
        console.log('Adding reset_password_token and reset_password_expires columns to customers table...');

        await pool.query(`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255),
            ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMP;
        `);

        console.log('Columns added successfully.');
    } catch (error) {
        console.error('Error running migration:', error);
    } finally {
        await pool.end();
    }
};

runMigration();
