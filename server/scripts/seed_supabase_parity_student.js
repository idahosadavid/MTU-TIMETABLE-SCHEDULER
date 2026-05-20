require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

if (!process.env.DB_PROVIDER) {
    process.env.DB_PROVIDER = 'supabase';
}

const { getSupabaseClient } = require('../database/supabaseAdapter');

const matric = process.env.PARITY_SEED_MATRIC || 'PARITY/TEST/001';
const studentName = process.env.PARITY_SEED_NAME || 'Parity Test Student';
const department = process.env.PARITY_SEED_DEPARTMENT || 'CSC';
const level = Number(process.env.PARITY_SEED_LEVEL || 200);
const registeredCourse = process.env.PARITY_SEED_REGISTERED_COURSE || 'PAR201';
const carryoverCourse = process.env.PARITY_SEED_CARRYOVER_COURSE || 'PAR099';

const run = async () => {
    const supabase = getSupabaseClient();

    const { error: upsertStudentError } = await supabase
        .from('students')
        .upsert([
            {
                matric_number: matric,
                name: studentName,
                department,
                level
            }
        ], { onConflict: 'matric_number' });

    if (upsertStudentError) {
        throw new Error(`Failed to upsert student: ${upsertStudentError.message}`);
    }

    const { error: deleteCoursesError } = await supabase
        .from('student_courses')
        .delete()
        .eq('student_matric', matric);

    if (deleteCoursesError) {
        throw new Error(`Failed to reset student courses: ${deleteCoursesError.message}`);
    }

    const { error: insertCoursesError } = await supabase
        .from('student_courses')
        .insert([
            {
                student_matric: matric,
                course_code: registeredCourse,
                status: 'Registered'
            }
        ]);

    if (insertCoursesError) {
        throw new Error(`Failed to insert student courses: ${insertCoursesError.message}`);
    }

    const { error: deleteResultsError } = await supabase
        .from('student_results')
        .delete()
        .eq('student_matric', matric);

    if (deleteResultsError) {
        throw new Error(`Failed to reset student results: ${deleteResultsError.message}`);
    }

    const { error: insertResultsError } = await supabase
        .from('student_results')
        .insert([
            {
                student_matric: matric,
                course_code: carryoverCourse,
                score: 35,
                grade: 'F',
                remarks: 'Compulsory Outstanding',
                session: '2024/2025'
            }
        ]);

    if (insertResultsError) {
        throw new Error(`Failed to insert student results: ${insertResultsError.message}`);
    }

    const timetablePayload = {
        scheduled: [
            {
                code: registeredCourse,
                title: 'Parity Registered Course',
                department,
                level,
                semester: 'First',
                day: 'Monday',
                time: '10:00',
                duration: 60,
                venue: 'Parity Hall'
            },
            {
                code: carryoverCourse,
                title: 'Parity Carryover Course',
                department,
                level,
                semester: 'First',
                day: 'Tuesday',
                time: '11:00',
                duration: 60,
                venue: 'Parity Hall'
            }
        ],
        unscheduled: []
    };

    const { error: insertTimetableError } = await supabase
        .from('timetables')
        .insert([
            {
                type: 'Lecture',
                name: `Parity Seed Timetable ${Date.now()}`,
                academic_session: '2025/2026',
                semester: 'First',
                status: 'Draft',
                college: 'CBAS',
                data: timetablePayload
            }
        ]);

    if (insertTimetableError) {
        throw new Error(`Failed to insert lecture timetable: ${insertTimetableError.message}`);
    }

    console.log('SUPABASE_PARITY_STUDENT_SEEDED');
    console.log(JSON.stringify({
        matric,
        registeredCourse,
        carryoverCourse,
        note: 'Use this matric for parity checks: PARITY_STUDENT_MATRIC'
    }, null, 2));
};

run().catch((error) => {
    console.error('SUPABASE_PARITY_STUDENT_SEED_FAILED');
    console.error(error.message || error);
    process.exit(1);
});
