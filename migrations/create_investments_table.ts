import 'dotenv/config';
import sql from '../config/db.js';

const runMigration = async () => {
    try {
        console.log("Running migration: create_investments_table...");

        await sql`
            CREATE TABLE IF NOT EXISTS investments (
                id SERIAL PRIMARY KEY,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                investment_type TEXT NOT NULL CHECK (investment_type IN ('NOLT_RISE', 'NOLT_VAULT')),
                
                -- Corporate Details
                company_name TEXT,
                company_address TEXT,
                date_of_incorporation DATE,
                directors_are_pep BOOLEAN DEFAULT FALSE,

                -- Applicant Bio-Data (Representative)
                rep_full_name TEXT,
                rep_phone_number TEXT,
                rep_bvn VARCHAR(11),
                rep_nin VARCHAR(11),
                rep_state_of_origin TEXT,
                rep_state_of_residence TEXT,
                rep_house_number TEXT,
                rep_street_address TEXT,

                -- Investment Data
                investment_amount NUMERIC(15, 2),
                tenure_days INTEGER,
                currency TEXT CHECK (currency IN ('NGN', 'USD')),
                
                -- Status and Metadata
                status TEXT DEFAULT 'pending', -- pending, active, completed, terminated, rejected
                start_date TIMESTAMP,
                maturity_date TIMESTAMP,
                interest_rate NUMERIC(5, 2), -- Annual interest rate percentage
                accrued_interest NUMERIC(15, 2) DEFAULT 0,

                -- Document URLs (Direct references for required docs)
                cac_url TEXT,
                director_1_id_url TEXT,
                director_2_id_url TEXT,
                rep_selfie_url TEXT,
                rep_id_url TEXT, -- Applicant's ID
                memart_url TEXT,
                annual_returns_url TEXT,
                board_resolution_url TEXT,
                aml_cft_url TEXT,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        console.log("Table 'investments' created successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
