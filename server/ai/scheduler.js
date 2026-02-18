// --- CONSTANTS ---
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TIMES = [
    '9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'
];
const EXAM_SLOTS = [
    { name: 'Morning', time: '9:00-12:00' },
    { name: 'Afternoon', time: '12:00-15:00' },
    { name: 'Evening', time: '15:00-18:00' }
];

const toLecturerArray = (lecturers) => {
    if (Array.isArray(lecturers)) return lecturers;
    if (!lecturers) return [];
    if (typeof lecturers === 'string') {
        try {
            const parsed = JSON.parse(lecturers);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return lecturers.split(',').map(l => l.trim()).filter(Boolean);
        }
    }
    return [];
};

const parseTime = (t) => {
    const [h, m] = String(t).split(':').map(Number);
    return (h * 60) + (m || 0);
};

const getDailyMinutesForLevel = (schedule, day, department, level) => {
    return schedule
        .filter(item => item.day === day && item.department === department && Number(item.level) === Number(level))
        .reduce((sum, item) => sum + Number(item.duration || 60), 0);
};

const toBoolean = (value) => value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';

const isCompulsoryCourse = (course) => {
    if (toBoolean(course.is_compulsory)) return true;
    return toBoolean(course.custom_data?.is_compulsory)
        || toBoolean(course.custom_data?.compulsory)
        || toBoolean(course.custom_data?.is_core)
        || toBoolean(course.custom_data?.core);
};

const normalizeDepartmentValue = (value) => String(value || '').trim().toLowerCase();

const matchesDepartmentFilter = (courseDepartment, options = {}) => {
    if (!options.department) return true;

    const normalizedCourseDepartment = normalizeDepartmentValue(courseDepartment);
    if (!normalizedCourseDepartment) return false;

    const rawCandidates = Array.isArray(options.departmentAliases)
        ? [...options.departmentAliases, options.department]
        : [options.department];

    const candidateSet = new Set(rawCandidates.map(normalizeDepartmentValue).filter(Boolean));
    return candidateSet.has(normalizedCourseDepartment);
};

const normalizeSharedSessionKey = (value) => String(value || '').trim().toLowerCase();

const getSharedSessionKey = (course) => {
    if (!course) return '';
    return normalizeSharedSessionKey(
        course.shared_session_key
        || course.custom_data?.shared_session_key
        || ''
    );
};

// Helper: Fetch all courses (REMOVED - now passed in)
// const getCourses = () => { ... };

// --- CONFLICT DETECTION ---

const hasConflict = (schedule, day, time, duration, course) => {
    const newStart = parseTime(time);
    const newEnd = newStart + duration;
    const courseSharedSessionKey = getSharedSessionKey(course);

    for (const item of schedule) {
        if (item.day !== day) continue;

        const itemStart = parseTime(item.time);
        const itemEnd = itemStart + item.duration; // Assuming item has duration

        // Check time overlap
        if (newStart < itemEnd && newEnd > itemStart) {
            const itemSharedSessionKey = getSharedSessionKey(item);
            const isSameSharedSession = Boolean(courseSharedSessionKey)
                && courseSharedSessionKey === itemSharedSessionKey;

            if (isSameSharedSession) {
                continue;
            }

            // Check constraints

            // 1. Room Conflict
            if (item.venue === course.venue && item.venue !== 'Unassigned' && item.venue !== '') return true;

            // 2. Lecturer Conflict
            const lecturers1 = toLecturerArray(course.lecturers);
            const lecturers2 = toLecturerArray(item.lecturers);
            const commonLecturer = lecturers1.some(l => lecturers2.includes(l));
            if (commonLecturer) return true;

            // 3. Level Conflict (Same department and level)
            if (item.department === course.department && item.level === course.level) return true;
        }
    }
    return false;
};

const pickVenue = (course, day, time, schedule, venues = []) => {
    if (course.venue && course.venue !== 'Unassigned') return course.venue;
    const requiredCapacity = Number(course.student_count || 0);
    const courseSharedSessionKey = getSharedSessionKey(course);
    const sortedVenues = [...venues].sort((a, b) => Number(a.capacity || 0) - Number(b.capacity || 0));
    for (const venue of sortedVenues) {
        if (requiredCapacity > 0 && Number(venue.capacity || 0) < requiredCapacity) continue;
        const venueConflict = schedule.some(item => {
            if (item.day !== day || item.time !== time || item.venue !== venue.name) return false;
            const itemSharedSessionKey = getSharedSessionKey(item);
            const isSameSharedSession = Boolean(courseSharedSessionKey)
                && courseSharedSessionKey === itemSharedSessionKey;
            return !isSameSharedSession;
        });
        if (!venueConflict) return venue.name;
    }
    return 'Unassigned';
};

