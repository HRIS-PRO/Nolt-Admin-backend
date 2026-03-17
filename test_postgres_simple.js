import 'dotenv/config';
import postgres from 'postgres';

async function testPostgresSimple() {
    const url = process.env.DATABASE_URL;
    console.log("Testing with postgres.js package...");

    const sql = postgres(url, {
        connect_timeout: 15,
        idle_timeout: 20,
    });

    try {
        console.log("Attempting query...");
        const result = await sql`SELECT 1 as connected`;
        console.log("SUCCESS:", result);
    } catch (err) {
        console.error("FAILED:");
        console.error("Name:", err.name);
        console.error("Message:", err.message);
        console.error("Code:", err.code);
    } finally {
        await sql.end();
    }
}

testPostgresSimple();
