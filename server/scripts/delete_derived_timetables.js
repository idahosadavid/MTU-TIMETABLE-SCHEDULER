if (!process.env.DB_PROVIDER) {
    process.env.DB_PROVIDER = 'supabase';
}

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { repositories } = require('../data/repositories');
const { timetablesRepo } = repositories;

// Matches names like "Foo - Computer Science" or "Foo - Computer Science - Level 100"
const DERIVED_PATTERN = / - .+ - Level \d+$| - [^-]+$/;

const run = async () => {
    const all = await timetablesRepo.list();

    const derived = all.filter(t => DERIVED_PATTERN.test(t.name));

    if (derived.length === 0) {
        console.log('No derived timetables found.');
        return;
    }

    console.log(`Found ${derived.length} derived timetable(s) to delete:`);
    derived.forEach(t => console.log(`  [${t.id}] ${t.name}`));

    for (const t of derived) {
        await timetablesRepo.deleteById(t.id);
        console.log(`  Deleted: [${t.id}] ${t.name}`);
    }

    console.log('Done.');
};

run().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
