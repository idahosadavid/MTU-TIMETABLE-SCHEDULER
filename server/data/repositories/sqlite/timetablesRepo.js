const { allAsync, getAsync, runAsync } = require('./helpers');

const list = async ({ college } = {}) => {
    const sql = college
        ? 'SELECT id, type, name, academic_session, semester, status, college, created_at, updated_at FROM timetables WHERE college = ? ORDER BY updated_at DESC'
        : 'SELECT id, type, name, academic_session, semester, status, college, created_at, updated_at FROM timetables ORDER BY updated_at DESC';
    return allAsync(sql, college ? [college] : []);
};

const getById = async (id) => {
    const row = await getAsync('SELECT * FROM timetables WHERE id = ?', [id]);
    if (!row) return null;
    return {
        ...row,
        data: row.data ? JSON.parse(row.data) : { scheduled: [], unscheduled: [] }
    };
};

const getRawById = (id) => getAsync('SELECT * FROM timetables WHERE id = ?', [id]);

const create = async ({ type, name, academic_session, semester, college }) => {
    const data = JSON.stringify({ scheduled: [], unscheduled: [] });
    const result = await runAsync(
        'INSERT INTO timetables (type, name, academic_session, semester, college, data) VALUES (?, ?, ?, ?, ?, ?)',
        [type, name, academic_session, semester, college, data]
    );
    return getById(result.lastID);
};

const createWithData = ({ type, name, academic_session, semester, college, status = 'Draft', data }) =>
    runAsync(
        'INSERT INTO timetables (type, name, academic_session, semester, status, college, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [type, name, academic_session, semester, status, college, data]
    );

const updateMeta = async (id, { name, academic_session, semester, status }) => {
    await runAsync(
        'UPDATE timetables SET name = ?, academic_session = ?, semester = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [name, academic_session, semester, status, id]
    );
    return getById(id);
};

const deleteById = async (id) => runAsync('DELETE FROM timetables WHERE id = ?', [id]);

const duplicateById = async (id) => {
    const row = await getRawById(id);
    if (!row) return null;

    const newName = `${row.name} (Copy)`;
    const result = await runAsync(
        'INSERT INTO timetables (type, name, academic_session, semester, status, data) VALUES (?, ?, ?, ?, ?, ?)',
        [row.type, newName, row.academic_session, row.semester, 'Draft', row.data]
    );
    return result;
};

const getLatestByType = (type) => getAsync('SELECT * FROM timetables WHERE type = ? ORDER BY id DESC LIMIT 1', [type]);

const updateDataById = (id, data) =>
    runAsync('UPDATE timetables SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [data, id]);

const updateGeneratedDataById = (id, data) =>
    runAsync("UPDATE timetables SET data = ?, status = 'Draft', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [data, id]);

module.exports = {
    list,
    getById,
    getRawById,
    create,
    createWithData,
    updateMeta,
    updateDataById,
    updateGeneratedDataById,
    deleteById,
    duplicateById,
    getLatestByType
};
