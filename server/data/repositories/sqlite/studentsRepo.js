const { allAsync, getAsync } = require('./helpers');

const getByMatric = (matricNumber) => getAsync('SELECT * FROM students WHERE matric_number = ?', [matricNumber]);

const listRegisteredCourses = (matricNumber) =>
    allAsync("SELECT * FROM student_courses WHERE student_matric = ? AND status = 'Registered'", [matricNumber]);

const listCarryoverResults = (matricNumber) =>
    allAsync("SELECT * FROM student_results WHERE student_matric = ? AND (remarks LIKE '%Compulsory Outstanding%' OR remarks LIKE '%Fail%')", [matricNumber]);

const getLatestLectureTimetable = () => getAsync("SELECT * FROM timetables WHERE type = 'Lecture' ORDER BY updated_at DESC LIMIT 1", []);

module.exports = {
    getByMatric,
    listRegisteredCourses,
    listCarryoverResults,
    getLatestLectureTimetable
};
