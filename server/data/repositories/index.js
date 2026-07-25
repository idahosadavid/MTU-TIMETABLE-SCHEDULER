const repositories = {
    coursesRepo: require('./supabase/coursesRepo'),
    timetablesRepo: require('./supabase/timetablesRepo'),
    adminRepo: require('./supabase/adminRepo'),
    studentsRepo: require('./supabase/studentsRepo'),
    customFieldsRepo: require('./supabase/customFieldsRepo'),
    timetableCoursesRepo: require('./supabase/timetableCoursesRepo'),
    auditLogRepo: require('./supabase/auditLogRepo'),
    courseCatalogRepo: require('./supabase/courseCatalogRepo')
};

const STUDENT_DATA_SOURCE = process.env.MTU_STUDENT_DATA_SOURCE || 'db';

if (STUDENT_DATA_SOURCE === 'api') {
    try {
        repositories.studentsRepo = require('./api/studentsRepo');
    } catch {
        console.warn('[Repositories] MTU_STUDENT_DATA_SOURCE=api but ./api/studentsRepo is not available — falling back to the database-backed students repo.');
    }
}

module.exports = { repositories };