const tryRearrangeForCourse = (schedule, course, options) => {
    const { times = TIMES, days = DAYS, maxDailyHoursPerLevel = 6 } = options;
    for (let index = 0; index < schedule.length; index++) {
        const existing = schedule[index];
        if (existing.day === course.preferred_day && existing.time === course.preferred_time) {
            for (const day of days) {
                for (const time of times) {
                    if (hasConflict(schedule.filter((_, i) => i !== index), day, time, existing.duration || 60, existing)) {
                        continue;
                    }
                    const dailyMinutes = getDailyMinutesForLevel(
                        schedule.filter((_, i) => i !== index),
                        day,
                        existing.department,
                        existing.level
                    );
                    if (dailyMinutes + Number(existing.duration || 60) > maxDailyHoursPerLevel * 60) {
                        continue;
                    }
                    schedule[index] = { ...existing, day, time };
                    return true;
                }
            }
        }
    }
    return false;
};

// --- AI ALGORITHMS ---

// 1. Lecture Scheduler
const generateLectureSchedule = async (courses, options = {}) => {
    console.log("Generating Lecture Schedule...");
    const lectures = courses.filter(c => c.type === 'Lecture');
    const filteredLectures = lectures.filter(c => {
        if (!matchesDepartmentFilter(c.department, options)) return false;
        if (options.level && Number(c.level) !== Number(options.level)) return false;
        if (options.semester && c.semester !== options.semester) return false;
        if (options.college && c.college && c.college !== options.college) return false;
        return true;
    });

    const rules = options.rules || {};
    const maxDailyHoursPerLevel = Number(rules.max_daily_hours_per_level || 6);
    const startHour = Number(rules.default_start_hour || 9);
    const endHour = Number(rules.default_end_hour || 18);
    const prioritizeCompulsory = String(rules.prioritize_compulsory_courses ?? rules.prioritize_core_courses ?? 'true') === 'true';
    const times = TIMES.filter(t => {
        const hour = Number(String(t).split(':')[0]);
        return hour >= startHour && hour <= endHour;
    });
    const venues = options.venues || [];

    // Sort by units (descending) to prioritize heavier courses
    filteredLectures.sort((a, b) => {
        const aCompulsory = prioritizeCompulsory && isCompulsoryCourse(a);
        const bCompulsory = prioritizeCompulsory && isCompulsoryCourse(b);
        if (aCompulsory !== bCompulsory) return bCompulsory - aCompulsory;
        return Number(b.units || 0) - Number(a.units || 0);
    });

    const schedule = [];
    const unscheduled = [];

    for (const course of filteredLectures) {
        let assigned = false;

        // Try preferred day/time first if set
        if (course.preferred_day !== 'AUTO') {
            if (course.preferred_time !== 'AUTO') {
                // Specific day and time
                const dailyMinutes = getDailyMinutesForLevel(schedule, course.preferred_day, course.department, course.level);
                if (!hasConflict(schedule, course.preferred_day, course.preferred_time, course.duration || 60, course)
                    && dailyMinutes + Number(course.duration || 60) <= maxDailyHoursPerLevel * 60) {
                    const venue = pickVenue(course, course.preferred_day, course.preferred_time, schedule, venues);
                    schedule.push({
                        ...course,
                        day: course.preferred_day,
                        time: course.preferred_time,
                        venue
                    });
                    assigned = true;
                }
            } else {
                // Specific day, any time
                for (const time of times) {
                    const dailyMinutes = getDailyMinutesForLevel(schedule, course.preferred_day, course.department, course.level);
                    if (!hasConflict(schedule, course.preferred_day, time, course.duration || 60, course)
                        && dailyMinutes + Number(course.duration || 60) <= maxDailyHoursPerLevel * 60) {
                        const venue = pickVenue(course, course.preferred_day, time, schedule, venues);
                        schedule.push({
                            ...course,
                            day: course.preferred_day,
                            time,
                            venue
                        });
                        assigned = true;
                        break;
                    }
                }
            }
        }

        // If not assigned, find first available slot
        if (!assigned) {
            // Randomize days to vary the schedule
            const shuffledDays = [...DAYS].sort(() => 0.5 - Math.random());

            for (const day of shuffledDays) {
                for (const time of times) {
                    const dailyMinutes = getDailyMinutesForLevel(schedule, day, course.department, course.level);
                    if (!hasConflict(schedule, day, time, course.duration || 60, course)
                        && dailyMinutes + Number(course.duration || 60) <= maxDailyHoursPerLevel * 60) {
                        const venue = pickVenue(course, day, time, schedule, venues);
                        schedule.push({
                            ...course,
                            day,
                            time,
                            venue
                        });
                        assigned = true;
                        break;
                    }
                }
                if (assigned) break;
            }
        }

        if (!assigned) {
            if (course.preferred_day !== 'AUTO' && course.preferred_time !== 'AUTO') {
                const rearranged = tryRearrangeForCourse(schedule, course, { times, days: DAYS, maxDailyHoursPerLevel });
                if (rearranged && !hasConflict(schedule, course.preferred_day, course.preferred_time, course.duration || 60, course)) {
                    const venue = pickVenue(course, course.preferred_day, course.preferred_time, schedule, venues);
                    schedule.push({ ...course, day: course.preferred_day, time: course.preferred_time, venue });
                    assigned = true;
                }
            }
        }

        if (!assigned) {
            console.warn(`Could not schedule course: ${course.code}`);
            unscheduled.push(course);
        }
    }

    const result = { scheduled: schedule, unscheduled };
    return result;
};

