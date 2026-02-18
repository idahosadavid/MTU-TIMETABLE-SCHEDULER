const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function runVerification() {
    try {
        console.log('Starting Verification...');

        // 1. Create a new timetable
        console.log('1. Creating a new timetable...');
        const timetableRes = await axios.post(`${BASE_URL}/timetables`, {
            name: 'Verification Timetable',
            academic_session: '2024/2025',
            semester: 'First',
            type: 'Lecture'
        });
        const timetableId = timetableRes.data.id;
        console.log(`   Timetable created with ID: ${timetableId}`);

        // 2. Add a course to this timetable
        console.log('2. Adding a course to this timetable...');
        const courseData = {
            code: 'VER101',
            title: 'Verification Course',
            department: 'Computer Science',
            level: 100,
            lecturers: ['Dr. Test'],
            units: 3,
            semester: 'First',
            type: 'Lecture',
            preferred_day: 'Monday',
            preferred_time: '9:00',
            venue: 'Room A',
            duration: 2, // hours
            student_count: 50,
            custom_data: {},
            timetable_id: timetableId
        };
        await axios.post(`${BASE_URL}/courses`, courseData);
        console.log('   Course added.');

        // 3. Fetch courses for this timetable
        console.log('3. Fetching courses for this timetable...');
        const coursesRes = await axios.get(`${BASE_URL}/courses?timetable_id=${timetableId}`);
        const courses = coursesRes.data.data;
        const addedCourse = courses.find(c => c.code === 'VER101');

        if (addedCourse) {
            console.log('   SUCCESS: Course found in the correct timetable.');
        } else {
            console.error('   FAILURE: Course NOT found in the correct timetable.');
        }

        // 4. Fetch courses for a non-existent timetable
        console.log('4. Fetching courses for a different timetable (ID: 99999)...');
        const otherCoursesRes = await axios.get(`${BASE_URL}/courses?timetable_id=99999`);
        const otherCourses = otherCoursesRes.data.data;
        const foundInOther = otherCourses.find(c => c.code === 'VER101');

        if (!foundInOther) {
            console.log('   SUCCESS: Course NOT found in other timetable.');
        } else {
            console.error('   FAILURE: Course FOUND in other timetable (Scoping failed).');
        }

        // 5. Generate Schedule
        console.log('5. Generating Schedule...');
        const generateRes = await axios.post(`${BASE_URL}/generate/lectures`, {
            timetable_id: timetableId
        });
        console.log(`   Generation response: ${generateRes.data.message}`);

        // 6. Verify Timetable Data
        console.log('6. Verifying Timetable Data...');
        const verifyTimetableRes = await axios.get(`${BASE_URL}/timetables/${timetableId}`);
        const timetableData = verifyTimetableRes.data.data;

        if (timetableData.data && timetableData.data.scheduled && timetableData.data.scheduled.length > 0) {
            console.log('   SUCCESS: Timetable has scheduled courses.');
        } else {
            console.log('   WARNING: Timetable has no scheduled courses (might be due to constraints or empty schedule generated).');
            // Check unscheduled
            if (timetableData.data && timetableData.data.unscheduled && timetableData.data.unscheduled.length > 0) {
                console.log('   SUCCESS: Timetable has unscheduled courses (Generation ran).');
            } else {
                console.error('   FAILURE: Timetable data is empty.');
            }
        }

        console.log('Verification Complete.');

    } catch (error) {
        console.error('Verification Failed:', error.message);
        if (error.response) {
            console.error('Response Data:', error.response.data);
        }
    }
}

runVerification();
