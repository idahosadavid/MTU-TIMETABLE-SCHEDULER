const apiBase = (process.env.TIMETABLE_API_BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const enableWrites = String(process.env.PARITY_ENABLE_WRITES || 'false').toLowerCase() === 'true';
const studentMatric = process.env.PARITY_STUDENT_MATRIC || '';
const exportTimetableId = process.env.PARITY_EXPORT_TIMETABLE_ID || '';

const probes = [];

const toResult = async (name, response) => {
    const contentType = response.headers.get('content-type') || '';
    let body;

    try {
        body = contentType.includes('application/json')
            ? await response.json()
            : await response.text();
    } catch {
        body = '<unreadable body>';
    }

    return {
        name,
        ok: response.ok,
        status: response.status,
        body
    };
};

const runRequest = async (name, url, options = {}) => {
    try {
        const response = await fetch(url, options);
        probes.push(await toResult(name, response));
    } catch (error) {
        const cause = error && typeof error === 'object' ? error.cause : null;
        const networkDetails = cause
            ? [cause.code, cause.address, cause.port].filter(Boolean).join(' ')
            : '';
        probes.push({
            name,
            ok: false,
            status: 'NETWORK_ERROR',
            body: networkDetails ? `${error.message} (${networkDetails})` : error.message
        });
    }
};

const run = async () => {
    await runRequest('Health root', `${apiBase}/`);

    await runRequest('GET options', `${apiBase}/api/options`);
    await runRequest('GET admin colleges', `${apiBase}/api/admin/colleges`);
    await runRequest('GET admin departments', `${apiBase}/api/admin/departments`);
    await runRequest('GET admin lecturers', `${apiBase}/api/admin/lecturers`);
    await runRequest('GET admin venues', `${apiBase}/api/admin/venues`);
    await runRequest('GET admin rules', `${apiBase}/api/admin/rules`);
    await runRequest('GET custom fields', `${apiBase}/api/custom-fields`);
    await runRequest('GET timetables', `${apiBase}/api/timetables`);

    if (studentMatric) {
        await runRequest('POST student login', `${apiBase}/api/student/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matric_number: studentMatric })
        });

        await runRequest('GET student timetable', `${apiBase}/api/student/${encodeURIComponent(studentMatric)}/timetable`);
    }

    if (exportTimetableId) {
        await runRequest('GET export excel', `${apiBase}/api/timetables/${encodeURIComponent(exportTimetableId)}/export?format=excel`);
    }

    if (enableWrites) {
        const probeName = `parity_probe_${Date.now()}`;

        await runRequest('POST custom field (write probe)', `${apiBase}/api/custom-fields`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: probeName,
                label: 'Parity Probe',
                type: 'text',
                required: false
            })
        });

        const last = probes[probes.length - 1];
        const insertedId = last?.body?.id;

        if (insertedId) {
            await runRequest('DELETE custom field (write cleanup)', `${apiBase}/api/custom-fields/${insertedId}`, {
                method: 'DELETE'
            });
        }
    }

    const failed = probes.filter(item => !item.ok);

    console.log('PARITY_PROBE_SUMMARY');
    console.log(JSON.stringify({
        apiBase,
        total: probes.length,
        passed: probes.length - failed.length,
        failed: failed.length,
        enableWrites,
        usedStudentMatric: !!studentMatric,
        usedExportTimetableId: !!exportTimetableId
    }, null, 2));

    probes.forEach((item) => {
        const marker = item.ok ? 'PASS' : 'FAIL';
        console.log(`[${marker}] ${item.name} -> ${item.status}`);
        if (!item.ok) {
            console.log('  Body:', typeof item.body === 'string' ? item.body : JSON.stringify(item.body));
        }
    });

    if (failed.length > 0) {
        process.exit(1);
    }
};

run().catch((error) => {
    console.error('PARITY_PROBE_FATAL_ERROR');
    console.error(error.message || error);
    process.exit(1);
});
