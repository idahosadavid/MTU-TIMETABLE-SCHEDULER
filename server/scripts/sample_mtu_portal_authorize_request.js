const baseUrl = process.env.TIMETABLE_API_BASE_URL || 'http://localhost:5000/api';
const sharedSecret = process.env.MTU_PORTAL_SHARED_SECRET;
const matricNumber = process.env.MTU_PORTAL_SAMPLE_MATRIC || 'MTU/2023/001';

if (!sharedSecret) {
    console.error('Missing MTU_PORTAL_SHARED_SECRET environment variable');
    process.exit(1);
}

const run = async () => {
    try {
        const authorizeResponse = await fetch(`${baseUrl}/student/portal/authorize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-mtu-portal-secret': sharedSecret
            },
            body: JSON.stringify({
                matric_number: matricNumber
            })
        });

        const authorizeData = await authorizeResponse.json();
        if (!authorizeResponse.ok) {
            console.error('Authorize request failed:', authorizeData);
            process.exit(1);
        }

        const portalCode = authorizeData?.data?.portal_code;
        if (!portalCode) {
            console.error('No portal code returned:', authorizeData);
            process.exit(1);
        }

        console.log('One-time portal code created for:', authorizeData?.data?.matric_number);
        console.log('Portal redirect URL (hardened flow):');
        console.log(`/student?portal_code=${encodeURIComponent(portalCode)}`);

        console.log('\nOptional: exchange check');
        const exchangeResponse = await fetch(`${baseUrl}/student/portal/exchange`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ portal_code: portalCode })
        });
        const exchangeData = await exchangeResponse.json();
        if (!exchangeResponse.ok) {
            console.error('Exchange failed:', exchangeData);
            process.exit(1);
        }

        console.log('Exchange successful, token expires at:', exchangeData?.data?.expires_at);
    } catch (error) {
        console.error('Request error:', error.message);
        process.exit(1);
    }
};

run();
