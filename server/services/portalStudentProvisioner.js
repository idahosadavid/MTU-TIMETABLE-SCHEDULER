/**
 * Just-In-Time (JIT) Student Provisioner
 *
 * When a student's matric number is not found in the local database, this
 * service fetches live data from the MTU Portal API and creates the necessary
 * local records (student profile, registered courses, carryover results).
 *
 * Requires:
 *   MTU_PORTAL_API_URL — base URL of the MTU student portal API
 *   MTU_PORTAL_API_KEY — optional API key sent as x-api-key header
 *
 * Expected portal endpoints:
 *   GET /students/:matric          → student profile
 *   GET /students/:matric/courses  → registered courses (optional)
 *   GET /students/:matric/results  → academic results / carryovers (optional)
 */

const MTU_PORTAL_API_URL = () => (process.env.MTU_PORTAL_API_URL || '').replace(/\/$/, '');
const MTU_PORTAL_API_KEY = () => process.env.MTU_PORTAL_API_KEY || '';

const buildHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    const key = MTU_PORTAL_API_KEY();
    if (key) headers['x-api-key'] = key;
    return headers;
};

/**
 * Safely fetch JSON from a URL. Returns null on any failure.
 */
const safeFetch = async (url, headers) => {
    try {
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) return null;
        return await res.json();
    } catch {
        return null;
    }
};

/**
 * Normalize a raw student object from the portal API into local schema fields.
 * Tries multiple common field name variants.
 */
const normalizeStudentProfile = (raw) => {
    if (!raw) return null;
    const name =
        raw.name || raw.full_name || raw.fullName || raw.student_name || raw.studentName || '';
    const department =
        raw.department || raw.department_name || raw.departmentName || raw.dept || '';
    const level = Number(raw.level || raw.current_level || raw.currentLevel || raw.year || 0);
    if (!name || !department || !level) return null;
    return { name, department, level };
};

/**
 * Main provisioning function.
 *
 * @param {string} matric_number
 * @param {object} studentsRepo — the active studentsRepo (sqlite or supabase)
 * @returns {object|null} the provisioned student row, or null if provisioning failed
 */
const provisionStudentFromPortal = async (matric_number, studentsRepo) => {
    const baseUrl = MTU_PORTAL_API_URL();

    if (!baseUrl) {
        console.warn('[JIT Provision] MTU_PORTAL_API_URL is not configured — cannot auto-provision student.');
        return null;
    }

    if (typeof studentsRepo.upsertStudent !== 'function') {
        console.warn('[JIT Provision] studentsRepo does not support write operations — skipping provisioning.');
        return null;
    }

    const headers = buildHeaders();
    const encodedMatric = encodeURIComponent(matric_number);

    console.log(`[JIT Provision] Provisioning student: ${matric_number}`);

    // --- 1. Fetch student profile ---
    const profileData = await safeFetch(`${baseUrl}/students/${encodedMatric}`, headers);
    if (!profileData) {
        console.warn(`[JIT Provision] Could not fetch profile for ${matric_number} from portal.`);
        return null;
    }

    // Portal may return { data: {...} }, { student: {...} }, or the object directly
    const rawProfile =
        Array.isArray(profileData)
            ? profileData[0]
            : profileData.data || profileData.student || profileData;

    const profile = normalizeStudentProfile(rawProfile);
    if (!profile) {
        console.warn(`[JIT Provision] Portal profile for ${matric_number} is missing required fields (name/department/level).`);
        return null;
    }

    // --- 2. Upsert the student record ---
    try {
        await studentsRepo.upsertStudent({ matric_number, ...profile });
    } catch (err) {
        console.error(`[JIT Provision] Failed to upsert student ${matric_number}:`, err.message);
        return null;
    }

    // --- 3. Fetch and upsert registered courses (optional, non-fatal) ---
    try {
        const coursesData = await safeFetch(`${baseUrl}/students/${encodedMatric}/courses`, headers);
        if (coursesData) {
            const rawCourses = Array.isArray(coursesData)
                ? coursesData
                : coursesData.data || coursesData.courses || [];

            const courses = rawCourses
                .map(c => ({
                    course_code: c.course_code || c.code || c.courseCode || '',
                    status: c.status || 'Registered'
                }))
                .filter(c => c.course_code);

            if (courses.length > 0) {
                await studentsRepo.upsertStudentCourses(matric_number, courses);
                console.log(`[JIT Provision] Synced ${courses.length} courses for ${matric_number}`);
            }
        }
    } catch (err) {
        console.warn(`[JIT Provision] Could not sync courses for ${matric_number}:`, err.message);
    }

    // --- 4. Fetch and upsert academic results / carryovers (optional, non-fatal) ---
    try {
        const resultsData = await safeFetch(`${baseUrl}/students/${encodedMatric}/results`, headers);
        if (resultsData) {
            const rawResults = Array.isArray(resultsData)
                ? resultsData
                : resultsData.data || resultsData.results || [];

            const results = rawResults
                .map(r => ({
                    course_code: r.course_code || r.code || r.courseCode || '',
                    score: r.score != null ? Number(r.score) : (r.mark != null ? Number(r.mark) : null),
                    grade: r.grade || '',
                    remarks: r.remarks || r.remark || '',
                    session: r.session || r.academic_session || r.academicSession || ''
                }))
                .filter(r => r.course_code);

            if (results.length > 0) {
                await studentsRepo.upsertStudentResults(matric_number, results);
                console.log(`[JIT Provision] Synced ${results.length} results for ${matric_number}`);
            }
        }
    } catch (err) {
        console.warn(`[JIT Provision] Could not sync results for ${matric_number}:`, err.message);
    }

    // --- 5. Return the freshly created student row ---
    try {
        const student = await studentsRepo.getByMatric(matric_number);
        console.log(`[JIT Provision] Successfully provisioned: ${matric_number}`);
        return student;
    } catch (err) {
        console.error(`[JIT Provision] Could not re-fetch provisioned student:`, err.message);
        return null;
    }
};

module.exports = { provisionStudentFromPortal };
