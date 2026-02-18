const fetch = require('node-fetch'); // Ensure node-fetch is available or use built-in fetch in Node 18+

// If node-fetch is not available, we can rely on Node 18+ global fetch or use http module.
// Assuming Node 18+ environment based on "2026" date.

async function verify() {
    console.log('--- Verifying MTU Student Integration ---');
    const baseUrl = 'http://localhost:5000/api';

    try {
        // 1. Test Login (Regular Student)
        console.log('\n[1] Testing Student Login (Valid)...');
        const loginRes = await fetch(`${baseUrl}/student/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matric_number: 'MTU/2023/001' })
        });
        const loginData = await loginRes.json();
        if (loginRes.ok && loginData.data.name === 'John Doe') {
            console.log('✅ Login Successful:', loginData.data.name);
        } else {
            console.error('❌ Login Failed:', loginData);
        }

        // 2. Test Timetable Retrieval
        console.log('\n[2] Testing Timetable Retrieval...');
        // First ensure there is a timetable. We might need to generate one if the DB is empty of timetables.
        // But let's assume one exists or we might fail.
        // Actually, we should check if a timetable exists first.

        const timetableRes = await fetch(`${baseUrl}/student/MTU/2023/001/timetable`);
        const timetableData = await timetableRes.json();

        if (timetableRes.ok) {
            console.log('✅ Timetable Fetched');
            const courses = timetableData.timetable.data.scheduled;
            console.log(`   Found ${courses.length} courses for student.`);

            // Check for Carryover
            const carryovers = courses.filter(c => c.is_carryover);
            if (carryovers.length > 0) {
                console.log(`✅ Carryover Detected: ${carryovers.map(c => c.code).join(', ')}`);
            } else {
                console.log('ℹ️ No carryover courses found in schedule (might need to generate timetable first).');
            }

            // Check for Clash
            const clashes = courses.filter(c => c.clash_warning);
            if (clashes.length > 0) {
                console.log(`⚠️ Clash Warnings: ${clashes.map(c => c.code).join(', ')}`);
            } else {
                console.log('ℹ️ No clashes detected.');
            }

        } else {
            console.log('❌ Failed to fetch timetable (Maybe none generated yet?):', timetableData.error);
        }

    } catch (err) {
        console.error('❌ Verification Error:', err.message);
    }
}

verify();
