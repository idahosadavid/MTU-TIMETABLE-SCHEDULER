const { allAsync, getAsync, runAsync } = require('./helpers');

const listColleges = () => allAsync('SELECT * FROM colleges ORDER BY code ASC');

const listDepartments = (collegeCode = null) => {
    const sql = collegeCode
        ? 'SELECT * FROM departments WHERE college_code = ? ORDER BY name ASC'
        : 'SELECT * FROM departments ORDER BY name ASC';
    return allAsync(sql, collegeCode ? [collegeCode] : []);
};

const listLecturers = () => allAsync('SELECT * FROM lecturers ORDER BY name ASC');
const listVenues = () => allAsync('SELECT * FROM venues ORDER BY name ASC');
const listRules = () => allAsync('SELECT * FROM scheduling_rules ORDER BY id ASC');
const getActiveCollegeByCode = (code) => getAsync('SELECT code FROM colleges WHERE code = ? AND is_active = 1', [code]);

const createCollege = ({ code, name, is_active = 1 }) =>
    runAsync('INSERT INTO colleges (code, name, is_active) VALUES (?, ?, ?)', [code, name, is_active ? 1 : 0]);

const updateCollege = (id, { code, name, is_active = 1 }) =>
    runAsync('UPDATE colleges SET code = ?, name = ?, is_active = ? WHERE id = ?', [code, name, is_active ? 1 : 0, id]);

const deleteCollege = (id) => runAsync('DELETE FROM colleges WHERE id = ?', [id]);

const createDepartment = ({ code, name, college_code, is_active = 1 }) =>
    runAsync('INSERT INTO departments (code, name, college_code, is_active) VALUES (?, ?, ?, ?)', [code, name, college_code, is_active ? 1 : 0]);

const updateDepartment = (id, { code, name, college_code, is_active = 1 }) =>
    runAsync('UPDATE departments SET code = ?, name = ?, college_code = ?, is_active = ? WHERE id = ?', [code, name, college_code, is_active ? 1 : 0, id]);

const deleteDepartment = (id) => runAsync('DELETE FROM departments WHERE id = ?', [id]);

const createLecturer = ({ name, department_code = null, email = null }) =>
    runAsync('INSERT INTO lecturers (name, department_code, email) VALUES (?, ?, ?)', [name, department_code || null, email]);

const updateLecturer = (id, { name, department_code = null, email = null }) =>
    runAsync('UPDATE lecturers SET name = ?, department_code = ?, email = ? WHERE id = ?', [name, department_code || null, email, id]);

const deleteLecturer = (id) => runAsync('DELETE FROM lecturers WHERE id = ?', [id]);

const createVenue = ({ name, college_code = null, capacity = 0 }) =>
    runAsync('INSERT INTO venues (name, college_code, capacity) VALUES (?, ?, ?)', [name, college_code, Number(capacity || 0)]);

const updateVenue = (id, { name, college_code = null, capacity = 0 }) =>
    runAsync('UPDATE venues SET name = ?, college_code = ?, capacity = ? WHERE id = ?', [name, college_code, Number(capacity || 0), id]);

const deleteVenue = (id) => runAsync('DELETE FROM venues WHERE id = ?', [id]);

const updateRule = (id, { name, rule_key, rule_value, is_active = 1 }) =>
    runAsync('UPDATE scheduling_rules SET name = ?, rule_key = ?, rule_value = ?, is_active = ? WHERE id = ?', [name, rule_key, String(rule_value), is_active ? 1 : 0, id]);

const getOptions = async () => {
    const colleges = await allAsync('SELECT code, name FROM colleges WHERE is_active = 1 ORDER BY code ASC');
    const departments = await allAsync('SELECT code, name, college_code FROM departments WHERE is_active = 1 ORDER BY name ASC');
    const lecturers = await allAsync('SELECT name, department_code FROM lecturers ORDER BY name ASC');
    const venues = await allAsync('SELECT name, college_code, capacity FROM venues ORDER BY name ASC');
    return { colleges, departments, lecturers, venues };
};

module.exports = {
    listColleges,
    listDepartments,
    listLecturers,
    listVenues,
    listRules,
    getActiveCollegeByCode,
    createCollege,
    updateCollege,
    deleteCollege,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    createLecturer,
    updateLecturer,
    deleteLecturer,
    createVenue,
    updateVenue,
    deleteVenue,
    updateRule,
    getOptions
};
