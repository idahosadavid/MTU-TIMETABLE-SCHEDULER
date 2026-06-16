const { getSupabaseClient, fetchMany, fetchOne } = require('./helpers');

const toJsonValue = (value, fallback) => {
    if (value == null) return fallback;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return fallback; }
    }
    return value;
};

const normalizeRow = (row) => ({
    ...row,
    is_compulsory: row.is_compulsory === true || row.is_compulsory === 1,
    lecturers: toJsonValue(row.lecturers, []),
    custom_data: toJsonValue(row.custom_data, {})
});

const list = async ({ department, level, semester, college } = {}) => {
    const supabase = getSupabaseClient();
    let query = supabase.from('course_catalog').select('*').order('code', { ascending: true });
    if (department) query = query.eq('department', department);
    if (level) query = query.eq('level', level);
    if (semester) query = query.eq('semester', semester);
    if (college) query = query.eq('college', college);
    const rows = await fetchMany(query);
    return rows.map(normalizeRow);
};

const create = async (course) => {
    const supabase = getSupabaseClient();
    const isCompulsory = course.is_compulsory === true || course.is_compulsory === 1 || course.is_compulsory === '1' || course.is_compulsory === 'true';
    const payload = {
        code: course.code,
        title: course.title,
        college: course.college || null,
        department: course.department,
        level: course.level,
        lecturers: Array.isArray(course.lecturers) ? course.lecturers : [],
        units: course.units,
        semester: course.semester,
        type: course.type,
        is_compulsory: isCompulsory,
        preferred_day: course.preferred_day || 'AUTO',
        preferred_time: course.preferred_time || 'AUTO',
        venue: course.venue || '',
        duration: course.duration,
        custom_data: { ...(course.custom_data || {}) }
    };
    const { data, error } = await supabase.from('course_catalog').insert([payload]).select('id').single();
    if (error) throw new Error(error.message || 'Supabase course_catalog insert failed');
    return { lastID: data.id };
};

const getById = async (id) => {
    const supabase = getSupabaseClient();
    const row = await fetchOne(supabase.from('course_catalog').select('*').eq('id', id).single());
    return row ? normalizeRow(row) : null;
};

const update = async (id, course) => {
    const supabase = getSupabaseClient();
    const isCompulsory = course.is_compulsory === true || course.is_compulsory === 1 || course.is_compulsory === '1' || course.is_compulsory === 'true';
    const payload = {
        code: course.code,
        title: course.title,
        college: course.college || null,
        department: course.department,
        level: course.level,
        lecturers: Array.isArray(course.lecturers) ? course.lecturers : [],
        units: course.units,
        semester: course.semester,
        type: course.type,
        is_compulsory: isCompulsory,
        preferred_day: course.preferred_day || 'AUTO',
        preferred_time: course.preferred_time || 'AUTO',
        venue: course.venue || '',
        duration: course.duration,
        custom_data: { ...(course.custom_data || {}) }
    };
    const { error } = await supabase.from('course_catalog').update(payload).eq('id', id);
    if (error) throw new Error(error.message || 'Supabase course_catalog update failed');
    return { changes: 1 };
};

const remove = async (id) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('course_catalog').delete().eq('id', id);
    if (error) throw new Error(error.message || 'Supabase course_catalog delete failed');
    return { changes: 1 };
};

module.exports = { list, create, getById, update, remove };
