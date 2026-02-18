const { getSupabaseClient, fetchMany } = require('./helpers');

const list = async () => {
	const supabase = getSupabaseClient();
	return fetchMany(
		supabase
			.from('custom_fields')
			.select('*')
	);
};

const create = async ({ name, label, type, required }) => {
	const supabase = getSupabaseClient();
	const { data, error } = await supabase
		.from('custom_fields')
		.insert([{ name, label, type, required: !!required }])
		.select('id')
		.single();

	if (error) throw new Error(error.message || 'Supabase custom_fields insert failed');
	return { id: data.id };
};

const deleteById = async (id) => {
	const supabase = getSupabaseClient();
	const { error } = await supabase
		.from('custom_fields')
		.delete()
		.eq('id', id);

	if (error) throw new Error(error.message || 'Supabase custom_fields delete failed');
	return { changes: 1 };
};

module.exports = { list, create, deleteById };
