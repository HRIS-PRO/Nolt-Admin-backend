import sql from '../config/db.js';

async function addRoleColumn() {
    try {
        await sql`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'customer';
        `;
        console.log("Column 'role' added successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Error adding column:", error);
        process.exit(1);
    }
}

addRoleColumn();
