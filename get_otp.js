
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function getOtp() {
    try {
        const email = process.argv[2] || 'test_investor@example.com';
        // console.log(`Checking OTP for ${email}...`);

        const res = await pool.query("SELECT email_otp FROM customers WHERE email = $1", [email]);

        if (res.rows.length > 0) {
            console.log(res.rows[0].email_otp);
        } else {
            console.error('User not found');
            process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

getOtp();
