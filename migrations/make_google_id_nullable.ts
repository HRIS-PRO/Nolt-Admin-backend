import sql from '../config/db.js';

async function makeGoogleIdNullable() {
    try {
        await sql`
            ALTER TABLE customers 
            ALTER COLUMN google_id DROP NOT NULL;
        `;
        // Also make email NOT unique if we want to allow same email for multiple roles? 
        // No, email should be unique across all users.

        console.log("Table 'customers' altered: google_id is now nullable.");
        process.exit(0);
    } catch (error) {
        console.error("Error altering table:", error);
        process.exit(1);
    }
}

makeGoogleIdNullable();
