require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { initDatabase } = require('./database/schema');
const { repositories } = require('./data/repositories');
const path = require('path');
const { createStudentSessionToken, verifyStudentSessionToken, DEFAULT_TTL_SECONDS } = require('./security/studentSession');
const { issuePortalAuthCode, consumePortalAuthCode } = require('./security/portalAuthCodeStore');

const { adminRepo, customFieldsRepo, coursesRepo, timetablesRepo, studentsRepo } = repositories;

const app = express();
const PORT = process.env.PORT || 5000;
const STUDENT_AUTH_MODE = process.env.MTU_STUDENT_AUTH_MODE || 'legacy';
const MTU_PORTAL_SHARED_SECRET = process.env.MTU_PORTAL_SHARED_SECRET || '';
const PORTAL_AUTH_CODE_TTL_SECONDS = Number(process.env.MTU_PORTAL_CODE_TTL_SECONDS) > 0
    ? Number(process.env.MTU_PORTAL_CODE_TTL_SECONDS)
    : 120;

// Debug Logger
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
});

// Middleware
app.use(cors());
app.use(bodyParser.json());

process.on('exit', (code) => {
    console.log(`About to exit with code: ${code}`);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Initialize Database
initDatabase();

const getActiveRules = async () => {
    const rows = await adminRepo.listRules();
    const rules = {};
    rows
        .filter(row => row.is_active === true || Number(row.is_active) === 1)
        .forEach(row => {
            rules[row.rule_key] = row.rule_value;
        });
    return rules;
};

const flattenForExport = (courses) => courses.map(course => ({
    code: course.code,
    title: course.title,
    college: course.college || '',
    department: course.department,
    level: course.level,
    semester: course.semester,
    day: course.day || '',
    time: course.time || '',
    venue: course.venue || '',
    units: course.units,
    duration_minutes: course.duration,
    lecturers: Array.isArray(course.lecturers) ? course.lecturers.join(', ') : course.lecturers
}));

const parseVenueSeats = (payload = {}) => {
    const parsed = Number(payload.seats ?? payload.capacity ?? 0);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const withVenueSeatsAlias = (venue) => ({
    ...venue,
    seats: Number(venue?.capacity || 0)
});

const handleStudentLogin = (req, res, options = {}) => {
    const { debug = false } = options;
    const { matric_number } = req.body;

    if (debug) {
        console.log('POST /api/student/login hit', req.body);
    }

    studentsRepo.getByMatric(matric_number)
        .then((row) => {
            if (row) {
                if (debug) console.log('Student found:', row.name);
                return res.json({ data: row });
            }
            if (debug) console.log('Student not found for matric:', matric_number);
            return res.status(404).json({ error: 'Student not found' });
        })
        .catch((err) => {
            if (debug) console.error('Database error in login:', err);
            return res.status(500).json({ error: err.message });
        });
};

const getBearerToken = (authorizationHeader = '') => {
    if (!authorizationHeader || typeof authorizationHeader !== 'string') {
        return null;
    }
    const [scheme, token] = authorizationHeader.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
        return null;
    }
    return token;
};

const isPortalTokenMode = () => STUDENT_AUTH_MODE === 'portal-token';

const assertPortalTokenAccess = (req, res) => {
    if (!isPortalTokenMode()) {
        return true;
    }

    const bearer = getBearerToken(req.headers.authorization);
    if (!bearer) {
        res.status(401).json({ error: 'Missing portal session token' });
        return false;
    }

    let payload;
    try {
        payload = verifyStudentSessionToken(bearer);
    } catch (err) {
        res.status(500).json({ error: err.message });
        return false;
    }

    if (!payload) {
        res.status(401).json({ error: 'Invalid or expired portal session token' });
        return false;
    }

    const requestedMatric = decodeURIComponent(req.params.matric_number || '');
    if (payload.sub !== requestedMatric) {
        res.status(403).json({ error: 'Portal session does not match requested student' });
        return false;
    }

    return true;
};

const getStudentTimetablePayload = async (matric_number) => {
    const student = await studentsRepo.getByMatric(matric_number);
    if (!student) {
        const error = new Error('Student not found');
        error.status = 404;
        throw error;
    }

    const [registrations, results] = await Promise.all([
        studentsRepo.listRegisteredCourses(matric_number),
        studentsRepo.listCarryoverResults(matric_number)
    ]);

    const registeredCodes = registrations.map(r => r.course_code);
    const carryoverCodes = results.map(r => r.course_code);
    const allStudentCourses = [...new Set([...registeredCodes, ...carryoverCodes])];

    const timetableRow = await studentsRepo.getLatestLectureTimetable();
    if (!timetableRow) {
        const error = new Error('No active timetable found');
        error.status = 404;
        throw error;
    }

    let timetableData;
    try {
        timetableData = typeof timetableRow.data === 'string'
            ? JSON.parse(timetableRow.data)
            : (timetableRow.data || { scheduled: [], unscheduled: [] });
    } catch {
        timetableData = { scheduled: [], unscheduled: [] };
    }

    const scheduledCourses = timetableData.scheduled || [];
    const studentSchedule = scheduledCourses.filter(course =>
        allStudentCourses.includes(course.code)
    ).map(course => ({
        ...course,
        is_carryover: carryoverCodes.includes(course.code)
    }));

    for (let i = 0; i < studentSchedule.length; i++) {
        for (let j = i + 1; j < studentSchedule.length; j++) {
            const c1 = studentSchedule[i];
            const c2 = studentSchedule[j];

            if (c1.day === c2.day) {
                const start1 = parseInt(c1.time.split(':')[0]) * 60 + parseInt(c1.time.split(':')[1] || 0);
                const end1 = start1 + c1.duration;
                const start2 = parseInt(c2.time.split(':')[0]) * 60 + parseInt(c2.time.split(':')[1] || 0);
                const end2 = start2 + c2.duration;

                if (start1 < end2 && start2 < end1) {
                    c1.clash_warning = true;
                    c2.clash_warning = true;
                }
            }
        }
    }

    return {
        student,
        timetable: {
            ...timetableRow,
            data: {
                scheduled: studentSchedule,
                unscheduled: []
            }
        }
    };
};

const handleStudentTimetable = (req, res) => {
    const { matric_number } = req.params;

    if (!assertPortalTokenAccess(req, res)) {
        return;
    }

    getStudentTimetablePayload(matric_number)
        .then(payload => res.json(payload))
        .catch((err) => {
            const status = err.status || 500;
            res.status(status).json({ error: err.message });
        });
};

console.log('Registering Student API Routes...');

// --- Student API ---

app.post('/api/student/portal/session', async (req, res) => {
    const incomingSecret = req.headers['x-mtu-portal-secret'];
    if (!MTU_PORTAL_SHARED_SECRET || incomingSecret !== MTU_PORTAL_SHARED_SECRET) {
        return res.status(401).json({ error: 'Unauthorized integration client' });
    }

    const { matric_number, ttl_seconds } = req.body || {};
    if (!matric_number) {
        return res.status(400).json({ error: 'matric_number is required' });
    }

    const ttl = Number(ttl_seconds) > 0 ? Number(ttl_seconds) : DEFAULT_TTL_SECONDS;

    try {
        const student = await studentsRepo.getByMatric(matric_number);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const token = createStudentSessionToken(matric_number, ttl);
        const nowSeconds = Math.floor(Date.now() / 1000);
        return res.json({
            data: {
                matric_number,
                token,
                token_type: 'Bearer',
                expires_at: nowSeconds + ttl
            }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/student/portal/authorize', async (req, res) => {
    const incomingSecret = req.headers['x-mtu-portal-secret'];
    if (!MTU_PORTAL_SHARED_SECRET || incomingSecret !== MTU_PORTAL_SHARED_SECRET) {
        return res.status(401).json({ error: 'Unauthorized integration client' });
    }

    const { matric_number } = req.body || {};
    if (!matric_number) {
        return res.status(400).json({ error: 'matric_number is required' });
    }

    try {
        const student = await studentsRepo.getByMatric(matric_number);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const { code, exp } = issuePortalAuthCode(matric_number, PORTAL_AUTH_CODE_TTL_SECONDS);

        return res.json({
            data: {
                matric_number,
                portal_code: code,
                expires_at: exp,
                token_exchange_path: '/api/student/portal/exchange'
            }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/student/portal/exchange', async (req, res) => {
    const { portal_code } = req.body || {};
    const payload = consumePortalAuthCode(portal_code);

    if (!payload || !payload.matric_number) {
        return res.status(401).json({ error: 'Invalid or expired portal code' });
    }

    try {
        const student = await studentsRepo.getByMatric(payload.matric_number);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const token = createStudentSessionToken(payload.matric_number, DEFAULT_TTL_SECONDS);
        const now = Math.floor(Date.now() / 1000);

        return res.json({
            data: {
                matric_number: payload.matric_number,
                token,
                token_type: 'Bearer',
                expires_at: now + DEFAULT_TTL_SECONDS
            }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Student Login (Verify Matric Number)
app.post('/api/student/login', (req, res) => {
    if (isPortalTokenMode()) {
        return res.status(403).json({ error: 'Direct student login is disabled in portal-token mode' });
    }
    handleStudentLogin(req, res, { debug: true });
});

// Get Student Timetable
app.get('/api/student/:matric_number/timetable', (req, res) => {
    handleStudentTimetable(req, res);
});

// Routes
app.get('/', (req, res) => {
    res.send('MTU AI Timetable Generator API is running');
});

// --- Custom Fields API ---

// Get all custom fields
app.get('/api/custom-fields', (req, res) => {
    customFieldsRepo.list()
        .then(rows => res.json({ data: rows }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// Add a new custom field
app.post('/api/custom-fields', (req, res) => {
    const { name, label, type, required } = req.body;
    customFieldsRepo.create({ name, label, type, required })
        .then(result => res.json({ message: 'Custom field added', id: result.id }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// Delete a custom field
app.delete('/api/custom-fields/:id', (req, res) => {
    const { id } = req.params;
    customFieldsRepo.deleteById(id)
        .then(() => res.json({ message: 'Custom field deleted' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// --- Admin Entity APIs ---

app.get('/api/admin/colleges', (req, res) => {
    adminRepo.listColleges()
        .then(rows => res.json({ data: rows }))
        .catch(err => res.status(500).json({ error: err.message }));
});

app.post('/api/admin/colleges', (req, res) => {
    const { code, name, is_active = 1 } = req.body;
    adminRepo.createCollege({ code, name, is_active })
        .then(result => res.json({ message: 'College added', id: result.lastID }))
        .catch(err => res.status(400).json({ error: err.message }));
});

app.put('/api/admin/colleges/:id', (req, res) => {
    const { id } = req.params;
    const { code, name, is_active = 1 } = req.body;
    adminRepo.updateCollege(id, { code, name, is_active })
        .then(() => res.json({ message: 'College updated' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

app.delete('/api/admin/colleges/:id', (req, res) => {
    const { id } = req.params;
    adminRepo.deleteCollege(id)
        .then(() => res.json({ message: 'College deleted' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

app.get('/api/admin/departments', (req, res) => {
    const { college_code } = req.query;
    adminRepo.listDepartments(college_code || null)
        .then(rows => res.json({ data: rows }))
        .catch(err => res.status(500).json({ error: err.message }));
});

app.post('/api/admin/departments', (req, res) => {
    const { code, name, college_code, is_active = 1 } = req.body;
    adminRepo.createDepartment({ code, name, college_code, is_active })
        .then(result => res.json({ message: 'Department added', id: result.lastID }))
        .catch(err => res.status(400).json({ error: err.message }));
});

app.put('/api/admin/departments/:id', (req, res) => {
    const { id } = req.params;
    const { code, name, college_code, is_active = 1 } = req.body;
    adminRepo.updateDepartment(id, { code, name, college_code, is_active })
        .then(() => res.json({ message: 'Department updated' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

app.delete('/api/admin/departments/:id', (req, res) => {
    const { id } = req.params;
    adminRepo.deleteDepartment(id)
        .then(() => res.json({ message: 'Department deleted' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

app.get('/api/admin/lecturers', (req, res) => {
    adminRepo.listLecturers()
        .then(rows => res.json({ data: rows }))
        .catch(err => res.status(500).json({ error: err.message }));
});

app.post('/api/admin/lecturers', (req, res) => {
    const { name, department_code, email = null } = req.body;
    adminRepo.createLecturer({ name, department_code, email })
        .then(result => res.json({ message: 'Lecturer added', id: result.lastID }))
        .catch(err => res.status(400).json({ error: err.message }));
});

app.put('/api/admin/lecturers/:id', (req, res) => {
    const { id } = req.params;
    const { name, department_code, email = null } = req.body;
    adminRepo.updateLecturer(id, { name, department_code, email })
        .then(() => res.json({ message: 'Lecturer updated' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

app.delete('/api/admin/lecturers/:id', (req, res) => {
    const { id } = req.params;
    adminRepo.deleteLecturer(id)
        .then(() => res.json({ message: 'Lecturer deleted' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

app.get('/api/admin/venues', (req, res) => {
    adminRepo.listVenues()
        .then(rows => res.json({ data: rows.map(withVenueSeatsAlias) }))
        .catch(err => res.status(500).json({ error: err.message }));
});

app.post('/api/admin/venues', (req, res) => {
    const { name, college_code = null } = req.body;
    const capacity = parseVenueSeats(req.body);
    adminRepo.createVenue({ name, college_code, capacity })
        .then(result => res.json({ message: 'Venue added', id: result.lastID, seats: capacity }))
        .catch(err => res.status(400).json({ error: err.message }));
});

app.put('/api/admin/venues/:id', (req, res) => {
    const { id } = req.params;
    const { name, college_code = null } = req.body;
    const capacity = parseVenueSeats(req.body);
    adminRepo.updateVenue(id, { name, college_code, capacity })
        .then(() => res.json({ message: 'Venue updated', seats: capacity }))
        .catch(err => res.status(400).json({ error: err.message }));
});

app.delete('/api/admin/venues/:id', (req, res) => {
    const { id } = req.params;
    adminRepo.deleteVenue(id)
        .then(() => res.json({ message: 'Venue deleted' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

app.get('/api/admin/rules', (req, res) => {
    adminRepo.listRules()
        .then(rows => res.json({ data: rows }))
        .catch(err => res.status(500).json({ error: err.message }));
});

app.put('/api/admin/rules/:id', (req, res) => {
    const { id } = req.params;
    const { name, rule_key, rule_value, is_active = 1 } = req.body;
    adminRepo.updateRule(id, { name, rule_key, rule_value, is_active })
        .then(() => res.json({ message: 'Rule updated' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

app.get('/api/options', (req, res) => {
    adminRepo.getOptions()
        .then(data => res.json({
            data: {
                ...data,
                venues: (data.venues || []).map(withVenueSeatsAlias)
            }
        }))
        .catch(err => res.status(500).json({ error: err.message }));
});

// --- API Endpoints ---

// Add a new course
app.post('/api/courses', (req, res) => {
    const { code, title, department, level, lecturers, units, semester, type, is_compulsory, preferred_day, preferred_time, venue, duration, student_count, custom_data } = req.body;
    // API accepts duration in hours; store duration in minutes.
    const durationInMinutes = parseFloat(duration) * 60;
    const timetable_id = req.body.timetable_id;

    if (!timetable_id) {
        return res.status(400).json({ error: 'timetable_id is required' });
    }
    timetablesRepo.getRawById(timetable_id)
        .then((timetableRow) => {
            if (!timetableRow) {
                throw new Error('Invalid timetable_id');
            }

            const college = timetableRow.college || null;
            return coursesRepo.create({
                code,
                title,
                college,
                department,
                level,
                lecturers,
                units,
                semester,
                type,
                is_compulsory,
                preferred_day,
                preferred_time,
                venue,
                duration: durationInMinutes,
                student_count,
                custom_data,
                timetable_id
            });
        })
        .then((result) => {
            res.json({ message: 'Course added successfully', id: result.lastID });
        })
        .catch((err) => {
            if (err.message === 'Invalid timetable_id') {
                return res.status(400).json({ error: 'Invalid timetable_id' });
            }
            return res.status(400).json({ error: err.message });
        });
});

// Get all courses
app.get('/api/courses', (req, res) => {
    const { timetable_id } = req.query;
    coursesRepo.list({ timetableId: timetable_id })
        .then((rows) => {
            const courses = rows.map(row => ({
                ...row,
                is_compulsory: row.is_compulsory === true || row.is_compulsory === 1 || row.is_compulsory === '1' || row.is_compulsory === 'true',
                custom_data: typeof row.custom_data === 'string'
                    ? (row.custom_data ? JSON.parse(row.custom_data) : {})
                    : (row.custom_data || {})
            }));
            res.json({ data: courses });
        })
        .catch((err) => {
            res.status(400).json({ error: err.message });
        });
});

// --- Timetable CRUD APIs ---

// List all timetables
app.get('/api/timetables', (req, res) => {
    const { college } = req.query;
    timetablesRepo.list({ college: college || null })
        .then(rows => res.json({ data: rows }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// Get specific timetable
app.get('/api/timetables/:id', (req, res) => {
    const { id } = req.params;
    timetablesRepo.getById(id)
        .then((row) => {
            if (row) {
                res.json({ data: row });
            } else {
                res.status(404).json({ error: 'Timetable not found' });
            }
        })
        .catch(err => res.status(400).json({ error: err.message }));
});

// Create new timetable (Empty)
app.post('/api/timetables', (req, res) => {
    const { type, name, academic_session, semester, college } = req.body;

    adminRepo.getActiveCollegeByCode(college)
        .then((row) => {
            if (!row) {
                throw new Error('INVALID_COLLEGE');
            }
            return timetablesRepo.create({ type, name, academic_session, semester, college });
        })
        .then((created) => {
            res.json({ message: 'Timetable created', id: created.id });
        })
        .catch((err) => {
            if (err.message === 'INVALID_COLLEGE') {
                return res.status(400).json({ error: 'Invalid or missing college. Configure colleges in Admin Setup.' });
            }
            return res.status(500).json({ error: err.message });
        });
});

// Update timetable metadata
app.put('/api/timetables/:id', (req, res) => {
    const { id } = req.params;
    const { name, academic_session, semester, status } = req.body;
    timetablesRepo.updateMeta(id, { name, academic_session, semester, status })
        .then(() => res.json({ message: 'Timetable updated' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// Delete timetable
app.delete('/api/timetables/:id', (req, res) => {
    const { id } = req.params;
    timetablesRepo.deleteById(id)
        .then(() => res.json({ message: 'Timetable deleted' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// Duplicate timetable
app.post('/api/timetables/:id/duplicate', (req, res) => {
    const { id } = req.params;
    timetablesRepo.duplicateById(id)
        .then((result) => {
            if (!result) {
                return res.status(400).json({ error: 'Timetable not found' });
            }
            return res.json({ message: 'Timetable duplicated', id: result.lastID });
        })
        .catch(err => res.status(400).json({ error: err.message }));
});

// Generate Timetable (Creates NEW entry)
const { generateLectureSchedule, generateExamSchedule, generateTestSchedule } = require('./ai/scheduler');

const handleGenerate = async (req, res, generateFn, type) => {
    const { timetable_id, scope = 'college', department = null, level = null, semester = null } = req.body;
    if (!timetable_id) {
        return res.status(400).json({ error: 'timetable_id is required' });
    }

    try {
        const timetableRow = await timetablesRepo.getRawById(timetable_id);
        if (!timetableRow) {
            return res.status(400).json({ error: 'Invalid timetable_id' });
        }

        const courses = await coursesRepo.listByTimetableId(timetable_id);

        if (courses.length === 0) {
            return res.status(400).json({ error: 'No courses found for this timetable. Please add courses first.' });
        }

        const rules = await getActiveRules();
        const venues = await adminRepo.listVenues();
        let departmentAliases = [];

        if (scope === 'department' && department) {
            const allDepartments = await adminRepo.listDepartments();
            const normalizedSelected = String(department).trim().toLowerCase();
            const matchedDepartment = (allDepartments || []).find((d) => {
                const code = String(d.code || '').trim().toLowerCase();
                const name = String(d.name || '').trim().toLowerCase();
                return code === normalizedSelected || name === normalizedSelected;
            });

            if (matchedDepartment) {
                departmentAliases = Array.from(new Set([
                    String(department).trim(),
                    String(matchedDepartment.code || '').trim(),
                    String(matchedDepartment.name || '').trim()
                ].filter(Boolean)));
            } else {
                departmentAliases = [String(department).trim()];
            }
        }

        const filterOptions = {
            scope,
            department: scope === 'department' ? department : null,
            departmentAliases,
            level: level || null,
            semester: semester || timetableRow.semester || null,
            college: timetableRow.college,
            rules,
            venues: venues.filter(v => !v.college_code || v.college_code === timetableRow.college)
        };

        const schedule = await generateFn(courses, filterOptions);
        const generatedData = Array.isArray(schedule)
            ? { scheduled: schedule, unscheduled: [] }
            : {
                scheduled: Array.isArray(schedule?.scheduled) ? schedule.scheduled : [],
                unscheduled: Array.isArray(schedule?.unscheduled) ? schedule.unscheduled : []
            };
        const finalData = JSON.stringify(generatedData);

        await timetablesRepo.updateGeneratedDataById(timetable_id, finalData);

        const derivedTimetables = [];
        if (scope === 'college') {
            const normalizeText = (value) => String(value || '').trim();
            const allGeneratedCourses = [...generatedData.scheduled, ...generatedData.unscheduled];
            const departmentsInRun = Array.from(new Set(
                allGeneratedCourses
                    .map((course) => normalizeText(course.department))
                    .filter(Boolean)
            ));

            const existingTimetables = await timetablesRepo.list({ college: timetableRow.college });

            const upsertDerivedTimetable = async (name, dataObject) => {
                const matching = (existingTimetables || []).find((item) =>
                    item.type === type
                    && item.name === name
                    && item.college === timetableRow.college
                    && item.academic_session === timetableRow.academic_session
                    && item.semester === timetableRow.semester
                );

                const payload = JSON.stringify(dataObject);
                if (matching) {
                    await timetablesRepo.updateGeneratedDataById(matching.id, payload);
                    derivedTimetables.push({ id: matching.id, name, mode: 'updated' });
                    return;
                }

                const created = await timetablesRepo.createWithData({
                    type,
                    name,
                    academic_session: timetableRow.academic_session,
                    semester: timetableRow.semester,
                    college: timetableRow.college,
                    status: 'Draft',
                    data: payload
                });

                const newId = created?.lastID || created?.id || null;
                if (newId != null) {
                    existingTimetables.push({
                        id: newId,
                        type,
                        name,
                        academic_session: timetableRow.academic_session,
                        semester: timetableRow.semester,
                        college: timetableRow.college
                    });
                }
                derivedTimetables.push({ id: newId, name, mode: 'created' });
            };

            for (const departmentName of departmentsInRun) {
                const departmentScheduled = generatedData.scheduled.filter(
                    (course) => normalizeText(course.department) === departmentName
                );
                const departmentUnscheduled = generatedData.unscheduled.filter(
                    (course) => normalizeText(course.department) === departmentName
                );

                const departmentData = { scheduled: departmentScheduled, unscheduled: departmentUnscheduled };
                const departmentTimetableName = `${timetableRow.name || `${type} Timetable`} - ${departmentName}`;
                await upsertDerivedTimetable(departmentTimetableName, departmentData);

                const levelsInDepartment = Array.from(new Set(
                    [...departmentScheduled, ...departmentUnscheduled]
                        .map((course) => normalizeText(course.level))
                        .filter(Boolean)
                )).sort((a, b) => Number(a) - Number(b));

                for (const levelValue of levelsInDepartment) {
                    const levelScheduled = departmentScheduled.filter(
                        (course) => normalizeText(course.level) === levelValue
                    );
                    const levelUnscheduled = departmentUnscheduled.filter(
                        (course) => normalizeText(course.level) === levelValue
                    );

                    const levelData = { scheduled: levelScheduled, unscheduled: levelUnscheduled };
                    const levelTimetableName = `${timetableRow.name || `${type} Timetable`} - ${departmentName} - Level ${levelValue}`;
                    await upsertDerivedTimetable(levelTimetableName, levelData);
                }
            }
        }

        res.json({
            message: `${type} timetable generated`,
            id: timetable_id,
            data: generatedData,
            derived_timetables: derivedTimetables
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

app.post('/api/generate/lectures', (req, res) => handleGenerate(req, res, generateLectureSchedule, 'Lecture'));
app.post('/api/generate/exams', (req, res) => handleGenerate(req, res, generateExamSchedule, 'Exam'));
app.post('/api/generate/tests', (req, res) => handleGenerate(req, res, generateTestSchedule, 'Test'));

// Validate Timetable Move
app.post('/api/timetables/validate', (req, res) => {
    const { schedule, course, day, time } = req.body;
    const { hasConflict } = require('./ai/scheduler');

    // Check if the move creates a conflict
    // We need to filter out the course itself from the schedule if it's already there (for move operations)
    const otherCourses = schedule.filter(c => c.code !== course.code);
    const conflict = hasConflict(otherCourses, day, time, course.duration || 60, course);

    res.json({ valid: !conflict });
});

// Save Timetable
app.post('/api/timetables/:type/save', (req, res) => {
    const { type } = req.params;
    const { scheduled, unscheduled } = req.body;

    const data = JSON.stringify({ scheduled, unscheduled });

    timetablesRepo.createWithData({ type, data })
        .then((result) => res.json({ message: 'Timetable saved successfully', id: result.lastID }))
        .catch((err) => res.status(400).json({ error: err.message }));
});

// Save Timetable (Specific ID)
app.post('/api/timetables/:id/save', (req, res) => {
    const { id } = req.params;
    const { scheduled, unscheduled } = req.body;

    const data = JSON.stringify({ scheduled, unscheduled });

    timetablesRepo.updateDataById(id, data)
        .then(() => res.json({ message: 'Timetable saved successfully' }))
        .catch((err) => res.status(400).json({ error: err.message }));
});

// Clear Unscheduled Courses (Specific ID)
app.post('/api/timetables/:id/clear-unscheduled', (req, res) => {
    const { id } = req.params;

    timetablesRepo.getRawById(id)
        .then((row) => {
            if (!row) {
                throw new Error('Timetable not found');
            }

            const currentData = JSON.parse(row.data);
            const scheduled = Array.isArray(currentData) ? currentData : (currentData.scheduled || []);
            const newData = JSON.stringify({ scheduled, unscheduled: [] });

            return timetablesRepo.updateDataById(id, newData);
        })
        .then(() => res.json({ message: 'Unscheduled courses cleared' }))
        .catch((err) => {
            if (err.message === 'Timetable not found') {
                return res.status(400).json({ error: 'Timetable not found' });
            }
            return res.status(400).json({ error: err.message });
        });
});

// Latest timetable by type (legacy compatibility endpoint)
app.get('/api/timetables/latest/:type', (req, res) => {
    const { type } = req.params;
    timetablesRepo.getLatestByType(type)
        .then((row) => {
            if (row) {
                const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
                return res.json({ data: parsed, meta: row });
            }
            return res.json({ data: { scheduled: [], unscheduled: [] } });
        })
        .catch((err) => res.status(400).json({ error: err.message }));
});

// Export Timetable (Excel, PDF, Word)
app.get('/api/timetables/:id/export', async (req, res) => {
    const { id } = req.params;
    const { format = 'excel', department, level } = req.query;
    try {
        const timetable = await timetablesRepo.getRawById(id);
        if (!timetable) {
            return res.status(404).json({ error: 'Timetable not found' });
        }

        let data;
        try {
            data = typeof timetable.data === 'string'
                ? JSON.parse(timetable.data || '{"scheduled":[],"unscheduled":[]}')
                : (timetable.data || { scheduled: [], unscheduled: [] });
        } catch {
            data = { scheduled: [], unscheduled: [] };
        }

        const scheduled = Array.isArray(data) ? data : (data.scheduled || []);
        const filtered = scheduled.filter(item => {
            if (department && item.department !== department) return false;
            if (level && Number(item.level) !== Number(level)) return false;
            return true;
        });
        const rows = flattenForExport(filtered);
        const baseName = `${timetable.name || 'timetable'}_${department || 'all'}_${level || 'all'}`.replace(/\s+/g, '_');

        if (format === 'excel') {
            const xlsx = require('xlsx');
            const workbook = xlsx.utils.book_new();
            const worksheet = xlsx.utils.json_to_sheet(rows);
            xlsx.utils.book_append_sheet(workbook, worksheet, 'Timetable');
            const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${baseName}.xlsx`);
            return res.send(buffer);
        }

        if (format === 'pdf') {
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({ margin: 30, size: 'A4' });
            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(chunks);
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename=${baseName}.pdf`);
                res.send(pdfBuffer);
            });

            doc.fontSize(16).text(`${timetable.name || 'Timetable'} Export`, { underline: true });
            doc.moveDown(0.5);
            doc.fontSize(10).text(`College: ${timetable.college || 'N/A'} | Semester: ${timetable.semester || 'N/A'}`);
            doc.text(`Department: ${department || 'All'} | Level: ${level || 'All'}`);
            doc.moveDown(1);

            rows.forEach((row, index) => {
                doc.fontSize(9).text(`${index + 1}. ${row.code} - ${row.title} | ${row.day} ${row.time} | ${row.venue}`);
            });
            doc.end();
            return;
        }

        if (format === 'word') {
            const { Document, Packer, Paragraph, TextRun } = require('docx');
            const paragraphs = [
                new Paragraph({
                    children: [new TextRun({ text: `${timetable.name || 'Timetable'} Export`, bold: true, size: 28 })]
                }),
                new Paragraph(`College: ${timetable.college || 'N/A'} | Semester: ${timetable.semester || 'N/A'}`),
                new Paragraph(`Department: ${department || 'All'} | Level: ${level || 'All'}`),
                new Paragraph(' '),
                ...rows.map((row, index) => new Paragraph(`${index + 1}. ${row.code} - ${row.title} | ${row.day} ${row.time} | ${row.venue}`))
            ];

            const doc = new Document({
                sections: [{ properties: {}, children: paragraphs }]
            });
            const buffer = await Packer.toBuffer(doc);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', `attachment; filename=${baseName}.docx`);
            return res.send(buffer);
        }

        return res.status(400).json({ error: 'Unsupported format. Use excel, pdf, or word.' });
    } catch (err) {
        return res.status(404).json({ error: 'Timetable not found' });
    }
});


// Start Server
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

server.on('close', () => {
    console.log('Server closed');
});

// Keep-alive hack to prevent premature exit if event loop drains
setInterval(() => {
    // console.log('Heartbeat');
}, 10000);
