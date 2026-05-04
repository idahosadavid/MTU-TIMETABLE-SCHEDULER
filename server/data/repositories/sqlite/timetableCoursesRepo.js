const { allAsync, runAsync } = require('./helpers');

// Get courses assigned to a specific timetable
const getCoursesByTimetableId = async (timetableId) => {
    const sql = `
        SELECT c.* FROM courses c
        INNER JOIN timetable_courses tc ON c.id = tc.course_id
        WHERE tc.timetable_id = ?
        ORDER BY c.code
    `;
    const rows = await allAsync(sql, [timetableId]);
    return rows.map(row => ({
        ...row,
        is_compulsory: row.is_compulsory === 1 || row.is_compulsory === true,
        lecturers: row.lecturers ? JSON.parse(row.lecturers) : [],
        custom_data: row.custom_data ? JSON.parse(row.custom_data) : {}
    }));
};

// Get master courses (not assigned to any timetable)
const getMasterCourses = async () => {
    const sql = `
        SELECT c.* FROM courses c
        LEFT JOIN timetable_courses tc ON c.id = tc.course_id
        WHERE tc.id IS NULL
        ORDER BY c.code
    `;
    const rows = await allAsync(sql, []);
    return rows.map(row => ({
        ...row,
        is_compulsory: row.is_compulsory === 1 || row.is_compulsory === true,
        lecturers: row.lecturers ? JSON.parse(row.lecturers) : [],
        custom_data: row.custom_data ? JSON.parse(row.custom_data) : {}
    }));
};

// Assign a course to a timetable
const assignCourse = async (timetableId, courseId) => {
    const sql = `INSERT OR IGNORE INTO timetable_courses (timetable_id, course_id) VALUES (?, ?)`;
    return runAsync(sql, [timetableId, courseId]);
};

// Remove a course from a timetable
const removeCourse = async (timetableId, courseId) => {
    const sql = `DELETE FROM timetable_courses WHERE timetable_id = ? AND course_id = ?`;
    return runAsync(sql, [timetableId, courseId]);
};

// Copy courses from another timetable
const copyCoursesFromTimetable = async (targetTimetableId, sourceTimetableId) => {
    const sql = `
        INSERT OR IGNORE INTO timetable_courses (timetable_id, course_id)
        SELECT ?, course_id FROM timetable_courses WHERE timetable_id = ?
    `;
    return runAsync(sql, [targetTimetableId, sourceTimetableId]);
};

// Assign multiple courses at once
const assignCourses = async (timetableId, courseIds) => {
    const placeholders = courseIds.map(() => '(?, ?)').join(', ');
    const params = courseIds.flatMap(id => [timetableId, id]);
    const sql = `INSERT OR IGNORE INTO timetable_courses (timetable_id, course_id) VALUES ${placeholders}`;
    return runAsync(sql, params);
};

module.exports = {
    getCoursesByTimetableId,
    getMasterCourses,
    assignCourse,
    removeCourse,
    copyCoursesFromTimetable,
    assignCourses
};
