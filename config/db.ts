import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
}

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 20, // INCREASED: Allow up to 20 concurrent connections to handle API pressure
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Handle idle connection errors so they don't crash the server
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

export default pool;
