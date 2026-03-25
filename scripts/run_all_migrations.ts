
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const migrationSequence = [
    'create_customers_table.ts',
    'upgrade_customers_table.ts',
    'create_loans_table.ts',
    'create_investments_table.ts',
    'create_loan_comments_table.ts',
    'create_loan_documents_table.ts',
    'create_investment_documents_table.ts',
    'add_bank_details_to_loans.ts',
    'add_disb_date_to_loans.ts',
    'add_disbursement_columns.ts',
    'add_email_otp_columns.ts',
    'add_existing_balance_column.ts',
    'add_loan_type_to_loans.ts',
    'add_new_comer_column.ts',
    'add_product_type_column.ts',
    'add_referral_and_marketing.ts',
    'add_reset_password_columns.ts',
    'add_reset_password_columns_v2.ts',
    'add_role_column.ts',
    'add_sales_officer_to_loans.ts',
    'add_status_column_to_loans.ts',
    'alter_investments_receipt.ts',
    'alter_investments_signature_array.ts',
    'alter_loan_documents_add_draft_id.ts',
    'alter_loans_globally.ts',
    'alter_loans_signature_array.ts',
    'add_topup_and_buyover_columns.ts',
    'create_loan_activities_table.ts',
    'make_google_id_nullable.ts',
    '20240312_create_yield_rates.ts',
    'seed_superadmins.ts'
];

async function runAll() {
    console.log("Starting full database repush...");

    for (const file of migrationSequence) {
        console.log(`\n>>> Running: ${file}`);
        try {
            // Use tsx to run the migration
            // We use node --import tsx to handle ESM and TS
            const output = execSync(`npx tsx migrations/${file}`, {
                stdio: 'inherit',
                env: { ...process.env }
            });
        } catch (error) {
            console.error(`Error running ${file}:`, error.message);
            // We continue because some migrations might fail if columns already exist (though we use IF NOT EXISTS)
        }
    }

    console.log("\nFinished all migrations.");
}

runAll();
