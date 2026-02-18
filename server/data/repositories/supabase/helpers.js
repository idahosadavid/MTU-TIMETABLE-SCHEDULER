const { getSupabaseClient } = require('../../../database/supabaseAdapter');

const notImplemented = (name) => {
    throw new Error(`${name} is not implemented for Supabase repositories yet.`);
};

const ensureNoError = (error) => {
    if (error) {
        throw new Error(error.message || 'Supabase query failed');
    }
};

const fetchMany = async (queryPromise) => {
    const { data, error } = await queryPromise;
    ensureNoError(error);
    return data || [];
};

const fetchOne = async (queryPromise) => {
    const { data, error } = await queryPromise;
    ensureNoError(error);
    return data || null;
};

module.exports = {
    getSupabaseClient,
    notImplemented,
    fetchMany,
    fetchOne
};
