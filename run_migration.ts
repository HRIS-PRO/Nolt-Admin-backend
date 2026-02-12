import { up } from './migrations/add_loan_type_to_loans';


async function run() {
    try {
        console.log("Running migration...");
        await up();
        console.log("Migration completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

run();
