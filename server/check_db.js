const { db } = require('./database/schema');

db.serialize(() => {
    console.log("Checking Students...");
    db.all("SELECT * FROM students", (err, rows) => {
        if (err) console.error(err);
        else {
            console.log("Students found:", rows.length);
            rows.forEach(r => console.log(`'${r.matric_number}' - ${r.name}`));
        }
    });
});
