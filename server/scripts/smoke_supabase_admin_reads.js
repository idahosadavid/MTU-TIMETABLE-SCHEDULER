if (!process.env.DB_PROVIDER) {
    process.env.DB_PROVIDER = 'supabase';
}

const run = async () => {
    const { repositories } = require('../data/repositories');
    const { adminRepo } = repositories;

    const [colleges, departments, lecturers, venues, rules, options] = await Promise.all([
        adminRepo.listColleges(),
        adminRepo.listDepartments(),
        adminRepo.listLecturers(),
        adminRepo.listVenues(),
        adminRepo.listRules(),
        adminRepo.getOptions()
    ]);

    console.log('SUPABASE_ADMIN_READ_SMOKE_OK');
    console.log(JSON.stringify({
        provider: process.env.DB_PROVIDER,
        counts: {
            colleges: colleges.length,
            departments: departments.length,
            lecturers: lecturers.length,
            venues: venues.length,
            rules: rules.length,
            optionsColleges: options.colleges.length,
            optionsDepartments: options.departments.length,
            optionsLecturers: options.lecturers.length,
            optionsVenues: options.venues.length
        }
    }, null, 2));
};

run().catch((error) => {
    console.error('SUPABASE_ADMIN_READ_SMOKE_FAILED');
    console.error(error.message || error);
    process.exit(1);
});
