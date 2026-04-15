const { getSupabaseClient, fetchMany, fetchOne } = require('./helpers');

// --- Read ---

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

// --- Write (JIT provisioning) ---

/**
 * Upsert a student record.
 */
const upsertStudent = async ({ matric_number, name, department, level }) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('students')
        .upsert({ matric_number, name, department, level: Number(level) }, { onConflict: 'matric_number' });
    if (error) throw new Error(error.message);
};

/**
 * Replace all registered course records for a student.
 * @param {string} matric_number
 * @param {{ course_code: string, status: string }[]} courses
 */
const upsertStudentCourses = async (matric_number, courses) => {
    const supabase = getSupabaseClient();
    const { error: delError } = await supabase
        .from('student_courses')
        .delete()
        .eq('student_matric', matric_number);
    if (delError) throw new Error(delError.message);

    if (courses.length === 0) return;
    const rows = courses.map(c => ({
        student_matric: matric_number,
        course_code: c.course_code,
        status: c.status || 'Registered'
    }));
    const { error: insError } = await supabase.from('student_courses').insert(rows);
    if (insError) throw new Error(insError.message);
};

/**
 * Replace all result records for a student.
 * @param {string} matric_number
 * @param {{ course_code: string, score: number|null, grade: string, remarks: string, session: string }[]} results
 */
const upsertStudentResults = async (matric_number, results) => {
    const supabase = getSupabaseClient();
    const { error: delError } = await supabase
        .from('student_results')
        .delete()
        .eq('student_matric', matric_number);
    if (delError) throw new Error(delError.message);

    if (results.length === 0) return;
    const rows = results.map(r => ({
        student_matric: matric_number,
        course_code: r.course_code,
        score: r.score ?? null,
        grade: r.grade || '',
        remarks: r.remarks || '',
        session: r.session || ''
    }));
    const { error: insError } = await supabase.from('student_results').insert(rows);
    if (insError) throw new Error(insError.message);
};

module.exports = {
    getByMatric,
    listRegisteredCourses,
    listCarryoverResults,
    getLatestLectureTimetable,
    upsertStudent,
    upsertStudentCourses,
    upsertStudentResults
};
