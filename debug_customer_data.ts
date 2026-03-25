
import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

const sql = postgres(process.env.DATABASE_URL!);

async function checkCustomerData(id: number) {
    try {
        console.log(`Checking data for customer ${id}...`);

        const customer = await sql`SELECT * FROM customers WHERE id = ${id}`;
        console.log("Customer Record:", customer[0]);

        const loans = await sql`
            SELECT 
                id, customer_id, created_at, 
                mda_tertiary, ippis_number, staff_id, average_monthly_income,
                gender, marital_status, religion, state_of_origin, residential_status,
                bank_name, account_number, account_name, employer
            FROM loans 
            WHERE customer_id = ${id} 
            ORDER BY created_at DESC
        `;

        console.log(`Found ${loans.length} loans.`);
        if (loans.length > 0) {
            console.log("Latest Loan details:", loans[0]);
        }
    } catch (error) {
        console.error("Error checking data:", error);
    } finally {
        process.exit(0);
    }
}

// Using ID 289 from the previous log
const targetId = 289;
checkCustomerData(targetId);
