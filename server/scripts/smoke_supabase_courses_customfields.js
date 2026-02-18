if (!process.env.DB_PROVIDER) {
    process.env.DB_PROVIDER = 'supabase';
}

const run = async () => {
    const { repositories } = require('../data/repositories');
    const { timetablesRepo, coursesRepo, customFieldsRepo } = repositories;

    let timetableId = null;
    let customFieldId = null;

    try {
        const createdTimetable = await timetablesRepo.createWithData({
            type: 'Lecture',
            data: { scheduled: [], unscheduled: [] }
        });
        timetableId = createdTimetable.lastID;

        const insertedCourse = await coursesRepo.create({
            code: 'SMK201',
            title: 'Smoke Course',
            college: null,
            department: 'CSC',
            level: 200,
            lecturers: ['Smoke Lecturer'],
            units: 2,
            semester: 'First',
            type: 'Lecture',
            preferred_day: 'AUTO',
            preferred_time: 'AUTO',
            venue: 'Unassigned',
            duration: 60,
            student_count: 20,
            custom_data: { smoke: true },
            timetable_id: timetableId
        });

        const courseRows = await coursesRepo.list({ timetableId });
        const generationRows = await coursesRepo.listByTimetableId(timetableId);

        if (!insertedCourse.lastID) throw new Error('Course insert did not return lastID');
        if (courseRows.length < 1) throw new Error('Course list did not return inserted course');
        if (!Array.isArray(generationRows[0]?.lecturers)) throw new Error('Generation row normalization failed');

        const createdField = await customFieldsRepo.create({
            name: 'smoke_flag',
            label: 'Smoke Flag',
            type: 'boolean',
            required: false
        });
        customFieldId = createdField.id;

        const customFields = await customFieldsRepo.list();
        if (!customFields.some(field => Number(field.id) === Number(customFieldId))) {
            throw new Error('Custom field list did not include inserted field');
        }

        console.log('SUPABASE_COURSES_CUSTOMFIELDS_SMOKE_OK');
        console.log(JSON.stringify({
            provider: process.env.DB_PROVIDER,
            timetableId,
            insertedCourseId: insertedCourse.lastID,
            customFieldId,
            courseCountForTimetable: courseRows.length
        }, null, 2));
    } finally {
        if (customFieldId) {
            await customFieldsRepo.deleteById(customFieldId);
        }
        if (timetableId) {
            await timetablesRepo.deleteById(timetableId);
        }
    }
};

run().catch((error) => {
    console.error('SUPABASE_COURSES_CUSTOMFIELDS_SMOKE_FAILED');
    console.error(error.message || error);
    process.exit(1);
});
