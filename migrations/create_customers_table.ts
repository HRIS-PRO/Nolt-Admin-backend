import sql from './config/db.js';

async function createTable() {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                google_id VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                full_name VARCHAR(255),
                avatar_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        console.log("Table 'customers' created successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Error creating table:", error);
        process.exit(1);
    }
}

createTable();
