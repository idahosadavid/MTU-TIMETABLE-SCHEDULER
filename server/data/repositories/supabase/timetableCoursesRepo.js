const { getSupabaseClient, fetchMany } = require('./helpers');

const normalizeCourse = (row) => {
    if (!row) return null;
    return {
        ...row,
        is_compulsory: row.is_compulsory === true || row.is_compulsory === 1 || row.is_compulsory === '1' || row.is_compulsory === 'true',
        lecturers: Array.isArray(row.lecturers) ? row.lecturers : [],
        custom_data: typeof row.custom_data === 'object' ? row.custom_data : {}
    };
};

// Get courses assigned to a specific timetable (via junction table)
const getCoursesByTimetableId = async (timetableId) => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('timetable_courses')
        .select('courses(*)')
        .eq('timetable_id', timetableId);
    if (error) throw new Error(error.message || 'Failed to fetch timetable courses');
    return (data || []).map(row => normalizeCourse(row.courses)).filter(Boolean);
};

// Get ALL master courses — pool is never depleted by assignments
const getMasterCourses = async () => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('courses')
        .select('*')
        .order('code', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to fetch master courses');
    return (data || []).map(normalizeCourse);
};

// Assign a course to a timetable (insert into junction table, ignore duplicates)
const assignCourse = async (timetableId, courseId) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('timetable_courses')
        .upsert({ timetable_id: timetableId, course_id: courseId }, { onConflict: 'timetable_id,course_id' });
    if (error) throw new Error(error.message || 'Failed to assign course to timetable');
    return { success: true };
};

// Remove a course from a timetable (delete from junction table)
const removeCourse = async (timetableId, courseId) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('timetable_courses')
        .delete()
        .eq('timetable_id', timetableId)
        .eq('course_id', courseId);
    if (error) throw new Error(error.message || 'Failed to remove course from timetable');
    return { success: true };
};

// Copy course assignments from one timetable to another
const copyCoursesFromTimetable = async (targetTimetableId, sourceTimetableId) => {
    const supabase = getSupabaseClient();
    const { data: sourceLinks, error: fetchError } = await supabase
        .from('timetable_courses')
        .select('course_id')
        .eq('timetable_id', sourceTimetableId);
    if (fetchError) throw new Error(fetchError.message || 'Failed to fetch source courses');
    if (!sourceLinks || sourceLinks.length === 0) return { copied: 0 };

    const toInsert = sourceLinks.map(row => ({ timetable_id: targetTimetableId, course_id: row.course_id }));
    const { error: insertError } = await supabase
        .from('timetable_courses')
        .upsert(toInsert, { onConflict: 'timetable_id,course_id' });
    if (insertError) throw new Error(insertError.message || 'Failed to copy courses');
    return { copied: toInsert.length };
};

// Assign multiple courses at once
const assignCourses = async (timetableId, courseIds) => {
    const supabase = getSupabaseClient();
    const toInsert = courseIds.map(id => ({ timetable_id: timetableId, course_id: id }));
    const { error } = await supabase
        .from('timetable_courses')
        .upsert(toInsert, { onConflict: 'timetable_id,course_id' });
    if (error) throw new Error(error.message || 'Failed to assign courses to timetable');
    return { success: true, count: courseIds.length };
};

module.exports = {
    getCoursesByTimetableId,
    getMasterCourses,
    assignCourse,
    removeCourse,
    copyCoursesFromTimetable,
    assignCourses
};
