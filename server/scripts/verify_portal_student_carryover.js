require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fetchClient = (...args) => fetch(...args);

async function verifyPortalCarryoverFlow() {
    const baseUrl = process.env.TIMETABLE_API_BASE_URL || 'http://localhost:5000/api';
    const authMode = (process.env.MTU_STUDENT_AUTH_MODE || 'legacy').toLowerCase();
    const sharedSecret = process.env.MTU_PORTAL_SHARED_SECRET;
    const studentMatric = process.env.MTU_PORTAL_VERIFY_MATRIC || 'MTU/2023/001';

    if (authMode !== 'portal-token') {
        console.log('PORTAL_STUDENT_CARRYOVER_SKIPPED');
        console.log(`MTU_STUDENT_AUTH_MODE=${authMode}. Set MTU_STUDENT_AUTH_MODE=portal-token to run this verification.`);
        process.exit(0);
    }

    if (!sharedSecret) {
        console.error('Missing MTU_PORTAL_SHARED_SECRET environment variable');
        process.exit(1);
    }

    try {
        console.log('--- Verifying Portal Token Student Carryover Flow ---');

        console.log(`\n[1] Requesting one-time portal code for ${studentMatric}...`);
        const authorizeRes = await fetchClient(`${baseUrl}/student/portal/authorize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-mtu-portal-secret': sharedSecret
            },
            body: JSON.stringify({ matric_number: studentMatric })
        });
        const authorizeData = await authorizeRes.json();

        if (!authorizeRes.ok) {
            console.error('❌ Portal authorize failed:', authorizeData.error || authorizeData);
            process.exit(1);
        }

        const portalCode = authorizeData?.data?.portal_code;
        if (!portalCode) {
            console.error('❌ Portal code missing in authorize response');
            process.exit(1);
        }
        console.log('✅ One-time portal code issued');

        console.log('\n[2] Exchanging portal code for student session token...');
        const exchangeRes = await fetchClient(`${baseUrl}/student/portal/exchange`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ portal_code: portalCode })
        });
        const exchangeData = await exchangeRes.json();

        if (!exchangeRes.ok) {
            console.error('❌ Portal exchange failed:', exchangeData.error || exchangeData);
            process.exit(1);
        }

        const token = exchangeData?.data?.token;
        const tokenMatric = exchangeData?.data?.matric_number;
        if (!token || !tokenMatric) {
            console.error('❌ Session token or matric missing after exchange');
            process.exit(1);
        }
        console.log('✅ Session token issued from one-time code');

        console.log('\n[3] Fetching personalized timetable with exchanged token...');
        const timetableRes = await fetchClient(`${baseUrl}/student/${encodeURIComponent(tokenMatric)}/timetable`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const timetableData = await timetableRes.json();

        if (!timetableRes.ok) {
            console.error('❌ Timetable fetch failed:', timetableData.error || timetableData);
            process.exit(1);
        }

        const student = timetableData?.student;
        const scheduled = timetableData?.timetable?.data?.scheduled || [];
        const carryovers = scheduled.filter(course => course.is_carryover);

        console.log(`✅ Timetable fetched for: ${student?.name || tokenMatric}`);
        console.log(`   Courses returned: ${scheduled.length}`);
        console.log(`   Carryover courses returned: ${carryovers.length}`);

        if (carryovers.length === 0) {
            console.error('❌ No carryover courses were returned in personalized timetable');
            process.exit(1);
        }

        console.log('✅ Personalized carryover timetable verified');
        console.log('PORTAL_STUDENT_CARRYOVER_OK');
    } catch (error) {
        console.error('❌ Verification error:', error.message);
        process.exit(1);
    }
}

verifyPortalCarryoverFlow();
