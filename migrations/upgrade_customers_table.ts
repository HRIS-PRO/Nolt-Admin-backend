import sql from '../config/db.js';

async function upgradeCustomersTable() {
    try {
        await sql`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
            ADD COLUMN IF NOT EXISTS otp_secret VARCHAR(255),
            ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES customers(id),
            ADD COLUMN IF NOT EXISTS team_id VARCHAR(50),
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
        `;
        console.log("Table 'customers' upgraded successfully with staff columns.");
        process.exit(0);
    } catch (error) {
        console.error("Error upgrading table:", error);
        process.exit(1);
    }
}

upgradeCustomersTable();
