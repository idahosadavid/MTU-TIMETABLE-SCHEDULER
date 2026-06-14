const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'mtu_timetable.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

const initSqliteDatabase = () => {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      college TEXT,
      department TEXT NOT NULL,
      level INTEGER NOT NULL,
      lecturers TEXT,
      units INTEGER NOT NULL,
      semester TEXT NOT NULL,
      type TEXT NOT NULL,
            is_compulsory INTEGER DEFAULT 0,
      preferred_day TEXT,
      preferred_time TEXT,
      venue TEXT,
      duration INTEGER,
      custom_data TEXT,
      timetable_id INTEGER,
      FOREIGN KEY(timetable_id) REFERENCES timetables(id) ON DELETE CASCADE
    )`);

        db.run(`ALTER TABLE courses ADD COLUMN custom_data TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                // no-op
            }
        });

        db.run(`ALTER TABLE courses ADD COLUMN timetable_id INTEGER`, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                // no-op
            }
        });

        db.run(`ALTER TABLE courses ADD COLUMN college TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                // no-op
            }
        });

        db.run(`ALTER TABLE courses ADD COLUMN is_compulsory INTEGER DEFAULT 0`, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                // no-op
            }
        });

        db.run(`CREATE TABLE IF NOT EXISTS custom_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      type TEXT NOT NULL,
      required INTEGER DEFAULT 0
    )`);

        db.run(`CREATE TABLE IF NOT EXISTS timetables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT,
      academic_session TEXT,
      semester TEXT,
      status TEXT DEFAULT 'Draft',
      data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      college TEXT
    )`);

        const columns = ['name', 'academic_session', 'semester', 'status', 'updated_at', 'college'];
        columns.forEach(col => {
            db.run(`ALTER TABLE timetables ADD COLUMN ${col} TEXT`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    // no-op
                }
            });
        });

        db.run(`CREATE TABLE IF NOT EXISTS colleges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS departments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            college_code TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(college_code) REFERENCES colleges(code) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS lecturers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            department_code TEXT,
            email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(department_code) REFERENCES departments(code) ON DELETE SET NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS venues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            college_code TEXT,
            capacity INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(college_code) REFERENCES colleges(code) ON DELETE SET NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS scheduling_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            rule_key TEXT NOT NULL UNIQUE,
            rule_value TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`INSERT OR IGNORE INTO colleges (code, name) VALUES
            ('CBAS', 'College of Basic and Applied Sciences'),
            ('CHMS', 'College of Humanities and Management Sciences'),
            ('CAHS', 'College of Allied Health Sciences')`);

        db.run(`INSERT OR IGNORE INTO departments (code, name, college_code) VALUES
            ('CSC', 'Computer Science', 'CBAS'),
            ('MTH', 'Mathematics', 'CBAS'),
            ('STA', 'Statistics', 'CBAS')`);

        db.run(`INSERT OR IGNORE INTO scheduling_rules (name, rule_key, rule_value, is_active) VALUES
            ('Maximum Daily Hours Per Level', 'max_daily_hours_per_level', '6', 1),
            ('Default Start Hour', 'default_start_hour', '9', 1),
            ('Default End Hour', 'default_end_hour', '18', 1),
            ('Prefer Compulsory Courses First', 'prioritize_core_courses', 'true', 1)`);

        db.run(`CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            matric_number TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            department TEXT NOT NULL,
            level INTEGER NOT NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS student_courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_matric TEXT NOT NULL,
            course_code TEXT NOT NULL,
            status TEXT NOT NULL,
            FOREIGN KEY(student_matric) REFERENCES students(matric_number) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS student_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_matric TEXT NOT NULL,
            course_code TEXT NOT NULL,
            score INTEGER,
            grade TEXT,
            remarks TEXT,
            session TEXT,
            FOREIGN KEY(student_matric) REFERENCES students(matric_number) ON DELETE CASCADE
        )`);

        // Junction table for course-timetable relationships (many-to-many)
        db.run(`CREATE TABLE IF NOT EXISTS timetable_courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timetable_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(timetable_id) REFERENCES timetables(id) ON DELETE CASCADE,
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
            UNIQUE(timetable_id, course_id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT,
            detail TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    });
};

module.exports = { db, initSqliteDatabase };
