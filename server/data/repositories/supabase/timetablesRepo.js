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

const list = async ({ college } = {}) => {
	const supabase = getSupabaseClient();
	let query = supabase
		.from('timetables')
		.select('id, type, name, academic_session, semester, status, college, created_at, updated_at')
		.order('updated_at', { ascending: false });

	if (college) {
		query = query.eq('college', college);
	}

	return fetchMany(query);
};

const getRawById = async (id) => {
	const supabase = getSupabaseClient();
	return fetchOne(
		supabase
			.from('timetables')
			.select('*')
			.eq('id', id)
			.maybeSingle()
	);
};

const getById = async (id) => {
	const row = await getRawById(id);
	if (!row) return null;
	return {
		...row,
		data: toJsonValue(row.data, { scheduled: [], unscheduled: [] })
	};
};

const create = async ({ type, name, academic_session, semester, college }) => {
	const supabase = getSupabaseClient();
	const data = { scheduled: [], unscheduled: [] };
	const { data: inserted, error } = await supabase
		.from('timetables')
		.insert([{ type, name, academic_session, semester, college, data }])
		.select('id')
		.single();

	if (error) throw new Error(error.message || 'Supabase insert failed');
	return getById(inserted.id);
};

const createWithData = async ({ type, name, academic_session, semester, college, status = 'Draft', data }) => {
	const supabase = getSupabaseClient();
	const payload = {
		type,
		name,
		academic_session,
		semester,
		status,
		college,
		data: toJsonValue(data, { scheduled: [], unscheduled: [] })
	};

	const { data: inserted, error } = await supabase
		.from('timetables')
		.insert([payload])
		.select('id')
		.single();

	if (error) throw new Error(error.message || 'Supabase insert failed');
	return { lastID: inserted.id };
};

const updateMeta = async (id, { name, academic_session, semester, status }) => {
	const supabase = getSupabaseClient();
	const { error } = await supabase
		.from('timetables')
		.update({ name, academic_session, semester, status, updated_at: new Date().toISOString() })
		.eq('id', id);

	if (error) throw new Error(error.message || 'Supabase update failed');
	return getById(id);
};

const updateDataById = async (id, data) => {
	const supabase = getSupabaseClient();
	const { error } = await supabase
		.from('timetables')
		.update({ data: toJsonValue(data, { scheduled: [], unscheduled: [] }), updated_at: new Date().toISOString() })
		.eq('id', id);

	if (error) throw new Error(error.message || 'Supabase update failed');
	return { changes: 1 };
};

const updateGeneratedDataById = async (id, data) => {
	const supabase = getSupabaseClient();
	const { error } = await supabase
		.from('timetables')
		.update({ data: toJsonValue(data, { scheduled: [], unscheduled: [] }), status: 'Draft', updated_at: new Date().toISOString() })
		.eq('id', id);

	if (error) throw new Error(error.message || 'Supabase update failed');
	return { changes: 1 };
};

const deleteById = async (id) => {
	const supabase = getSupabaseClient();
	const { error } = await supabase
		.from('timetables')
		.delete()
		.eq('id', id);

	if (error) throw new Error(error.message || 'Supabase delete failed');
	return { changes: 1 };
};

const duplicateById = async (id) => {
	const row = await getRawById(id);
	if (!row) return null;

	const supabase = getSupabaseClient();
	const newName = `${row.name} (Copy)`;
	const payload = {
		type: row.type,
		name: newName,
		academic_session: row.academic_session,
		semester: row.semester,
		status: 'Draft',
		data: toJsonValue(row.data, { scheduled: [], unscheduled: [] })
	};

	const { data: inserted, error } = await supabase
		.from('timetables')
		.insert([payload])
		.select('id')
		.single();

	if (error) throw new Error(error.message || 'Supabase duplicate insert failed');
	return { lastID: inserted.id };
};

const getLatestByType = async (type) => {
	const supabase = getSupabaseClient();
	return fetchOne(
		supabase
			.from('timetables')
			.select('*')
			.eq('type', type)
			.order('id', { ascending: false })
			.limit(1)
			.maybeSingle()
	);
};

module.exports = {
	list,
	getById,
	getRawById,
	create,
	createWithData,
	updateMeta,
	updateDataById,
	updateGeneratedDataById,
	deleteById,
	duplicateById,
	getLatestByType
};
