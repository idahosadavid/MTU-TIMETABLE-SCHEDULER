const { db } = require('./database/schema');

const seedStudents = () => {
    console.log('Seeding students and academic records...');

    const students = [
        {
            matric_number: 'MTU/2023/001',
            name: 'John Doe',
            department: 'Computer Science',
            level: 300
        },
        {
            matric_number: 'MTU/2023/002',
            name: 'Jane Smith',
            department: 'Microbiology',
            level: 200
        }
    ];

    // Current Session Registrations (Only active courses)
    const currentRegistrations = [
        // John Doe - 300L 
        { matric: 'MTU/2023/001', code: 'CSC301', status: 'Registered' },
        { matric: 'MTU/2023/001', code: 'CSC303', status: 'Registered' },

        // Jane Smith - 200L
        { matric: 'MTU/2023/002', code: 'MCB201', status: 'Registered' }
    ];

    // Past Results (Source of Carryovers)
    const academicResults = [
        // John Doe failed CSC201 last session
        {
            matric: 'MTU/2023/001',
            code: 'CSC201',
            score: 35,
            grade: 'F',
            remarks: 'Compulsory Outstanding',
            session: '2022/2023'
        },
        // John Doe passed CSC202
        {
            matric: 'MTU/2023/001',
            code: 'CSC202',
            score: 60,
            grade: 'B',
            remarks: 'Passed',
            session: '2022/2023'
        }
    ];

    db.serialize(() => {
        // Clear existing data
        db.run("DELETE FROM students");
        db.run("DELETE FROM student_courses");
        db.run("DELETE FROM student_results");

        // Insert Students
        const stmtStudent = db.prepare("INSERT INTO students (matric_number, name, department, level) VALUES (?, ?, ?, ?)");
        students.forEach(student => {
            stmtStudent.run(student.matric_number, student.name, student.department, student.level);
        });
        stmtStudent.finalize();

        // Insert Current Registrations
        const stmtReg = db.prepare("INSERT INTO student_courses (student_matric, course_code, status) VALUES (?, ?, ?)");
        currentRegistrations.forEach(course => {
            stmtReg.run(course.matric, course.code, course.status);
        });
        stmtReg.finalize();

        // Insert Past Results
        const stmtResult = db.prepare("INSERT INTO student_results (student_matric, course_code, score, grade, remarks, session) VALUES (?, ?, ?, ?, ?, ?)");
        academicResults.forEach(res => {
            stmtResult.run(res.matric, res.code, res.score, res.grade, res.remarks, res.session);
        });
        stmtResult.finalize();

        console.log('Seeding completed with realistic record structure.');
    });
};

seedStudents();
