const { db } = require('./database/schema');

db.serialize(() => {
    console.log("--- DEBUGGING DB STATE ---");

    db.get("SELECT count(*) as count FROM students", (err, row) => console.log("Students:", row?.count, err));

    db.get("SELECT count(*) as count FROM timetables", (err, row) => console.log("Timetables:", row?.count, err));

    db.all("SELECT id, type, name, status FROM timetables ORDER BY updated_at DESC LIMIT 1", (err, rows) => {
        console.log("Latest Timetable:", rows);
        if (rows && rows.length > 0) {
            // check if data is valid json
            db.get("SELECT data FROM timetables WHERE id = ?", [rows[0].id], (err, row) => {
                try {
                    JSON.parse(row.data);
                    console.log("Latest Timetable Data is VALID JSON");
                } catch (e) {
                    console.log("Latest Timetable Data is INVALID JSON");
                }
            });
        }
    });

    db.get("SELECT count(*) as count FROM student_courses", (err, row) => {
        console.log("Student Courses:", row?.count, err);
        if (err && err.message.includes('no such table')) console.log("!! student_courses table missing !!");
    });

    db.get("SELECT count(*) as count FROM student_results", (err, row) => {
        console.log("Student Results:", row?.count, err)
        if (err && err.message.includes('no such table')) console.log("!! student_results table missing !!");
    });
});
