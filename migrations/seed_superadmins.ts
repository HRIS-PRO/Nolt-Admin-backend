import sql from '../config/db.js';

const SUPERADMIN_EMAILS = [
    'divineobinali9@gmail.com'
];

async function seedSuperadmins() {
    try {
        if (SUPERADMIN_EMAILS.length === 0) {
            console.log("No superadmin emails provided.");
            process.exit(0);
        }

        const distinctEmails = [...new Set(SUPERADMIN_EMAILS)]; // Remove duplicates

        console.log(`Promoting the following users to superadmin: ${distinctEmails.join(', ')}`);

        const result = await sql`
            UPDATE customers 
            SET role = 'superadmin' 
            WHERE email IN ${sql(distinctEmails)}
            RETURNING email, role;
        `;

        if (result.length > 0) {
            console.log("Successfully promoted users:");
            result.forEach(row => console.log(`- ${row.email}: ${row.role}`));
        } else {
            console.log("No matching users found to promote. Please ensure they have logged in at least once.");
        }

        process.exit(0);
    } catch (error) {
        console.error("Error seeding superadmins:", error);
        process.exit(1);
    }
}

seedSuperadmins();
