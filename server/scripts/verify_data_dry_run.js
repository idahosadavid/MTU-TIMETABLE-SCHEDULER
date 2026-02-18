const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { getSupabaseClient } = require('../database/supabaseAdapter');

const loadEnvFile = () => {
    const envPath = path.resolve(__dirname, '../.env');
    if (!fs.existsSync(envPath)) return;

    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex < 1) return;

        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();

        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        if (!process.env[key]) {
            process.env[key] = value;
        }
    });
};

loadEnvFile();

const sqlitePath = process.env.MIGRATION_SQLITE_PATH
    ? path.resolve(process.env.MIGRATION_SQLITE_PATH)
    : path.resolve(__dirname, '../database/mtu_timetable.db');

const TABLES = [
    'courses',
    'timetables',
    'custom_fields',
    'colleges',
    'departments',
    'lecturers',
    'venues',
    'scheduling_rules',
    'students',
    'student_courses',
    'student_results'
];

const openSqlite = (dbFilePath) => new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbFilePath, sqlite3.OPEN_READONLY, (error) => {
        if (error) {
            reject(error);
            return;
        }
        resolve(db);
    });
});

const sqliteGet = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
        if (error) {
            reject(error);
            return;
        }
        resolve(row);
    });
});

const sqliteAll = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
        if (error) {
            reject(error);
            return;
        }
        resolve(rows);
    });
});

const parseIfString = (value) => {
    if (typeof value !== 'string') return value;
    return JSON.parse(value);
};

const isArrayJson = (value) => {
    if (value === null || value === undefined || value === '') return true;
    try {
        const parsed = parseIfString(value);
        return Array.isArray(parsed);
    } catch {
        return false;
    }
};

const isObjectJson = (value) => {
    if (value === null || value === undefined || value === '') return true;
    try {
        const parsed = parseIfString(value);
        return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed);
    } catch {
        return false;
    }
};

const isTimetablePayload = (value) => {
    if (value === null || value === undefined || value === '') return false;
    try {
        const parsed = parseIfString(value);
        return !!parsed
            && typeof parsed === 'object'
            && Array.isArray(parsed.scheduled)
            && Array.isArray(parsed.unscheduled);
    } catch {
        return false;
    }
};

const evaluateRows = (rows, columnName, validator) => {
    const invalidIds = [];
    let checked = 0;

    rows.forEach((row) => {
        checked += 1;
        if (!validator(row[columnName])) {
            invalidIds.push(row.id);
        }
    });

    return { checked, invalidIds };
};

const checkSqliteJson = async (db) => {
    const checks = [
        { key: 'courses.lecturers', sql: 'SELECT id, lecturers FROM courses', column: 'lecturers', validator: isArrayJson },
        { key: 'courses.custom_data', sql: 'SELECT id, custom_data FROM courses', column: 'custom_data', validator: isObjectJson },
        { key: 'timetables.data', sql: 'SELECT id, data FROM timetables', column: 'data', validator: isTimetablePayload }
    ];

    const results = {};

    for (const check of checks) {
        const rows = await sqliteAll(db, check.sql);
        const evaluated = evaluateRows(rows, check.column, check.validator);
        results[check.key] = {
            checked: evaluated.checked,
            invalid: evaluated.invalidIds.length,
            invalidIds: evaluated.invalidIds.slice(0, 10)
        };
    }

    return results;
};

const fetchSupabaseBatches = async (supabase, tableName, selectColumns, onBatch) => {
    let lastSeenId = 0;
    const batchSize = 1000;

    while (true) {
        const { data, error } = await supabase
            .from(tableName)
            .select(selectColumns)
            .gt('id', lastSeenId)
            .order('id', { ascending: true })
            .limit(batchSize);

        if (error) throw error;
        if (!data || data.length === 0) break;

        onBatch(data);
        lastSeenId = Number(data[data.length - 1].id);

        if (data.length < batchSize) break;
    }
};

const checkSupabaseJson = async (supabase) => {
    const checks = [
        { table: 'courses', key: 'courses.lecturers', column: 'lecturers', validator: isArrayJson },
        { table: 'courses', key: 'courses.custom_data', column: 'custom_data', validator: isObjectJson },
        { table: 'timetables', key: 'timetables.data', column: 'data', validator: isTimetablePayload }
    ];

    const results = {};

    for (const check of checks) {
        let checked = 0;
        const invalidIds = [];

        await fetchSupabaseBatches(
            supabase,
            check.table,
            `id, ${check.column}`,
            (rows) => {
                const evaluated = evaluateRows(rows, check.column, check.validator);
                checked += evaluated.checked;
                invalidIds.push(...evaluated.invalidIds);
            }
        );

        results[check.key] = {
            checked,
            invalid: invalidIds.length,
            invalidIds: invalidIds.slice(0, 10)
        };
    }

    return results;
};

const countSqliteTable = async (db, tableName) => {
    const row = await sqliteGet(db, `SELECT COUNT(*) AS count FROM ${tableName}`);
    return Number(row?.count || 0);
};

const countSupabaseTable = async (supabase, tableName) => {
    const { count, error } = await supabase
        .from(tableName)
        .select('id', { count: 'exact', head: true });

    if (error) throw error;
    return Number(count || 0);
};

const run = async () => {
    const supabase = getSupabaseClient();
    const sqliteDb = await openSqlite(sqlitePath);

    try {
        const rowCounts = [];

        for (const tableName of TABLES) {
            const sqliteCount = await countSqliteTable(sqliteDb, tableName);
            const supabaseCount = await countSupabaseTable(supabase, tableName);

            rowCounts.push({
                table: tableName,
                sqlite: sqliteCount,
                supabase: supabaseCount,
                match: sqliteCount === supabaseCount
            });
        }

        const sqliteJson = await checkSqliteJson(sqliteDb);
        const supabaseJson = await checkSupabaseJson(supabase);

        const countMismatches = rowCounts.filter((item) => !item.match);
        const sqliteJsonFailures = Object.entries(sqliteJson).filter(([, value]) => value.invalid > 0);
        const supabaseJsonFailures = Object.entries(supabaseJson).filter(([, value]) => value.invalid > 0);

        const summary = {
            sqlitePath,
            tablesChecked: TABLES.length,
            rowCountMismatches: countMismatches.length,
            sqliteJsonFailures: sqliteJsonFailures.length,
            supabaseJsonFailures: supabaseJsonFailures.length,
            ok: countMismatches.length === 0 && sqliteJsonFailures.length === 0 && supabaseJsonFailures.length === 0
        };

        console.log('DATA_DRY_RUN_VERIFICATION_SUMMARY');
        console.log(JSON.stringify(summary, null, 2));

        console.log('DATA_DRY_RUN_ROW_COUNTS');
        console.log(JSON.stringify(rowCounts, null, 2));

        console.log('DATA_DRY_RUN_JSON_SQLITE');
        console.log(JSON.stringify(sqliteJson, null, 2));

        console.log('DATA_DRY_RUN_JSON_SUPABASE');
        console.log(JSON.stringify(supabaseJson, null, 2));

        if (!summary.ok) {
            process.exit(1);
        }
    } finally {
        sqliteDb.close();
    }
};

run().catch((error) => {
    console.error('DATA_DRY_RUN_VERIFICATION_FAILED');
    console.error(error.message || error);
    process.exit(1);
});
