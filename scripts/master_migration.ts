import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('sslmode=disable')
        ? false
        : { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 15000,
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('✅ Connected to database. Starting master migration...\n');

        // ─── 1. CUSTOMERS TABLE ───────────────────────────────────────────────
        console.log('▶ Creating customers table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id               SERIAL PRIMARY KEY,
                google_id        VARCHAR(255) UNIQUE,
                email            VARCHAR(255) UNIQUE NOT NULL,
                full_name        VARCHAR(255),
                avatar_url       TEXT,
                -- staff columns
                password_hash    VARCHAR(255),
                otp_secret       VARCHAR(255),
                manager_id       INTEGER REFERENCES customers(id),
                team_id          VARCHAR(50),
                is_active        BOOLEAN DEFAULT TRUE,
                -- auth / profile columns
                role             VARCHAR(50)  DEFAULT 'customer',
                new_comer        BOOLEAN      DEFAULT TRUE,
                referral_code    TEXT         UNIQUE,
                email_otp        VARCHAR(6),
                email_otp_expires_at TIMESTAMP,
                reset_password_token    VARCHAR(255),
                reset_password_expires  TIMESTAMP,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('   ✓ customers');

        // ─── 2. LOANS TABLE ───────────────────────────────────────────────────
        console.log('▶ Creating loans table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS loans (
                id                        SERIAL PRIMARY KEY,
                customer_id               INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

                -- Identity
                applying_for_others       BOOLEAN DEFAULT FALSE,
                relationship_to_applicant TEXT,
                applicant_full_name       TEXT,
                title                     TEXT,
                is_politically_exposed    BOOLEAN DEFAULT FALSE,
                gender                    TEXT,
                date_of_birth             DATE,
                religion                  TEXT,
                marital_status            TEXT,
                mothers_maiden_name       TEXT,
                mobile_number             TEXT,
                personal_email            TEXT,
                bvn                       VARCHAR(11),
                nin                       VARCHAR(11),
                surname                   TEXT,
                first_name                TEXT,
                middle_name               TEXT,

                -- Financials
                state_of_origin           TEXT,
                state_of_residence        TEXT,
                primary_home_address      TEXT,
                residential_status        TEXT,
                number_of_dependents      INTEGER DEFAULT 0,
                has_active_loans          BOOLEAN DEFAULT FALSE,
                average_monthly_income    NUMERIC(15, 2),
                existing_loan_balance     NUMERIC(15, 2) DEFAULT 0,

                -- Documents (URLs)
                govt_id_url               TEXT,
                statement_of_account_url  TEXT,
                proof_of_residence_url    TEXT,
                selfie_verification_url   TEXT,
                work_id_url               TEXT,
                payslip_url               TEXT,

                -- References (JSONB)
                customer_references       JSONB,

                -- Loan Details
                requested_loan_amount     NUMERIC(15, 2),
                loan_tenure_months        INTEGER,
                signatures                TEXT[],
                stage                     TEXT DEFAULT 'sales',
                mda_tertiary              TEXT,
                ippis_number              TEXT,
                staff_id                  TEXT,
                referral_code             TEXT,
                eligible_amount           NUMERIC(15, 2),
                loan_type                 TEXT DEFAULT 'new',
                product_type              VARCHAR(255) DEFAULT 'Public Sector Loan',
                status                    TEXT DEFAULT 'pending',

                -- Bank details
                bank_name                 TEXT,
                account_number            VARCHAR(20),
                account_name              TEXT,

                -- Disbursement
                disb_date                 TIMESTAMP,
                apply_management_fee      BOOLEAN DEFAULT FALSE,
                apply_insurance_fee       BOOLEAN DEFAULT FALSE,
                disbursement_amount       NUMERIC(15, 2),

                -- Relations
                sales_officer_id          INTEGER REFERENCES customers(id),

                created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('   ✓ loans');

        // ─── 3. INVESTMENTS TABLE ─────────────────────────────────────────────
        console.log('▶ Creating investments table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS investments (
                id                      SERIAL PRIMARY KEY,
                customer_id             INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                investment_type         TEXT NOT NULL CHECK (investment_type IN ('NOLT_RISE', 'NOLT_VAULT')),

                -- Corporate Details
                company_name            TEXT,
                company_address         TEXT,
                date_of_incorporation   DATE,
                directors_are_pep       BOOLEAN DEFAULT FALSE,

                -- Rep Bio-Data
                rep_full_name           TEXT,
                rep_phone_number        TEXT,
                rep_bvn                 VARCHAR(11),
                rep_nin                 VARCHAR(11),
                rep_state_of_origin     TEXT,
                rep_state_of_residence  TEXT,
                rep_house_number        TEXT,
                rep_street_address      TEXT,

                -- Investment Data
                investment_amount       NUMERIC(15, 2),
                tenure_days             INTEGER,
                currency                TEXT CHECK (currency IN ('NGN', 'USD')),

                -- Status
                status                  TEXT DEFAULT 'pending',
                start_date              TIMESTAMP,
                maturity_date           TIMESTAMP,
                interest_rate           NUMERIC(5, 2),
                accrued_interest        NUMERIC(15, 2) DEFAULT 0,

                -- Document URLs
                cac_url                 TEXT,
                director_1_id_url       TEXT,
                director_2_id_url       TEXT,
                rep_selfie_url          TEXT,
                rep_id_url              TEXT,
                memart_url              TEXT,
                annual_returns_url      TEXT,
                board_resolution_url    TEXT,
                aml_cft_url             TEXT,
                payment_receipt_url     TEXT,
                signatures              TEXT[],

                created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('   ✓ investments');

        // ─── 4. LOAN_COMMENTS TABLE ───────────────────────────────────────────
        console.log('▶ Creating loan_comments table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS loan_comments (
                id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                loan_id    INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
                user_id    INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                comment    TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log('   ✓ loan_comments');

        // ─── 5. LOAN_DOCUMENTS TABLE ──────────────────────────────────────────
        console.log('▶ Creating loan_documents table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS loan_documents (
                id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                loan_id               INTEGER REFERENCES loans(id) ON DELETE CASCADE,
                draft_id              TEXT,
                document_type         TEXT NOT NULL,
                file_url              TEXT NOT NULL,
                file_path             TEXT NOT NULL,
                file_name             TEXT,
                mime_type             TEXT,
                size_bytes            INTEGER,
                uploaded_by_user_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
                is_staff_upload       BOOLEAN DEFAULT FALSE,
                created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_loan_documents_loan_id    ON loan_documents(loan_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_loan_documents_draft_id   ON loan_documents(draft_id);`);
        console.log('   ✓ loan_documents');

        // ─── 6. INVESTMENT_DOCUMENTS TABLE ───────────────────────────────────
        console.log('▶ Creating investment_documents table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS investment_documents (
                id                  SERIAL PRIMARY KEY,
                investment_id       INTEGER REFERENCES investments(id) ON DELETE CASCADE,
                draft_id            VARCHAR(50),
                document_type       TEXT NOT NULL,
                file_url            TEXT NOT NULL,
                file_path           TEXT NOT NULL,
                file_name           TEXT,
                mime_type           TEXT,
                size_bytes          BIGINT,
                uploaded_by_user_id INTEGER REFERENCES customers(id),
                is_staff_upload     BOOLEAN DEFAULT FALSE,
                created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('   ✓ investment_documents');

        // ─── 7. MARKETING TABLE ───────────────────────────────────────────────
        console.log('▶ Creating marketing table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS marketing (
                id           SERIAL PRIMARY KEY,
                customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                hear_about_us TEXT,
                referral_code TEXT,
                officer_name  TEXT,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('   ✓ marketing');

        // ─── 8. YIELD_RATES TABLE ─────────────────────────────────────────────
        console.log('▶ Creating yield_rates table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS yield_rates (
                id            SERIAL PRIMARY KEY,
                plan_name     TEXT NOT NULL,
                currency      TEXT NOT NULL DEFAULT 'NGN',
                tenure_months INTEGER NOT NULL,
                min_amount    NUMERIC(15, 2) NOT NULL,
                max_amount    NUMERIC(15, 2),
                interest_rate NUMERIC(5, 2) NOT NULL,
                is_active     BOOLEAN DEFAULT TRUE,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('   ✓ yield_rates');

        // ─── 9. SEED SUPERADMINS ──────────────────────────────────────────────
        console.log('\n▶ Seeding superadmins (skipped — no users yet)');
        console.log('   ℹ  Run seed_superadmins.ts separately once users have logged in.\n');

        console.log('🎉 All migrations completed successfully!');

    } catch (err) {
        console.error('\n❌ Migration failed:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
