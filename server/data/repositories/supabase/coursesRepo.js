const { getSupabaseClient, fetchMany } = require('./helpers');

const toJsonValue = (value, fallback) => {
	if (value == null) return fallback;
	if (typeof value === 'string') {
		try {
			return JSON.parse(value);
		} catch {
			return fallback;
		}
	}
	return value;
};

const normalizeRowForGeneration = (row) => ({
	...row,
	is_compulsory: row.is_compulsory === true || row.is_compulsory === 1 || row.is_compulsory === '1' || row.is_compulsory === 'true',
	lecturers: toJsonValue(row.lecturers, []),
	custom_data: toJsonValue(row.custom_data, {})
});

const listByTimetableId = async (timetableId) => {
	const supabase = getSupabaseClient();
	const rows = await fetchMany(
		supabase
			.from('courses')
			.select('*')
			.eq('timetable_id', timetableId)
	);
	return rows.map(normalizeRowForGeneration);
};

const list = async ({ timetableId } = {}) => {
	const supabase = getSupabaseClient();
	let query = supabase
		.from('courses')
		.select('*');

	if (timetableId) {
		query = query.eq('timetable_id', timetableId);
	}

	return fetchMany(query);
};

const create = async (course) => {
	const supabase = getSupabaseClient();
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
		is_compulsory: course.is_compulsory === true || course.is_compulsory === 1 || course.is_compulsory === '1' || course.is_compulsory === 'true',
		preferred_day: course.preferred_day || 'AUTO',
		preferred_time: course.preferred_time || 'AUTO',
		venue: course.venue || '',
		duration: course.duration,
		student_count: course.student_count || 0,
		custom_data: course.custom_data || {},
		timetable_id: course.timetable_id
	};

	const { data, error } = await supabase
		.from('courses')
		.insert([payload])
		.select('id')
		.single();

	if (error) throw new Error(error.message || 'Supabase course insert failed');
	return { lastID: data.id };
};

module.exports = { listByTimetableId, list, create };
