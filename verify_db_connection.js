import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("DATABASE_URL is missing!");
    process.exit(1);
}

const sql = postgres(connectionString);

async function testConnection() {
    try {
        const res = await sql`SELECT 1 as ok`;
        console.log("Database connection successful:", res);
        await sql.end();
        process.exit(0);
    } catch (err) {
        console.error("Database connection failed:", err);
        process.exit(1);
    }
}

testConnection();
