const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const loadEnvFile = () => {
    const envPath = path.resolve(__dirname, '../.env');
    if (!fs.existsSync(envPath)) return;

    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex < 1) return;

        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();

        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        if (!process.env[key]) {
            process.env[key] = value;
        }
    });
};

loadEnvFile();

const { getSupabaseClient } = require('../database/supabaseAdapter');

const sqlitePath = process.env.MIGRATION_SQLITE_PATH
    ? path.resolve(process.env.MIGRATION_SQLITE_PATH)
    : path.resolve(__dirname, '../database/mtu_timetable.db');

const openSqlite = (dbFilePath) => new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbFilePath, sqlite3.OPEN_READONLY, (error) => {
        if (error) {
            reject(error);
            return;
        }
        resolve(db);
    });
});

const sqliteAll = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
        if (error) {
            reject(error);
            return;
        }
        resolve(rows || []);
    });
});

const parseJson = (value, fallback) => {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const toBoolean = (value) => {
    if (typeof value === 'boolean') return value;
    if (value === null || value === undefined || value === '') return false;
    return Number(value) === 1 || String(value).toLowerCase() === 'true';
};

const chunkArray = (items, chunkSize) => {
    const chunks = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
};

const insertInChunks = async (supabase, tableName, rows, chunkSize = 500) => {
    if (!rows.length) return;

    const chunks = chunkArray(rows, chunkSize);
    for (const chunk of chunks) {
        const { error } = await supabase.from(tableName).insert(chunk);
        if (error) {
            throw new Error(`Insert failed for ${tableName}: ${error.message}`);
        }
    }
};

const clearTable = async (supabase, tableName) => {
    const { error } = await supabase.from(tableName).delete().gte('id', 0);
    if (error) {
        throw new Error(`Clear failed for ${tableName}: ${error.message}`);
    }
};

const loadSqliteData = async (sqliteDb) => {
    const data = {};
    data.colleges = await sqliteAll(sqliteDb, 'SELECT * FROM colleges ORDER BY id ASC');
    data.departments = await sqliteAll(sqliteDb, 'SELECT * FROM departments ORDER BY id ASC');
    data.lecturers = await sqliteAll(sqliteDb, 'SELECT * FROM lecturers ORDER BY id ASC');
    data.venues = await sqliteAll(sqliteDb, 'SELECT * FROM venues ORDER BY id ASC');
    data.scheduling_rules = await sqliteAll(sqliteDb, 'SELECT * FROM scheduling_rules ORDER BY id ASC');
    data.custom_fields = await sqliteAll(sqliteDb, 'SELECT * FROM custom_fields ORDER BY id ASC');
    data.students = await sqliteAll(sqliteDb, 'SELECT * FROM students ORDER BY id ASC');
    data.student_courses = await sqliteAll(sqliteDb, 'SELECT * FROM student_courses ORDER BY id ASC');
    data.student_results = await sqliteAll(sqliteDb, 'SELECT * FROM student_results ORDER BY id ASC');
    data.timetables = await sqliteAll(sqliteDb, 'SELECT * FROM timetables ORDER BY id ASC');
    data.courses = await sqliteAll(sqliteDb, 'SELECT * FROM courses ORDER BY id ASC');
    return data;
};

const run = async () => {
    const supabase = getSupabaseClient();
    const sqliteDb = await openSqlite(sqlitePath);

    try {
        const source = await loadSqliteData(sqliteDb);

        const clearOrder = [
            'courses',
            'student_results',
            'student_courses',
            'students',
            'custom_fields',
            'timetables',
            'scheduling_rules',
            'venues',
            'lecturers',
            'departments',
            'colleges'
        ];

        for (const tableName of clearOrder) {
            await clearTable(supabase, tableName);
        }

        await insertInChunks(supabase, 'colleges', source.colleges.map((row) => ({
            code: row.code,
            name: row.name,
            is_active: toBoolean(row.is_active),
            created_at: row.created_at || null
        })));

        await insertInChunks(supabase, 'departments', source.departments.map((row) => ({
            code: row.code,
            name: row.name,
            college_code: row.college_code,
            is_active: toBoolean(row.is_active),
            created_at: row.created_at || null
        })));

        await insertInChunks(supabase, 'lecturers', source.lecturers.map((row) => ({
            name: row.name,
            department_code: row.department_code || null,
            email: row.email || null,
            created_at: row.created_at || null
        })));

        await insertInChunks(supabase, 'venues', source.venues.map((row) => ({
            name: row.name,
            college_code: row.college_code || null,
            capacity: row.capacity ?? 0,
            created_at: row.created_at || null
        })));

        await insertInChunks(supabase, 'scheduling_rules', source.scheduling_rules.map((row) => ({
            name: row.name,
            rule_key: row.rule_key,
            rule_value: row.rule_value,
            is_active: toBoolean(row.is_active),
            created_at: row.created_at || null
        })));

        await insertInChunks(supabase, 'custom_fields', source.custom_fields.map((row) => ({
            name: row.name,
            label: row.label,
            type: row.type,
            required: toBoolean(row.required)
        })));

        await insertInChunks(supabase, 'students', source.students.map((row) => ({
            matric_number: row.matric_number,
            name: row.name,
            department: row.department,
            level: row.level
        })));

        await insertInChunks(supabase, 'student_courses', source.student_courses.map((row) => ({
            student_matric: row.student_matric,
            course_code: row.course_code,
            status: row.status
        })));

        await insertInChunks(supabase, 'student_results', source.student_results.map((row) => ({
            student_matric: row.student_matric,
            course_code: row.course_code,
            score: row.score,
            grade: row.grade,
            remarks: row.remarks,
            session: row.session
        })));

        const timetableIdMap = new Map();
        for (const row of source.timetables) {
            const payload = {
                type: row.type,
                name: row.name || null,
                academic_session: row.academic_session || null,
                semester: row.semester || null,
                status: row.status || 'Draft',
                data: parseJson(row.data, { scheduled: [], unscheduled: [] }),
                created_at: row.created_at || null,
                updated_at: row.updated_at || row.created_at || null,
                college: row.college || null
            };

            const { data: inserted, error } = await supabase
                .from('timetables')
                .insert([payload])
                .select('id')
                .single();

            if (error) {
                throw new Error(`Insert failed for timetables: ${error.message}`);
            }

            timetableIdMap.set(Number(row.id), Number(inserted.id));
        }

        const courseRows = source.courses.map((row) => ({
            code: row.code,
            title: row.title,
            college: row.college || null,
            department: row.department,
            level: row.level,
            lecturers: parseJson(row.lecturers, []),
            units: row.units,
            semester: row.semester,
            type: row.type,
            is_compulsory: toBoolean(row.is_compulsory),
            preferred_day: row.preferred_day || null,
            preferred_time: row.preferred_time || null,
            venue: row.venue || null,
            duration: row.duration,
            student_count: row.student_count,
            custom_data: parseJson(row.custom_data, {}),
            timetable_id: row.timetable_id ? (timetableIdMap.get(Number(row.timetable_id)) || null) : null
        }));

        await insertInChunks(supabase, 'courses', courseRows);

        console.log('SQLITE_TO_SUPABASE_IMPORT_OK');
        console.log(JSON.stringify({
            sqlitePath,
            imported: {
                colleges: source.colleges.length,
                departments: source.departments.length,
                lecturers: source.lecturers.length,
                venues: source.venues.length,
                scheduling_rules: source.scheduling_rules.length,
                custom_fields: source.custom_fields.length,
                students: source.students.length,
                student_courses: source.student_courses.length,
                student_results: source.student_results.length,
                timetables: source.timetables.length,
                courses: source.courses.length
            }
        }, null, 2));
    } finally {
        sqliteDb.close();
    }
};

run().catch((error) => {
    console.error('SQLITE_TO_SUPABASE_IMPORT_FAILED');
    console.error(error.message || error);
    process.exit(1);
});
