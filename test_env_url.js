import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

async function testEnvUrl() {
    const connectionString = process.env.DATABASE_URL;
    console.log("Testing connection specifically with DATABASE_URL from .env...");
    console.log("URL:", connectionString);

    const client = new Client({
        connectionString: connectionString,
        connectionTimeoutMillis: 10000,
    });

    try {
        await client.connect();
        console.log("SUCCESS: Connection established using DATABASE_URL!");
        const res = await client.query('SELECT NOW()');
        console.log("Database Time:", res.rows[0].now);
        await client.end();
    } catch (err) {
        console.error("FAILED to connect with DATABASE_URL:");
        console.error("Error Message:", err.message);
        console.error("Error Stack:", err.stack);

        if (err.message.includes('timeout')) {
            console.log("\nNOTE: This is a timeout. It means the server at 3.71.38.119:5432 is not responding to the connection request within 10 seconds, OR it's dropping the packet.");
        }
    }
}

testEnvUrl();