// 2. Exam Scheduler
const generateExamSchedule = async (courses, options = {}) => {
    console.log("Generating Exam Schedule...");
    const exams = courses.filter(c => c.type === 'Exam').filter(c => {
        if (!matchesDepartmentFilter(c.department, options)) return false;
        if (options.level && Number(c.level) !== Number(options.level)) return false;
        if (options.semester && c.semester !== options.semester) return false;
        if (options.college && c.college && c.college !== options.college) return false;
        return true;
    });

    const schedule = [];
    const unscheduled = [];

    for (const course of exams) {
        let assigned = false;
        const shuffledDays = [...DAYS].sort(() => 0.5 - Math.random());

        for (const day of shuffledDays) {
            for (const slot of EXAM_SLOTS) {
                // Check conflict using slot time
                // Simplified: Just checking if slot is free for this level/lecturer
                // We treat slots as discrete blocks

                const conflict = schedule.some(item => {
                    if (item.day !== day || item.time !== slot.time) return false;

                    const itemSharedSessionKey = getSharedSessionKey(item);
                    const courseSharedSessionKey = getSharedSessionKey(course);
                    const isSameSharedSession = Boolean(courseSharedSessionKey)
                        && courseSharedSessionKey === itemSharedSessionKey;

                    if (isSameSharedSession) return false;

                    return item.venue === course.venue
                        || (item.department === course.department && item.level === course.level);
                });

                if (!conflict) {
                    schedule.push({
                        ...course,
                        day,
                        time: slot.time,
                        slotName: slot.name,
                        venue: course.venue || 'Exam Hall'
                    });
                    assigned = true;
                    break;
                }
            }
            if (assigned) break;
        }
        if (!assigned) {
            unscheduled.push(course);
        }
    }

    const result = { scheduled: schedule, unscheduled };
    return result;
};

// 3. Test Scheduler
const generateTestSchedule = async (courses, options = {}) => {
    console.log("Generating Test Schedule...");
    const tests = courses.filter(c => c.type === 'Test').filter(c => {
        if (!matchesDepartmentFilter(c.department, options)) return false;
        if (options.level && Number(c.level) !== Number(options.level)) return false;
        if (options.semester && c.semester !== options.semester) return false;
        if (options.college && c.college && c.college !== options.college) return false;
        return true;
    });

    // Tests are 1 hour, similar to lectures but maybe different constraints
    const schedule = [];
    const unscheduled = [];

    for (const course of tests) {
        let assigned = false;
        const shuffledDays = [...DAYS].sort(() => 0.5 - Math.random());

        for (const day of shuffledDays) {
            for (const time of TIMES) {
                if (!hasConflict(schedule, day, time, 60, course)) {
                    schedule.push({
                        ...course,
                        day,
                        time,
                        venue: course.venue || 'Classroom'
                    });
                    assigned = true;
                    break;
                }
            }
            if (assigned) break;
        }
        if (!assigned) {
            unscheduled.push(course);
        }
    }

    const result = { scheduled: schedule, unscheduled };
    return result;
};

module.exports = {
    generateLectureSchedule,
    generateExamSchedule,
    generateTestSchedule,
    hasConflict
};
