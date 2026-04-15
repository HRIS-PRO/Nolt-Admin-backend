
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkSchemas() {
  try {
    for (const table of ['customers', 'user_profiles']) {
      const res = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table}'`);
      console.log(`\n${table} Table Columns:`);
      res.rows.forEach(row => {
        console.log(`- ${row.column_name} (${row.data_type})`);
      });
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkSchemas();
