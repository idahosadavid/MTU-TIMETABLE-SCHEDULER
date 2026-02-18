if (!process.env.DB_PROVIDER) {
    process.env.DB_PROVIDER = 'supabase';
}

const run = async () => {
    const { repositories } = require('../data/repositories');
    const { timetablesRepo } = repositories;

    let createdId = null;
    let duplicateId = null;

    try {
        const created = await timetablesRepo.createWithData({
            type: 'Lecture',
            data: { scheduled: [], unscheduled: [] }
        });
        createdId = created.lastID;

        const fetched = await timetablesRepo.getRawById(createdId);
        if (!fetched) throw new Error('Created timetable not found');

        await timetablesRepo.updateMeta(createdId, {
            name: 'Smoke Timetable',
            academic_session: '2025/2026',
            semester: 'First',
            status: 'Draft'
        });

        await timetablesRepo.updateDataById(createdId, { scheduled: [{ code: 'SMK101' }], unscheduled: [] });
        await timetablesRepo.updateGeneratedDataById(createdId, { scheduled: [], unscheduled: [{ code: 'SMK102' }] });

        const latest = await timetablesRepo.getLatestByType('Lecture');
        if (!latest) throw new Error('Latest timetable query returned no row');

        const dup = await timetablesRepo.duplicateById(createdId);
        if (!dup || !dup.lastID) throw new Error('Duplicate timetable failed');
        duplicateId = dup.lastID;

        console.log('SUPABASE_TIMETABLES_REPO_SMOKE_OK');
        console.log(JSON.stringify({
            provider: process.env.DB_PROVIDER,
            createdId,
            duplicateId,
            latestId: latest.id
        }, null, 2));
    } finally {
        if (duplicateId) {
            await timetablesRepo.deleteById(duplicateId);
        }
        if (createdId) {
            await timetablesRepo.deleteById(createdId);
        }
    }
};

run().catch((error) => {
    console.error('SUPABASE_TIMETABLES_REPO_SMOKE_FAILED');
    console.error(error.message || error);
    process.exit(1);
});
