const { allAsync, getAsync, runAsync } = require('./helpers');

// --- Read ---

const getByMatric = (matricNumber) =>
    getAsync('SELECT * FROM students WHERE matric_number = ?', [matricNumber]);

const listRegisteredCourses = (matricNumber) =>
    allAsync("SELECT * FROM student_courses WHERE student_matric = ? AND status = 'Registered'", [matricNumber]);

const listCarryoverResults = (matricNumber) =>
    allAsync("SELECT * FROM student_results WHERE student_matric = ? AND (remarks LIKE '%Compulsory Outstanding%' OR remarks LIKE '%Fail%')", [matricNumber]);

const getLatestLectureTimetable = () =>
    getAsync("SELECT * FROM timetables WHERE type = 'Lecture' ORDER BY updated_at DESC LIMIT 1", []);

// --- Write (JIT provisioning) ---

/**
 * Insert or replace a student record.
 */
const upsertStudent = ({ matric_number, name, department, level }) =>
    runAsync(
        'INSERT OR REPLACE INTO students (matric_number, name, department, level) VALUES (?, ?, ?, ?)',
        [matric_number, name, department, Number(level)]
    );

/**
 * Replace all registered course records for a student.
 * @param {string} matric_number
 * @param {{ course_code: string, status: string }[]} courses
 */
const upsertStudentCourses = async (matric_number, courses) => {
    await runAsync('DELETE FROM student_courses WHERE student_matric = ?', [matric_number]);
    for (const c of courses) {
        await runAsync(
            'INSERT INTO student_courses (student_matric, course_code, status) VALUES (?, ?, ?)',
            [matric_number, c.course_code, c.status || 'Registered']
        );
    }
};

/**
 * Replace all result records for a student.
 * @param {string} matric_number
 * @param {{ course_code: string, score: number|null, grade: string, remarks: string, session: string }[]} results
 */
const upsertStudentResults = async (matric_number, results) => {
    await runAsync('DELETE FROM student_results WHERE student_matric = ?', [matric_number]);
    for (const r of results) {
        await runAsync(
            'INSERT INTO student_results (student_matric, course_code, score, grade, remarks, session) VALUES (?, ?, ?, ?, ?, ?)',
            [matric_number, r.course_code, r.score ?? null, r.grade || '', r.remarks || '', r.session || '']
        );
    }
};

module.exports = {
    getByMatric,
    listRegisteredCourses,
    listCarryoverResults,
    getLatestLectureTimetable,
    upsertStudent,
    upsertStudentCourses,
    upsertStudentResults
};
