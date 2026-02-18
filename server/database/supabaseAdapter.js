let supabaseClient = null;

const getSupabaseClient = () => {
    if (supabaseClient) return supabaseClient;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for DB_PROVIDER=supabase');
    }

    const { createClient } = require('@supabase/supabase-js');
    supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    return supabaseClient;
};

const unsupported = (methodName) => (...args) => {
    const callback = args.find(arg => typeof arg === 'function');
    const err = new Error(`db.${methodName} is not available with DB_PROVIDER=supabase yet. Migrate this endpoint to Supabase repositories first.`);
    if (callback) {
        callback(err);
        return;
    }
    throw err;
};

const db = {
    run: unsupported('run'),
    get: unsupported('get'),
    all: unsupported('all'),
    prepare: unsupported('prepare'),
    serialize: (fn) => {
        if (typeof fn === 'function') fn();
    }
};

const initSupabaseDatabase = () => {
    getSupabaseClient();
    console.log('Connected to Supabase (client initialized). Apply server/database/supabase_schema.sql before using Supabase endpoints.');
};

module.exports = { db, getSupabaseClient, initSupabaseDatabase };
