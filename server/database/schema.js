const DB_PROVIDER = (process.env.DB_PROVIDER || 'supabase').toLowerCase();

let db;
let initDatabase;

if (DB_PROVIDER === 'supabase') {
    const { db: supabaseDb, initSupabaseDatabase } = require('./supabaseAdapter');
    db = supabaseDb;
    initDatabase = initSupabaseDatabase;
    console.log('Database provider: supabase');
} else {
    const { db: sqliteDb, initSqliteDatabase } = require('./sqliteAdapter');
    db = sqliteDb;
    initDatabase = initSqliteDatabase;
    console.log('Database provider: sqlite');
}

module.exports = { db, initDatabase, DB_PROVIDER };
