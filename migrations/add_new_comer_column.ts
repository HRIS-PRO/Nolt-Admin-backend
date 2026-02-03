import sql from './config/db.js';

async function addNewComerColumn() {
    try {
        await sql`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS new_comer BOOLEAN DEFAULT TRUE;
        `;
        console.log("Column 'new_comer' added successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Error adding column:", error);
        process.exit(1);
    }
}

addNewComerColumn();
