import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

async function testObjectConfig() {
    console.log("Testing with Object config (eliminating URL parsing issues)...");

    const client = new Client({
        user: 'postgres.noltfinance',
        host: '3.71.38.119',
        database: 'postgres',
        password: 'noltfinance123$',
        port: 5432,
        ssl: false,
        connectionTimeoutMillis: 10000,
    });

    try {
        await client.connect();
        console.log("Success: Connected with Object configuration!");
        const res = await client.query('SELECT NOW()');
        console.log("Time:", res.rows[0]);
        await client.end();
    } catch (err) {
        console.error("Failed with Object configuration:", err);
    }
}

testObjectConfig();
