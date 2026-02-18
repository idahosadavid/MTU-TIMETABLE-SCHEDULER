if (!process.env.DB_PROVIDER) {
    process.env.DB_PROVIDER = 'supabase';
}

const run = async () => {
    const { repositories } = require('../data/repositories');
    const { getSupabaseClient } = require('../database/supabaseAdapter');
    const { studentsRepo } = repositories;

    const supabase = getSupabaseClient();
    const matric = `SMK-${Date.now()}`;
    const timetableName = `Smoke Student Timetable ${Date.now()}`;

    let timetableId = null;

    try {
        const { data: insertedStudent, error: studentError } = await supabase
            .from('students')
            .insert([{ matric_number: matric, name: 'Smoke Student', department: 'CSC', level: 200 }])
            .select('matric_number')
            .single();
        if (studentError) throw studentError;

        const timetableData = {
            scheduled: [{ code: 'SMK301', day: 'Monday', time: '9:00', duration: 60 }],
            unscheduled: []
        };

        const { data: insertedTimetable, error: timetableError } = await supabase
            .from('timetables')
            .insert([{
                type: 'Lecture',
                name: timetableName,
                academic_session: '2025/2026',
                semester: 'First',
                status: 'Draft',
                college: 'CBAS',
                data: timetableData
            }])
            .select('id')
            .single();
        if (timetableError) throw timetableError;
        timetableId = insertedTimetable.id;

        const { error: regError } = await supabase
            .from('student_courses')
            .insert([{
                student_matric: insertedStudent.matric_number,
                course_code: 'SMK301',
                status: 'Registered'
            }]);
        if (regError) throw regError;

        const { error: resError } = await supabase
            .from('student_results')
            .insert([{
                student_matric: insertedStudent.matric_number,
                course_code: 'SMK999',
                score: 32,
                grade: 'F',
                remarks: 'Compulsory Outstanding',
                session: '2024/2025'
            }]);
        if (resError) throw resError;

        const student = await studentsRepo.getByMatric(insertedStudent.matric_number);
        const registrations = await studentsRepo.listRegisteredCourses(insertedStudent.matric_number);
        const carryovers = await studentsRepo.listCarryoverResults(insertedStudent.matric_number);
        const latestLectureTimetable = await studentsRepo.getLatestLectureTimetable();

        if (!student) throw new Error('studentsRepo.getByMatric returned null');
        if (registrations.length < 1) throw new Error('studentsRepo.listRegisteredCourses returned empty');
        if (carryovers.length < 1) throw new Error('studentsRepo.listCarryoverResults returned empty');
        if (!latestLectureTimetable) throw new Error('studentsRepo.getLatestLectureTimetable returned null');

        console.log('SUPABASE_STUDENTS_REPO_SMOKE_OK');
        console.log(JSON.stringify({
            provider: process.env.DB_PROVIDER,
            matric: insertedStudent.matric_number,
            registrationCount: registrations.length,
            carryoverCount: carryovers.length,
            latestLectureTimetableId: latestLectureTimetable.id
        }, null, 2));
    } finally {
        await supabase.from('student_results').delete().eq('student_matric', matric);
        await supabase.from('student_courses').delete().eq('student_matric', matric);
        await supabase.from('students').delete().eq('matric_number', matric);
        if (timetableId) {
            await supabase.from('timetables').delete().eq('id', timetableId);
        }
    }
};

run().catch((error) => {
    console.error('SUPABASE_STUDENTS_REPO_SMOKE_FAILED');
    console.error(error.message || error);
    process.exit(1);
});
