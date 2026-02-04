
// Basic test script using fetch
const BASE_URL = 'http://localhost:5000';

async function runTest() {
    console.log("--- Starting Staff Flow Test ---");

    // 1. Login as Superadmin
    console.log("\n1. Logging in as Superadmin...");
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: 'exceldistrings@gmail.com',
            password: 'password123'
        })
    });

    if (!loginRes.ok) {
        console.error("Superadmin login failed:", await loginRes.text());
        return;
    }

    // Get cookies
    const cookie = loginRes.headers.get('set-cookie');
    console.log("Superadmin logged in. Cookie received.");

    // 2. Invite New Staff
    const newStaffEmail = `test_staff_${Date.now()}@nolt.com`;
    console.log(`\n2. Inviting new staff: ${newStaffEmail}...`);

    const inviteRes = await fetch(`${BASE_URL}/staff/invite`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': cookie || ''
        },
        body: JSON.stringify({
            email: newStaffEmail,
            role: 'sales_officer',
            full_name: 'Test Staff User'
        })
    });

    if (!inviteRes.ok) {
        console.error(`Invite failed with status: ${inviteRes.status} ${inviteRes.statusText}`);
        console.error("Response body:", await inviteRes.text());
        return;
    }

    const inviteData = await inviteRes.json();
    console.log("Invite successful:", inviteData);

    // 3. Setup New Staff Password
    console.log("\n3. Setting up password for new staff...");
    const setupRes = await fetch(`${BASE_URL}/staff/complete-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: newStaffEmail,
            password: 'newpassword123'
        })
    });

    if (!setupRes.ok) {
        console.error("Setup failed:", await setupRes.text());
        return;
    }
    console.log("Password setup successful.");

    // 4. Login as New Staff
    console.log("\n4. Logging in as New Staff...");
    const staffLoginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: newStaffEmail,
            password: 'newpassword123'
        })
    });

    if (staffLoginRes.ok) {
        const staffData = await staffLoginRes.json();
        console.log("--- TEST PASSED: Staff Login Successful ---");
        console.log("User Role:", staffData.user.role);
    } else {
        console.error("Staff login failed:", await staffLoginRes.text());
    }
}

runTest();
