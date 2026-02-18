const { getSupabaseClient, fetchMany, fetchOne } = require('./helpers');

const getByMatric = async (matricNumber) => {
    const supabase = getSupabaseClient();
    return fetchOne(
        supabase
            .from('students')
            .select('*')
            .eq('matric_number', matricNumber)
            .maybeSingle()
    );
};

const listRegisteredCourses = async (matricNumber) => {
    const supabase = getSupabaseClient();
    return fetchMany(
        supabase
            .from('student_courses')
            .select('*')
            .eq('student_matric', matricNumber)
            .eq('status', 'Registered')
    );
};

const listCarryoverResults = async (matricNumber) => {
    const supabase = getSupabaseClient();
    return fetchMany(
        supabase
            .from('student_results')
            .select('*')
            .eq('student_matric', matricNumber)
            .or('remarks.ilike.%Compulsory Outstanding%,remarks.ilike.%Fail%')
    );
};

const getLatestLectureTimetable = async () => {
    const supabase = getSupabaseClient();
    return fetchOne(
        supabase
            .from('timetables')
            .select('*')
            .eq('type', 'Lecture')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()
    );
};

module.exports = {
    getByMatric,
    listRegisteredCourses,
    listCarryoverResults,
    getLatestLectureTimetable
};
