if (!process.env.DB_PROVIDER) {
    process.env.DB_PROVIDER = 'supabase';
}

const run = async () => {
    const { repositories } = require('../data/repositories');
    const { getSupabaseClient } = require('../database/supabaseAdapter');
    const { adminRepo } = repositories;

    const supabase = getSupabaseClient();
    const stamp = Date.now();

    let collegeId = null;
    let departmentId = null;
    let lecturerId = null;
    let venueId = null;
    let ruleId = null;

    const collegeCode = `SMK${String(stamp).slice(-6)}`;
    const departmentCode = `SD${String(stamp).slice(-6)}`;

    try {
        const college = await adminRepo.createCollege({
            code: collegeCode,
            name: 'Smoke College',
            is_active: 1
        });
        collegeId = college.lastID;

        await adminRepo.updateCollege(collegeId, {
            code: collegeCode,
            name: 'Smoke College Updated',
            is_active: 1
        });

        const department = await adminRepo.createDepartment({
            code: departmentCode,
            name: 'Smoke Department',
            college_code: collegeCode,
            is_active: 1
        });
        departmentId = department.lastID;

        await adminRepo.updateDepartment(departmentId, {
            code: departmentCode,
            name: 'Smoke Department Updated',
            college_code: collegeCode,
            is_active: 1
        });

        const lecturer = await adminRepo.createLecturer({
            name: 'Smoke Lecturer',
            department_code: departmentCode,
            email: 'smoke@example.com'
        });
        lecturerId = lecturer.lastID;

        await adminRepo.updateLecturer(lecturerId, {
            name: 'Smoke Lecturer Updated',
            department_code: departmentCode,
            email: 'smoke2@example.com'
        });

        const venue = await adminRepo.createVenue({
            name: `Smoke Venue ${stamp}`,
            college_code: collegeCode,
            capacity: 55
        });
        venueId = venue.lastID;

        await adminRepo.updateVenue(venueId, {
            name: `Smoke Venue ${stamp} Updated`,
            college_code: collegeCode,
            capacity: 66
        });

        const ruleKey = `smoke_rule_${stamp}`;
        const { data: insertedRule, error: ruleInsertError } = await supabase
            .from('scheduling_rules')
            .insert([{
                name: 'Smoke Rule',
                rule_key: ruleKey,
                rule_value: '1',
                is_active: true
            }])
            .select('id')
            .single();

        if (ruleInsertError) throw ruleInsertError;
        ruleId = insertedRule.id;

        await adminRepo.updateRule(ruleId, {
            name: 'Smoke Rule Updated',
            rule_key: ruleKey,
            rule_value: '2',
            is_active: 0
        });

        console.log('SUPABASE_ADMIN_WRITES_SMOKE_OK');
        console.log(JSON.stringify({
            provider: process.env.DB_PROVIDER,
            ids: { collegeId, departmentId, lecturerId, venueId, ruleId }
        }, null, 2));
    } finally {
        if (ruleId) await supabase.from('scheduling_rules').delete().eq('id', ruleId);
        if (lecturerId) await adminRepo.deleteLecturer(lecturerId);
        if (venueId) await adminRepo.deleteVenue(venueId);
        if (departmentId) await adminRepo.deleteDepartment(departmentId);
        if (collegeId) await adminRepo.deleteCollege(collegeId);
    }
};

run().catch((error) => {
    console.error('SUPABASE_ADMIN_WRITES_SMOKE_FAILED');
    console.error(error.message || error);
    process.exit(1);
});
