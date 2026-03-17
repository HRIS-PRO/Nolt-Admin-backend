import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
}

const pool = new Pool({
    connectionString,
    // Only use SSL if explicitly required by the protocol or environment
    ssl: connectionString.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    // Add socket keep-alive to prevent connection drops
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000
});

// Handle idle connection errors so they don't crash the server
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

export default pool;
