const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');

// Verification Script v2: Testing Refined Data Model
async function verify() {
    console.log('--- Verifying MTU Student Integration (Refined Model) ---');
    const baseUrl = 'http://localhost:5000/api';

    try {
        const studentMatric = 'MTU/2023/001'; // John Doe

        // 1. Test Login
        console.log(`\n[1] Testing Student Login for ${studentMatric}...`);
        const loginRes = await fetch(`${baseUrl}/student/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matric_number: studentMatric })
        });
        const loginData = await loginRes.json();

        if (loginRes.ok) {
            console.log('✅ Login Successful:', loginData.data.name);
        } else {
            console.error('❌ Login Failed:', loginData);
            return;
        }

        // 2. Test Timetable Retrieval
        console.log('\n[2] Testing Timetable Retrieval...');
        const timetableRes = await fetch(`${baseUrl}/student/${studentMatric}/timetable`);
        const timetableData = await timetableRes.json();

        if (timetableRes.ok) {
            console.log('✅ Timetable Fetched');
            const courses = timetableData.timetable.data.scheduled;

            // Check for Regular Courses (CSC301)
            const regular = courses.find(c => c.code === 'CSC301');
            console.log(`   Regular Course CSC301: ${regular ? 'Found ✅' : 'Missing ❌'}`);

            // Check for Carryover (CSC201 - "Compulsory Outstanding")
            const carryover = courses.find(c => c.code === 'CSC201' && c.is_carryover);
            console.log(`   Carryover Course CSC201 (from Remarks): ${carryover ? 'Found ✅' : 'Missing ❌'}`);

            if (carryover) {
                console.log('   Logic confirmed: "Compulsory Outstanding" remark correctly flagged as carryover.');
            }

        } else {
            console.log('❌ Failed to fetch timetable:', timetableData.error);
        }

    } catch (err) {
        console.error('❌ Verification Error:', err.message);
    }
}

verify();
