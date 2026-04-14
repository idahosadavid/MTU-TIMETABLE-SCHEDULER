const { DB_PROVIDER } = require('../../database/schema');

const sqliteRepos = {
    coursesRepo: require('./sqlite/coursesRepo'),
    timetablesRepo: require('./sqlite/timetablesRepo'),
    adminRepo: require('./sqlite/adminRepo'),
    studentsRepo: require('./sqlite/studentsRepo'),
    customFieldsRepo: require('./sqlite/customFieldsRepo')
};

const supabaseRepos = {
    coursesRepo: require('./supabase/coursesRepo'),
    timetablesRepo: require('./supabase/timetablesRepo'),
    adminRepo: require('./supabase/adminRepo'),
    studentsRepo: require('./supabase/studentsRepo'),
    customFieldsRepo: require('./supabase/customFieldsRepo')
};

const repositories = DB_PROVIDER === 'supabase' ? supabaseRepos : sqliteRepos;

// Conditional override for live MTU portal integration
const STUDENT_DATA_SOURCE = process.env.MTU_STUDENT_DATA_SOURCE || 'db';

if (STUDENT_DATA_SOURCE === 'api') {
    repositories.studentsRepo = require('./api/studentsRepo');
}

module.exports = { repositories };
