import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

async function testMinConfig() {
    console.log("Testing with Minimal Object Config...");
    const client = new Client({
        user: 'postgres.noltfinance',
        host: '3.71.38.119',
        database: 'postgres',
        password: 'noltfinance123$',
        port: 5432,
        ssl: false
    });

    try {
        await client.connect();
        console.log("SUCCESS");
        await client.end();
    } catch (err) {
        console.error("FAILED:", err.message);
    }
}

testMinConfig();
