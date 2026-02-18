const baseUrl = process.env.TIMETABLE_API_BASE_URL || 'http://localhost:5000/api';
const sharedSecret = process.env.MTU_PORTAL_SHARED_SECRET;
const matricNumber = process.env.MTU_PORTAL_SAMPLE_MATRIC || 'MTU/2023/001';
const ttlSeconds = Number(process.env.MTU_PORTAL_SAMPLE_TTL || 1800);

if (!sharedSecret) {
    console.error('Missing MTU_PORTAL_SHARED_SECRET environment variable');
    process.exit(1);
}

const run = async () => {
    try {
        const response = await fetch(`${baseUrl}/student/portal/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-mtu-portal-secret': sharedSecret
            },
            body: JSON.stringify({
                matric_number: matricNumber,
                ttl_seconds: ttlSeconds
            })
        });

        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json()
            : { raw: await response.text() };

        if (!response.ok) {
            console.error('Request failed:', data);
            process.exit(1);
        }

        const token = data?.data?.token;
        console.log('Session created for:', data?.data?.matric_number);
        console.log('Expires at (unix):', data?.data?.expires_at);
        console.log('Portal redirect URL:');
        console.log(`/student?matric=${encodeURIComponent(matricNumber)}&mtu_token=${encodeURIComponent(token)}`);
    } catch (error) {
        console.error('Request error:', error.message);
        process.exit(1);
    }
};

run();
