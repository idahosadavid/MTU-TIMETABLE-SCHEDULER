const { allAsync, getAsync, runAsync } = require('./helpers');

const toRow = (course) => ({
    ...course,
    is_compulsory: course.is_compulsory === true || course.is_compulsory === 1 || course.is_compulsory === '1' || course.is_compulsory === 'true' ? 1 : 0,
    lecturers: JSON.stringify(Array.isArray(course.lecturers) ? course.lecturers : []),
    custom_data: JSON.stringify(course.custom_data || {})
});

const fromRow = (row) => ({
    ...row,
    is_compulsory: row.is_compulsory === 1 || row.is_compulsory === true,
    lecturers: row.lecturers ? JSON.parse(row.lecturers) : [],
    custom_data: row.custom_data ? JSON.parse(row.custom_data) : {}
});

const listByTimetableId = async (timetableId) => {
    const rows = await allAsync('SELECT * FROM courses WHERE timetable_id = ?', [timetableId]);
    return rows.map(fromRow);
};

const list = async ({ timetableId } = {}) => {
    let sql = 'SELECT * FROM courses';
    const params = [];
    if (timetableId) {
        sql += ' WHERE timetable_id = ?';
        params.push(timetableId);
    }
    const rows = await allAsync(sql, params);
    return rows.map(fromRow);
};

const create = async (course) => {
    const item = toRow(course);
    const sql = `INSERT INTO courses (code, title, college, department, level, lecturers, units, semester, type, is_compulsory, preferred_day, preferred_time, venue, duration, custom_data, timetable_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
        item.code,
        item.title,
        item.college || null,
        item.department,
        item.level,
        item.lecturers,
        item.units,
        item.semester,
        item.type,
        item.is_compulsory,
        item.preferred_day || 'AUTO',
        item.preferred_time || 'AUTO',
        item.venue || '',
        item.duration,
        item.custom_data,
        item.timetable_id
    ];

    return runAsync(sql, params);
};

const getById = async (id) => {
    const row = await getAsync('SELECT * FROM courses WHERE id = ?', [id]);
    return row ? fromRow(row) : null;
};

const update = async (id, course) => {
    const item = toRow(course);
    const sql = `UPDATE courses SET
        code = ?, title = ?, college = ?, department = ?, level = ?, lecturers = ?, units = ?,
        semester = ?, type = ?, is_compulsory = ?, preferred_day = ?, preferred_time = ?,
        venue = ?, duration = ?, custom_data = ?, timetable_id = ?
        WHERE id = ?`;
    const params = [
        item.code,
        item.title,
        item.college || null,
        item.department,
        item.level,
        item.lecturers,
        item.units,
        item.semester,
        item.type,
        item.is_compulsory,
        item.preferred_day || 'AUTO',
        item.preferred_time || 'AUTO',
        item.venue || '',
        item.duration,
        item.custom_data,
        item.timetable_id,
        id
    ];
    return runAsync(sql, params);
};

const remove = async (id) => {
    return runAsync('DELETE FROM courses WHERE id = ?', [id]);
};

module.exports = { listByTimetableId, list, create, getById, update, remove };
