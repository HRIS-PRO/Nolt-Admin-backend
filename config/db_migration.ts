
import postgres from 'postgres';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
}

const sql = postgres(connectionString, {
    ssl: connectionString.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
    connect_timeout: 10,
});

export default sql;
