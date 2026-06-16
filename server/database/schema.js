const { db, initSupabaseDatabase } = require('./supabaseAdapter');

const DB_PROVIDER = 'supabase';
const initDatabase = initSupabaseDatabase;

module.exports = { db, initDatabase, DB_PROVIDER };
