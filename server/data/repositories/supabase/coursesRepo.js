const { getSupabaseClient, fetchMany, fetchOne } = require('./helpers');

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

const normalizeRowForGeneration = (row) => {
	const custom_data = toJsonValue(row.custom_data, {});
	// is_compulsory may be stored in custom_data if the DB column doesn't exist
	const is_compulsory =
		row.is_compulsory === true || row.is_compulsory === 1 || row.is_compulsory === '1' || row.is_compulsory === 'true'
		|| custom_data.is_compulsory === true || custom_data.is_compulsory === 1;
	return {
		...row,
		is_compulsory,
		lecturers: toJsonValue(row.lecturers, []),
		custom_data
	};
};

const listByTimetableId = async (timetableId) => {
	const supabase = getSupabaseClient();
	const { data, error } = await supabase
		.from('timetable_courses')
		.select('courses(*)')
		.eq('timetable_id', timetableId);
	if (error) throw new Error(error.message || 'Failed to list courses by timetable');
	return (data || []).map(row => normalizeRowForGeneration(row.courses)).filter(Boolean);
};

const list = async ({ timetableId } = {}) => {
	const supabase = getSupabaseClient();
	if (timetableId) {
		const { data, error } = await supabase
			.from('timetable_courses')
			.select('courses(*)')
			.eq('timetable_id', timetableId);
		if (error) throw new Error(error.message || 'Failed to list courses by timetable');
		return (data || []).map(row => row.courses).filter(Boolean);
	}
	return fetchMany(supabase.from('courses').select('*'));
};

const create = async (course) => {
	const supabase = getSupabaseClient();
	const isCompulsory = course.is_compulsory === true || course.is_compulsory === 1 || course.is_compulsory === '1' || course.is_compulsory === 'true';
	// Merge is_compulsory into custom_data as a fallback since the Supabase column may not exist
	const custom_data = {
		...(course.custom_data || {}),
		is_compulsory: isCompulsory
	};

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
		preferred_day: course.preferred_day || 'AUTO',
		preferred_time: course.preferred_time || 'AUTO',
		venue: course.venue || '',
		duration: course.duration,
		custom_data
	};

	const { data, error } = await supabase
		.from('courses')
		.insert([payload])
		.select('id')
		.single();

	if (error) throw new Error(error.message || 'Supabase course insert failed');
	return { lastID: data.id };
};

const getById = async (id) => {
	const supabase = getSupabaseClient();
	const row = await fetchOne(
		supabase
			.from('courses')
			.select('*')
			.eq('id', id)
			.single()
	);
	return row ? normalizeRowForGeneration(row) : null;
};

const update = async (id, course) => {
	const supabase = getSupabaseClient();
	const isCompulsory = course.is_compulsory === true || course.is_compulsory === 1 || course.is_compulsory === '1' || course.is_compulsory === 'true';
	const custom_data = {
		...(course.custom_data || {}),
		is_compulsory: isCompulsory
	};

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
		preferred_day: course.preferred_day || 'AUTO',
		preferred_time: course.preferred_time || 'AUTO',
		venue: course.venue || '',
		duration: course.duration,
		custom_data
	};

	const { error } = await supabase
		.from('courses')
		.update(payload)
		.eq('id', id);

	if (error) throw new Error(error.message || 'Supabase course update failed');
	return { changes: 1 };
};

const remove = async (id) => {
	const supabase = getSupabaseClient();
	const { error } = await supabase
		.from('courses')
		.delete()
		.eq('id', id);

	if (error) throw new Error(error.message || 'Supabase course delete failed');
	return { changes: 1 };
};

module.exports = { listByTimetableId, list, create, getById, update, remove };
