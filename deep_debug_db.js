import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

async function debugConnection() {
    const connectionString = process.env.DATABASE_URL;
    console.log("Starting deep debug of Postgres connection...");
    console.log("Target IP: 3.71.38.119");

    // Test 1: Simple Client with no SSL
    console.log("\n--- Test 1: No SSL ---");
    const client1 = new Client({
        connectionString,
        ssl: false,
        connectionTimeoutMillis: 15000,
    });

    try {
        await client1.connect();
        console.log("Success: Connected without SSL");
        const res = await client1.query('SELECT version()');
        console.log("Version:", res.rows[0].version);
        await client1.end();
    } catch (err) {
        console.log("Failed: No SSL test ->", err.message);
    }

    // Test 2: Client with SSL (rejectUnauthorized: false)
    console.log("\n--- Test 2: SSL (rejectUnauthorized: false) ---");
    const client2 = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
    });

    try {
        await client2.connect();
        console.log("Success: Connected with SSL");
        await client2.end();
    } catch (err) {
        console.log("Failed: SSL test ->", err.message);
    }
}

debugConnection();
