const { getSupabaseClient, fetchMany, fetchOne } = require('./helpers');

// Normalize course row for frontend compatibility
const normalizeCourse = (row) => {
    if (!row) return null;
    return {
        ...row,
        is_compulsory: row.is_compulsory === true || row.is_compulsory === 1 || row.is_compulsory === '1' || row.is_compulsory === 'true',
        lecturers: Array.isArray(row.lecturers) ? row.lecturers : [],
        custom_data: typeof row.custom_data === 'object' ? row.custom_data : {}
    };
};

// Get courses assigned to a specific timetable
const getCoursesByTimetableId = async (timetableId) => {
    const supabase = getSupabaseClient();
    const rows = await fetchMany(
        supabase
            .from('courses')
            .select('*')
            .eq('timetable_id', timetableId)
            .order('code', { ascending: true })
    );
    return rows.map(normalizeCourse);
};

// Get master courses (not assigned to any timetable)
const getMasterCourses = async () => {
    const supabase = getSupabaseClient();
    const query = supabase
        .from('courses')
        .select('*')
        .is('timetable_id', null)
        .order('code', { ascending: true });

    const { data, error } = await query;

    if (error) {
        console.error('Supabase getMasterCourses error:', error);
        throw new Error(error.message || 'Failed to fetch master courses');
    }

    return (data || []).map(normalizeCourse);
};

// Assign a course to a timetable
const assignCourse = async (timetableId, courseId) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('courses')
        .update({ timetable_id: timetableId })
        .eq('id', courseId);

    if (error) throw new Error(error.message || 'Failed to assign course to timetable');
    return { success: true };
};

// Remove a course from a timetable (set timetable_id to null)
const removeCourse = async (timetableId, courseId) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('courses')
        .update({ timetable_id: null })
        .eq('id', courseId)
        .eq('timetable_id', timetableId);

    if (error) throw new Error(error.message || 'Failed to remove course from timetable');
    return { success: true };
};

// Copy courses from another timetable (duplicate them in target)
const copyCoursesFromTimetable = async (targetTimetableId, sourceTimetableId) => {
    const supabase = getSupabaseClient();

    // First, get all courses from source timetable
    const { data: sourceCourses, error: fetchError } = await supabase
        .from('courses')
        .select('*')
        .eq('timetable_id', sourceTimetableId);

    if (fetchError) throw new Error(fetchError.message || 'Failed to fetch source courses');
    if (!sourceCourses || sourceCourses.length === 0) return { copied: 0 };

    // Prepare courses for insertion (remove id, update timetable_id)
    const coursesToInsert = sourceCourses.map(course => {
        const { id, created_at, updated_at, ...courseData } = course;
        return {
            ...courseData,
            timetable_id: targetTimetableId
        };
    });

    // Insert copied courses
    const { error: insertError } = await supabase
        .from('courses')
        .insert(coursesToInsert);

    if (insertError) throw new Error(insertError.message || 'Failed to copy courses');
    return { copied: coursesToInsert.length };
};

// Assign multiple courses at once
const assignCourses = async (timetableId, courseIds) => {
    const supabase = getSupabaseClient();

    const { error } = await supabase
        .from('courses')
        .update({ timetable_id: timetableId })
        .in('id', courseIds);

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
