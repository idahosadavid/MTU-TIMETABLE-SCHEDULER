const { getSupabaseClient, fetchMany } = require('./helpers');

const write = async ({ action, entity_type, entity_id, detail, ip_address }) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('audit_log')
        .insert([{ action, entity_type, entity_id: String(entity_id ?? ''), detail: detail ?? null, ip_address: ip_address ?? null }]);

    if (error) console.error('[AuditLog] write error:', error.message);
};

const list = async ({ limit = 100, offset = 0 } = {}) => {
    const supabase = getSupabaseClient();
    return fetchMany(
        supabase
            .from('audit_log')
            .select('*')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)
    );
};

module.exports = { write, list };
