
import sql from '../config/db.js';

const runMigration = async () => {
    try {
        console.log("Running migration: create_loans_table...");

        await sql`
            CREATE TABLE IF NOT EXISTS loans (
                id SERIAL PRIMARY KEY,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                
                -- Identity
                applying_for_others BOOLEAN DEFAULT FALSE,
                relationship_to_applicant TEXT,
                applicant_full_name TEXT,
                title TEXT,
                is_politically_exposed BOOLEAN DEFAULT FALSE,
                gender TEXT,
                date_of_birth DATE,
                religion TEXT,
                marital_status TEXT,
                mothers_maiden_name TEXT,
                mobile_number TEXT,
                personal_email TEXT,
                bvn VARCHAR(11),
                nin VARCHAR(11),

                -- Financials
                state_of_origin TEXT,
                state_of_residence TEXT,
                primary_home_address TEXT,
                residential_status TEXT,
                number_of_dependents INTEGER DEFAULT 0,
                has_active_loans BOOLEAN DEFAULT FALSE,
                average_monthly_income NUMERIC(15, 2),

                -- Documents (URLs)
                govt_id_url TEXT,
                statement_of_account_url TEXT,
                proof_of_residence_url TEXT,
                selfie_verification_url TEXT,

                -- References (JSONB)
                customer_references JSONB, -- 'references' is a reserved keyword in some contexts, safer to use a specific name or quote it. Using 'customer_references' for clarity.

                -- Loan Details
                requested_loan_amount NUMERIC(15, 2),
                loan_tenure_months INTEGER,
                signature_url TEXT,
                stage TEXT DEFAULT 'customer_experience', -- customer_experience, credit_stage_1, credit_stage_2, internal_control, finance
                mda_tertiary TEXT,
                ippis_number TEXT,
                staff_id TEXT,
                referral_code TEXT,
                eligible_amount NUMERIC(15, 2),

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        console.log("Table 'loans' created successfully.");

        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
