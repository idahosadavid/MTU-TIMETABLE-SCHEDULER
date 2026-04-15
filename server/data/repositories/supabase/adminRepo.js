const { getSupabaseClient, fetchMany, fetchOne } = require('./helpers');

const listColleges = async () => {
    const supabase = getSupabaseClient();
    return fetchMany(
        supabase
            .from('colleges')
            .select('*')
            .order('code', { ascending: true })
    );
};

const listDepartments = async (collegeCode = null) => {
    const supabase = getSupabaseClient();
    let query = supabase
        .from('departments')
        .select('*')
        .order('name', { ascending: true });

    if (collegeCode) {
        query = query.eq('college_code', collegeCode);
    }

    return fetchMany(query);
};

const listLecturers = async () => {
    const supabase = getSupabaseClient();
    return fetchMany(
        supabase
            .from('lecturers')
            .select('*')
            .order('name', { ascending: true })
    );
};

const listVenues = async () => {
    const supabase = getSupabaseClient();
    return fetchMany(
        supabase
            .from('venues')
            .select('*')
            .order('name', { ascending: true })
    );
};

const listRules = async () => {
    const supabase = getSupabaseClient();
    return fetchMany(
        supabase
            .from('scheduling_rules')
            .select('*')
            .order('id', { ascending: true })
    );
};

const getActiveCollegeByCode = async (code) => {
    const supabase = getSupabaseClient();
    return fetchOne(
        supabase
            .from('colleges')
            .select('code')
            .eq('code', code)
            .eq('is_active', true)
            .maybeSingle()
    );
};

const createCollege = async ({ code, name, is_active = 1 }) => {
    const supabase = getSupabaseClient();
    const payload = { code, name, is_active: !!is_active };
    const { data, error } = await supabase
        .from('colleges')
        .insert([payload])
        .select('id')
        .single();

    if (error) throw new Error(error.message || 'Supabase createCollege failed');
    return { lastID: data.id };
};

const updateCollege = async (id, { code, name, is_active = 1 }) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('colleges')
        .update({ code, name, is_active: !!is_active })
        .eq('id', id);

    if (error) throw new Error(error.message || 'Supabase updateCollege failed');
    return { changes: 1 };
};

const deleteCollege = async (id) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('colleges')
        .delete()
        .eq('id', id);

    if (error) throw new Error(error.message || 'Supabase deleteCollege failed');
    return { changes: 1 };
};

const createDepartment = async ({ code, name, college_code, is_active = 1 }) => {
    if (!college_code) throw new Error('A college must be selected for the department.');
    const supabase = getSupabaseClient();
    const payload = { code, name, college_code, is_active: !!is_active };
    const { data, error } = await supabase
        .from('departments')
        .insert([payload])
        .select('id')
        .single();

    if (error) throw new Error(error.message || 'Supabase createDepartment failed');
    return { lastID: data.id };
};

const updateDepartment = async (id, { code, name, college_code, is_active = 1 }) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('departments')
        .update({ code, name, college_code, is_active: !!is_active })
        .eq('id', id);

    if (error) throw new Error(error.message || 'Supabase updateDepartment failed');
    return { changes: 1 };
};

const deleteDepartment = async (id) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', id);

    if (error) throw new Error(error.message || 'Supabase deleteDepartment failed');
    return { changes: 1 };
};

const createLecturer = async ({ name, department_code = null, email = null }) => {
    const supabase = getSupabaseClient();
    const payload = { name, department_code: department_code || null, email };
    const { data, error } = await supabase
        .from('lecturers')
        .insert([payload])
        .select('id')
        .single();

    if (error) throw new Error(error.message || 'Supabase createLecturer failed');
    return { lastID: data.id };
};

const updateLecturer = async (id, { name, department_code = null, email = null }) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('lecturers')
        .update({ name, department_code: department_code || null, email })
        .eq('id', id);

    if (error) throw new Error(error.message || 'Supabase updateLecturer failed');
    return { changes: 1 };
};

const deleteLecturer = async (id) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('lecturers')
        .delete()
        .eq('id', id);

    if (error) throw new Error(error.message || 'Supabase deleteLecturer failed');
    return { changes: 1 };
};

const createVenue = async ({ name, college_code = null, capacity = 0 }) => {
    const supabase = getSupabaseClient();
    const payload = { name, college_code: college_code || null, capacity: Number(capacity || 0) };
    const { data, error } = await supabase
        .from('venues')
        .insert([payload])
        .select('id')
        .single();

    if (error) throw new Error(error.message || 'Supabase createVenue failed');
    return { lastID: data.id };
};

const updateVenue = async (id, { name, college_code = null, capacity = 0 }) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('venues')
        .update({ name, college_code, capacity: Number(capacity || 0) })
        .eq('id', id);

    if (error) throw new Error(error.message || 'Supabase updateVenue failed');
    return { changes: 1 };
};

const deleteVenue = async (id) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('venues')
        .delete()
        .eq('id', id);

    if (error) throw new Error(error.message || 'Supabase deleteVenue failed');
    return { changes: 1 };
};

const updateRule = async (id, { name, rule_key, rule_value, is_active = 1 }) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('scheduling_rules')
        .update({ name, rule_key, rule_value: String(rule_value), is_active: !!is_active })
        .eq('id', id);

    if (error) throw new Error(error.message || 'Supabase updateRule failed');
    return { changes: 1 };
};
const getOptions = async () => {
    const supabase = getSupabaseClient();

    const [colleges, departments, lecturers, venues] = await Promise.all([
        fetchMany(
            supabase
                .from('colleges')
                .select('code, name')
                .eq('is_active', true)
                .order('code', { ascending: true })
        ),
        fetchMany(
            supabase
                .from('departments')
                .select('code, name, college_code')
                .eq('is_active', true)
                .order('name', { ascending: true })
        ),
        fetchMany(
            supabase
                .from('lecturers')
                .select('name, department_code')
                .order('name', { ascending: true })
        ),
        fetchMany(
            supabase
                .from('venues')
                .select('name, college_code, capacity')
                .order('name', { ascending: true })
        )
    ]);

    return { colleges, departments, lecturers, venues };
};

module.exports = {
    listColleges,
    listDepartments,
    listLecturers,
    listVenues,
    listRules,
    getActiveCollegeByCode,
    createCollege,
    updateCollege,
    deleteCollege,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    createLecturer,
    updateLecturer,
    deleteLecturer,
    createVenue,
    updateVenue,
    deleteVenue,
    updateRule,
    getOptions
};
