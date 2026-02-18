const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function runVerification() {
    try {
        console.log('Starting College Selection Verification...');

        // 1. Create CBAS Timetable
        console.log('1. Creating CBAS Timetable...');
        const cbasRes = await axios.post(`${BASE_URL}/timetables`, {
            name: 'CBAS Schedule',
            type: 'Lecture',
            academic_session: '2024/2025',
            semester: 'First',
            college: 'CBAS'
        });
        const cbasId = cbasRes.data.id;
        console.log(`   CBAS Timetable created with ID: ${cbasId}`);

        // 2. Create CHMS Timetable
        console.log('2. Creating CHMS Timetable...');
        const chmsRes = await axios.post(`${BASE_URL}/timetables`, {
            name: 'CHMS Schedule',
            type: 'Lecture',
            academic_session: '2024/2025',
            semester: 'First',
            college: 'CHMS'
        });
        const chmsId = chmsRes.data.id;
        console.log(`   CHMS Timetable created with ID: ${chmsId}`);

        // 3. Verify List (All)
        console.log('3. Verifying List (All)...');
        const allRes = await axios.get(`${BASE_URL}/timetables`);
        const allTimetables = allRes.data.data;
        const hasCbas = allTimetables.some(t => t.id === cbasId && t.college === 'CBAS');
        const hasChms = allTimetables.some(t => t.id === chmsId && t.college === 'CHMS');

        if (hasCbas && hasChms) {
            console.log('   SUCCESS: Both timetables found with correct colleges.');
        } else {
            console.error('   FAILURE: Timetables missing or incorrect college.');
        }

        // 4. Verify Filter (CBAS)
        console.log('4. Verifying Filter (CBAS)...');
        const filterCbasRes = await axios.get(`${BASE_URL}/timetables?college=CBAS`);
        const cbasFiltered = filterCbasRes.data.data;
        const cbasOnly = cbasFiltered.every(t => t.college === 'CBAS');
        const cbasFound = cbasFiltered.some(t => t.id === cbasId);
        const chmsNotFound = !cbasFiltered.some(t => t.id === chmsId);

        if (cbasOnly && cbasFound && chmsNotFound) {
            console.log('   SUCCESS: Filter correctly returned only CBAS timetables.');
        } else {
            console.error('   FAILURE: Filter failed.');
        }

        // 5. Verify Invalid College
        console.log('5. Verifying Invalid College Rejection...');
        try {
            await axios.post(`${BASE_URL}/timetables`, {
                name: 'Invalid Schedule',
                type: 'Lecture',
                academic_session: '2024/2025',
                semester: 'First',
                college: 'INVALID'
            });
            console.error('   FAILURE: API accepted invalid college.');
        } catch (err) {
            if (err.response && err.response.status === 400) {
                console.log('   SUCCESS: API rejected invalid college.');
            } else {
                console.error(`   FAILURE: Unexpected error: ${err.message}`);
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
