// =============================================================================
// MTU Timetable Scheduler — Adaptive Large Neighborhood Search (ALNS)
// =============================================================================
// Algorithm overview:
//   1. Greedy warm-start builds an initial complete assignment.
//   2. ALNS iteratively destroys a structured subset of the assignment and
//      repairs it, adapting operator selection weights based on past performance.
//   3. A simulated-annealing acceptance criterion allows escaping local optima.
//   4. The best solution seen across all iterations is returned.
// =============================================================================

// --- CONSTANTS ---
const DAYS  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TIMES = ['9:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];
const EXAM_SLOTS = [
    { name: 'Morning',   time: '9:00-12:00'  },
    { name: 'Afternoon', time: '12:00-15:00' },
    { name: 'Evening',   time: '15:00-18:00' },
];

// --- ALNS TUNING ---
const ALNS_ITERATIONS     = 3000; // total move attempts (scaled up for large inputs)
const ALNS_SEGMENT        = 60;   // iterations per weight-update cycle
const ALNS_REACTION       = 0.18; // weight adaptation speed [0=frozen, 1=instant]
const ALNS_DESTROY_MIN    = 0.10; // min fraction of courses to remove each iteration
const ALNS_DESTROY_MAX    = 0.30; // max fraction
const ALNS_SCORE_NEW_BEST = 9;
const ALNS_SCORE_IMPROVED = 3;
const ALNS_SCORE_ACCEPTED = 1;
const ALNS_INIT_TEMP      = 60;
const ALNS_COOLING        = 0.997;

// --- COST WEIGHTS ---
const COST = {
    ROOM_CONFLICT:      1000,
    LECTURER_CONFLICT:  1000,
    LEVEL_CONFLICT:     1000,
    DAILY_HOURS_EXCEED: 500,
    // soft
    PREFERRED_DAY_MISS:  10,
    PREFERRED_TIME_MISS:  5,
    COMPULSORY_LATE:      8,
    ROOM_UNASSIGNED:     15,
    ROOM_UNDERSIZED:     20,
    WORKLOAD_IMBALANCE:   3,
};

// =============================================================================
// UTILITIES
// =============================================================================

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

const toBoolean = (v) =>
    v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';

const isCompulsoryCourse = (c) =>
    toBoolean(c.is_compulsory)
    || toBoolean(c.custom_data?.is_compulsory)
    || toBoolean(c.custom_data?.compulsory)
    || toBoolean(c.custom_data?.is_core)
    || toBoolean(c.custom_data?.core);

const normalizeDept = (v) => String(v || '').trim().toLowerCase();

const matchesDepartmentFilter = (dept, options = {}) => {
    if (!options.department) return true;
    const nd = normalizeDept(dept);
    if (!nd) return false;
    const candidates = Array.isArray(options.departmentAliases)
        ? [...options.departmentAliases, options.department]
        : [options.department];
    return new Set(candidates.map(normalizeDept).filter(Boolean)).has(nd);
};

const getSharedKey = (c) =>
    String(c?.shared_session_key || c?.custom_data?.shared_session_key || '').trim().toLowerCase();

const randInt = (n) => Math.floor(Math.random() * n);
const randItem = (arr) => arr[randInt(arr.length)];
const cloneArr = (arr) => arr.map(e => ({ ...e }));

// =============================================================================
// VENUE PICKER
// =============================================================================

const pickVenue = (course, day, time, others, venues = []) => {
    if (course.venue && course.venue !== 'Unassigned') return course.venue;
    const cap = Number(course.student_count || 0);
    const ck  = getSharedKey(course);
    const sorted = [...venues].sort((a, b) => Number(a.capacity || 0) - Number(b.capacity || 0));
    for (const v of sorted) {
        if (cap > 0 && Number(v.capacity || 0) < cap) continue;
        const taken = others.some(o => {
            if (o.day !== day || o.time !== time || o.venue !== v.name) return false;
            const ok = getSharedKey(o);
            return !(Boolean(ck) && ck === ok);
        });
        if (!taken) return v.name;
    }
    return 'Unassigned';
};

// =============================================================================
// COST FUNCTION
// =============================================================================

const computeCost = (assignment, venues, maxDailyHours) => {
    let cost = 0;
    const n = assignment.length;

    // Build slot index
    const bySlot = {};
    for (let i = 0; i < n; i++) {
        const k = `${assignment[i].day}|${assignment[i].time}`;
        (bySlot[k] = bySlot[k] || []).push(i);
    }

    // Daily minutes per dept+level+day
    const dailyMin = {};
    for (const e of assignment) {
        const k = `${e.department}|${e.level}|${e.day}`;
        dailyMin[k] = (dailyMin[k] || 0) + Number(e.duration || 60);
    }
    for (const [, mins] of Object.entries(dailyMin)) {
        if (mins > maxDailyHours * 60)
            cost += COST.DAILY_HOURS_EXCEED * Math.ceil((mins - maxDailyHours * 60) / 60);
    }

    // Pairwise conflicts within same slot
    for (const indices of Object.values(bySlot)) {
        if (indices.length < 2) continue;
        for (let a = 0; a < indices.length; a++) {
            for (let b = a + 1; b < indices.length; b++) {
                const ea = assignment[indices[a]];
                const eb = assignment[indices[b]];
                const sameShared = Boolean(getSharedKey(ea)) && getSharedKey(ea) === getSharedKey(eb);
                if (sameShared) continue;

                const as = parseTime(ea.time), ae = as + Number(ea.duration || 60);
                const bs = parseTime(eb.time), be = bs + Number(eb.duration || 60);
                if (as >= be || bs >= ae) continue;

                if (ea.venue && eb.venue && ea.venue !== 'Unassigned' && ea.venue === eb.venue)
                    cost += COST.ROOM_CONFLICT;
                if (toLecturerArray(ea.lecturers).some(l => toLecturerArray(eb.lecturers).includes(l)))
                    cost += COST.LECTURER_CONFLICT;
                if (ea.department === eb.department && ea.level === eb.level)
                    cost += COST.LEVEL_CONFLICT;
            }
        }
    }

    // Per-entry soft costs
    for (const e of assignment) {
        if (e._prefDay  && e._prefDay  !== 'AUTO' && e.day  !== e._prefDay)  cost += COST.PREFERRED_DAY_MISS;
        if (e._prefTime && e._prefTime !== 'AUTO' && e.time !== e._prefTime) cost += COST.PREFERRED_TIME_MISS;
        if (isCompulsoryCourse(e) && parseTime(e.time) >= parseTime('15:00')) cost += COST.COMPULSORY_LATE;
        if (!e.venue || e.venue === 'Unassigned') {
            cost += COST.ROOM_UNASSIGNED;
        } else if (venues.length > 0) {
            const vo = venues.find(v => v.name === e.venue);
            if (vo && Number(e.student_count || 0) > Number(vo.capacity || 0))
                cost += COST.ROOM_UNDERSIZED;
        }
    }

    // Workload balance per dept+level
    const perDay = {};
    for (const e of assignment) {
        const k = `${e.department}|${e.level}`;
        if (!perDay[k]) perDay[k] = Array(DAYS.length).fill(0);
        const di = DAYS.indexOf(e.day);
        if (di >= 0) perDay[k][di]++;
    }
    for (const counts of Object.values(perDay)) {
        const total = counts.reduce((s, c) => s + c, 0);
        const avg   = total / DAYS.length;
        const max   = Math.max(...counts);
        cost += COST.WORKLOAD_IMBALANCE * Math.max(0, max - Math.ceil(avg));
    }

    return cost;
};

// =============================================================================
// DESTROY OPERATORS
// Each receives the current assignment and returns { kept, removed }.
// =============================================================================

// D1 — random removal
const destroyRandom = (assignment, frac) => {
    const n = Math.max(1, Math.round(assignment.length * frac));
    const indices = new Set();
    while (indices.size < n) indices.add(randInt(assignment.length));
    return {
        kept:    assignment.filter((_, i) => !indices.has(i)),
        removed: assignment.filter((_, i) =>  indices.has(i)),
    };
};

// D2 — remove all courses for a randomly chosen lecturer
const destroyLecturer = (assignment, _frac) => {
    const allLecturers = [...new Set(
        assignment.flatMap(e => toLecturerArray(e.lecturers))
    )].filter(Boolean);
    if (!allLecturers.length) return destroyRandom(assignment, 0.2);
    const target = randItem(allLecturers);
    const removed = assignment.filter(e => toLecturerArray(e.lecturers).includes(target));
    const kept    = assignment.filter(e => !toLecturerArray(e.lecturers).includes(target));
    return { kept, removed };
};

// D3 — remove all courses for a randomly chosen dept+level
const destroyLevel = (assignment, _frac) => {
    const levels = [...new Set(assignment.map(e => `${e.department}|${e.level}`))];
    if (!levels.length) return destroyRandom(assignment, 0.2);
    const [dept, level] = randItem(levels).split('|');
    const removed = assignment.filter(e => e.department === dept && String(e.level) === String(level));
    const kept    = assignment.filter(e => !(e.department === dept && String(e.level) === String(level)));
    return { kept, removed };
};

// D4 — remove courses involved in hard conflicts (room, lecturer, level clash)
const destroyConflicts = (assignment, _frac) => {
    const conflictIdx = new Set();
    for (let a = 0; a < assignment.length; a++) {
        for (let b = a + 1; b < assignment.length; b++) {
            const ea = assignment[a], eb = assignment[b];
            if (ea.day !== eb.day) continue;
            const sk = getSharedKey(ea);
            if (Boolean(sk) && sk === getSharedKey(eb)) continue;
            const as = parseTime(ea.time), ae = as + Number(ea.duration || 60);
            const bs = parseTime(eb.time), be = bs + Number(eb.duration || 60);
            if (as >= be || bs >= ae) continue;
            const roomClash = ea.venue && eb.venue && ea.venue !== 'Unassigned' && ea.venue === eb.venue;
            const lecClash  = toLecturerArray(ea.lecturers).some(l => toLecturerArray(eb.lecturers).includes(l));
            const lvlClash  = ea.department === eb.department && ea.level === eb.level;
            if (roomClash || lecClash || lvlClash) { conflictIdx.add(a); conflictIdx.add(b); }
        }
    }
    if (!conflictIdx.size) return destroyRandom(assignment, 0.15);
    return {
        kept:    assignment.filter((_, i) => !conflictIdx.has(i)),
        removed: assignment.filter((_, i) =>  conflictIdx.has(i)),
    };
};

// D5 — remove courses on a randomly chosen day
const destroyDay = (assignment, _frac) => {
    const day = randItem(DAYS);
    return {
        kept:    assignment.filter(e => e.day !== day),
        removed: assignment.filter(e => e.day === day),
    };
};

// D6 — remove courses whose individual slot cost is highest (worst-fit)
const destroyWorstFit = (assignment, venues, maxDailyHours, frac) => {
    const n = Math.max(1, Math.round(assignment.length * frac));
    // Score each entry by the cost it contributes when removed from the rest
    const scores = assignment.map((e, i) => {
        const without = assignment.filter((_, j) => j !== i);
        const withCost    = computeCost(assignment, venues, maxDailyHours);
        const withoutCost = computeCost(without,    venues, maxDailyHours);
        return { i, contribution: withCost - withoutCost };
    });
    scores.sort((a, b) => b.contribution - a.contribution);
    const toRemove = new Set(scores.slice(0, n).map(s => s.i));
    return {
        kept:    assignment.filter((_, i) => !toRemove.has(i)),
        removed: assignment.filter((_, i) =>  toRemove.has(i)),
    };
};

// =============================================================================
// REPAIR OPERATORS
// Each takes (kept, removed, slots, venues, maxDailyHours) and returns a new
// complete assignment.
// =============================================================================

// Slot cost: cost of inserting one course into a partial assignment at a slot
const slotInsertCost = (course, day, time, current, venues, maxDailyHours) => {
    const tentative = [...current, { ...course, day, time, venue: pickVenue(course, day, time, current, venues) }];
    return computeCost(tentative, venues, maxDailyHours);
};

// R1 — greedy repair: insert in most-constrained-first order, best slot each time
const repairGreedy = (kept, removed, slots, venues, maxDailyHours) => {
    const assignment = cloneArr(kept);
    // Most constrained = course that has fewest slots with zero hard-constraint cost
    const sortedRemoved = [...removed].sort((a, b) => {
        // proxy: more lecturers = more constrained
        return toLecturerArray(b.lecturers).length - toLecturerArray(a.lecturers).length;
    });
    for (const course of sortedRemoved) {
        let bestSlot = null, bestCost = Infinity;
        // Honour preferred slot if set
        const candidateSlots = [];
        if (course._prefDay !== 'AUTO' && course._prefTime !== 'AUTO') {
            candidateSlots.push({ day: course._prefDay, time: course._prefTime });
        }
        candidateSlots.push(...slots);
        for (const s of candidateSlots) {
            const c = slotInsertCost(course, s.day, s.time, assignment, venues, maxDailyHours);
            if (c < bestCost) { bestCost = c; bestSlot = s; }
        }
        const slot = bestSlot || randItem(slots);
        assignment.push({
            ...course,
            day:   slot.day,
            time:  slot.time,
            venue: pickVenue(course, slot.day, slot.time, assignment, venues),
        });
    }
    return assignment;
};

// R2 — regret-2 repair: always insert the course with highest regret first
// Regret = cost(best_slot) - cost(2nd_best_slot). High regret = few good options.
const repairRegret = (kept, removed, slots, venues, maxDailyHours) => {
    const assignment = cloneArr(kept);
    const pool = [...removed];
    while (pool.length > 0) {
        let chosenIdx = 0, highestRegret = -Infinity;
        let chosenBestSlot = null;
        for (let p = 0; p < pool.length; p++) {
            const course = pool[p];
            const costs = [];
            const candidateSlots = [];
            if (course._prefDay !== 'AUTO' && course._prefTime !== 'AUTO') {
                candidateSlots.push({ day: course._prefDay, time: course._prefTime });
            }
            candidateSlots.push(...slots);
            for (const s of candidateSlots) {
                costs.push({ slot: s, cost: slotInsertCost(course, s.day, s.time, assignment, venues, maxDailyHours) });
            }
            costs.sort((a, b) => a.cost - b.cost);
            const regret = costs.length >= 2 ? costs[1].cost - costs[0].cost : 0;
            if (regret > highestRegret) {
                highestRegret  = regret;
                chosenIdx      = p;
                chosenBestSlot = costs[0].slot;
            }
        }
        const course = pool.splice(chosenIdx, 1)[0];
        const slot = chosenBestSlot || randItem(slots);
        assignment.push({
            ...course,
            day:   slot.day,
            time:  slot.time,
            venue: pickVenue(course, slot.day, slot.time, assignment, venues),
        });
    }
    return assignment;
};

// R3 — random repair: random insertion order, best slot
const repairRandom = (kept, removed, slots, venues, maxDailyHours) => {
    const shuffled = [...removed].sort(() => 0.5 - Math.random());
    return repairGreedy(kept, shuffled, slots, venues, maxDailyHours);
};

// =============================================================================
// ADAPTIVE WEIGHT SELECTOR
// =============================================================================

const makeWeights = (ops) => ops.map(() => 1.0);

const rouletteSelect = (weights) => {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
    }
    return weights.length - 1;
};

const updateWeights = (weights, scores, useCounts, reaction) => {
    for (let i = 0; i < weights.length; i++) {
        if (useCounts[i] === 0) continue;
        const avg = scores[i] / useCounts[i];
        weights[i] = (1 - reaction) * weights[i] + reaction * avg;
        if (weights[i] < 0.01) weights[i] = 0.01;
    }
};

// =============================================================================
// GREEDY WARM-START
// =============================================================================

const greedyWarmStart = (courses, slots, venues, maxDailyHours) => {
    const sorted = [...courses].sort((a, b) => {
        const ac = isCompulsoryCourse(a) ? 1 : 0, bc = isCompulsoryCourse(b) ? 1 : 0;
        if (ac !== bc) return bc - ac;
        return Number(b.units || 0) - Number(a.units || 0);
    });
    const assignment = [];
    for (const course of sorted) {
        let placed = false;
        const candidates = [];
        if (course.preferred_day !== 'AUTO' && course.preferred_time !== 'AUTO')
            candidates.push({ day: course.preferred_day, time: course.preferred_time });
        candidates.push(...[...slots].sort(() => 0.5 - Math.random()));
        for (const s of candidates) {
            const dailyMins = assignment
                .filter(e => e.day === s.day && e.department === course.department && Number(e.level) === Number(course.level))
                .reduce((sum, e) => sum + Number(e.duration || 60), 0);
            if (dailyMins + Number(course.duration || 60) > maxDailyHours * 60) continue;
            assignment.push({
                ...course,
                day:       s.day,
                time:      s.time,
                venue:     pickVenue(course, s.day, s.time, assignment, venues),
                _prefDay:  course.preferred_day,
                _prefTime: course.preferred_time,
            });
            placed = true;
            break;
        }
        if (!placed) {
            const s = randItem(slots);
            assignment.push({
                ...course,
                day:       s.day,
                time:      s.time,
                venue:     pickVenue(course, s.day, s.time, assignment, venues),
                _prefDay:  course.preferred_day,
                _prefTime: course.preferred_time,
            });
        }
    }
    return assignment;
};

// =============================================================================
// ALNS CORE
// =============================================================================

// Single ALNS run — internal, called by runMultiStartALNS
const runALNS = (initial, slots, venues, maxDailyHours) => {
    const destroyOps = [
        destroyRandom,
        destroyLecturer,
        destroyLevel,
        destroyConflicts,
        destroyDay,
    ];
    const repairOps = [repairGreedy, repairRegret, repairRandom];

    const dWeights = makeWeights(destroyOps);
    const rWeights = makeWeights(repairOps);
    let dScores    = dWeights.map(() => 0), dCounts = dWeights.map(() => 0);
    let rScores    = rWeights.map(() => 0), rCounts = rWeights.map(() => 0);

    let current     = cloneArr(initial);
    let currentCost = computeCost(current, venues, maxDailyHours);
    let best        = cloneArr(current);
    let bestCost    = currentCost;

    const maxIter = Math.max(ALNS_ITERATIONS, initial.length * 30);
    let T = ALNS_INIT_TEMP;

    for (let iter = 0; iter < maxIter; iter++) {
        // Select operators via roulette wheel
        const di = rouletteSelect(dWeights);
        const ri = rouletteSelect(rWeights);

        // Compute destroy fraction — slightly random within bounds
        const frac = ALNS_DESTROY_MIN + Math.random() * (ALNS_DESTROY_MAX - ALNS_DESTROY_MIN);

        // Destroy — all operators use the same signature (assignment, frac)
        const dOp = destroyOps[di];
        let { kept, removed } = dOp(current, frac);

        if (!removed.length) { continue; }

        // Repair
        const candidate = repairOps[ri](kept, removed, slots, venues, maxDailyHours);
        const candidateCost = computeCost(candidate, venues, maxDailyHours);
        const delta = candidateCost - currentCost;

        dCounts[di]++; rCounts[ri]++;

        let score = 0;
        if (candidateCost < bestCost) {
            best     = cloneArr(candidate);
            bestCost = candidateCost;
            score    = ALNS_SCORE_NEW_BEST;
        } else if (candidateCost < currentCost) {
            score = ALNS_SCORE_IMPROVED;
        } else if (Math.random() < Math.exp(-delta / Math.max(T, 0.01))) {
            score = ALNS_SCORE_ACCEPTED;
        }

        if (score > 0) {
            current     = candidate;
            currentCost = candidateCost;
        }

        dScores[di] += score; rScores[ri] += score;

        // Update weights at end of each segment
        if ((iter + 1) % ALNS_SEGMENT === 0) {
            updateWeights(dWeights, dScores, dCounts, ALNS_REACTION);
            updateWeights(rWeights, rScores, rCounts, ALNS_REACTION);
            dScores = dWeights.map(() => 0); dCounts = dWeights.map(() => 0);
            rScores = rWeights.map(() => 0); rCounts = rWeights.map(() => 0);
        }

        T *= ALNS_COOLING;
    }

    return { schedule: best, finalCost: bestCost };
};

// Multi-start wrapper — runs ALNS `runs` times from independent warm starts
// and returns the best solution found across all runs.
const ALNS_RUNS = 4;

const runMultiStartALNS = (courses, slots, venues, maxDailyHours) => {
    let best = null;
    let bestCost = Infinity;

    for (let r = 0; r < ALNS_RUNS; r++) {
        const initial = greedyWarmStart(courses, slots, venues, maxDailyHours);
        const { schedule, finalCost } = runALNS(initial, slots, venues, maxDailyHours);
        if (finalCost < bestCost) {
            bestCost = finalCost;
            best = schedule;
        }
    }

    return { schedule: best, finalCost: bestCost };
};

// =============================================================================
// POST-PROCESSING
// =============================================================================

const cleanEntry = ({ _prefDay, _prefTime, ...rest }) => rest;

// Courses that still have unresolvable hard conflicts go to `unscheduled`
const separateUnscheduled = (schedule, venues, maxDailyHours) => {
    const scheduled = [], unscheduled = [];
    for (const entry of schedule) {
        const es = parseTime(entry.time), ee = es + Number(entry.duration || 60);
        const ek = getSharedKey(entry);
        const conflict = scheduled.some(other => {
            if (other.day !== entry.day) return false;
            if (Boolean(ek) && ek === getSharedKey(other)) return false;
            const os = parseTime(other.time), oe = os + Number(other.duration || 60);
            if (es >= oe || os >= ee) return false;
            if (other.venue && entry.venue && other.venue !== 'Unassigned' && other.venue === entry.venue) return true;
            if (toLecturerArray(entry.lecturers).some(l => toLecturerArray(other.lecturers).includes(l))) return true;
            if (other.department === entry.department && other.level === entry.level) return true;
            return false;
        });
        (conflict ? unscheduled : scheduled).push(cleanEntry(entry));
    }
    return { scheduled, unscheduled };
};

// =============================================================================
// FILTER HELPER
// =============================================================================

const applyFilters = (courses, type, options) =>
    courses.filter(c => {
        if (type && c.type && c.type !== type) return false;
        if (!matchesDepartmentFilter(c.department, options)) return false;
        if (options.level    && Number(c.level)    !== Number(options.level))  return false;
        if (options.semester && c.semester         && c.semester !== options.semester) return false;
        if (options.college  && c.college          && c.college  !== options.college)  return false;
        return true;
    });

// =============================================================================
// PUBLIC SCHEDULERS
// =============================================================================

const generateLectureSchedule = async (courses, options = {}) => {
    console.log('Generating Lecture Schedule (ALNS)...');
    const lectures = applyFilters(courses, 'Lecture', options);

    const rules           = options.rules || {};
    const maxDailyHours   = Number(rules.max_daily_hours_per_level || 6);
    const startHour       = Number(rules.default_start_hour || 9);
    const endHour         = Number(rules.default_end_hour   || 18);
    const venues          = options.venues || [];

    const times = TIMES.filter(t => {
        const h = Number(String(t).split(':')[0]);
        return h >= startHour && h < endHour;
    });
    const slots = DAYS.flatMap(day => times.map(time => ({ day, time })));

    if (!lectures.length) return { scheduled: [], unscheduled: [] };

    const { schedule } = runMultiStartALNS(lectures, slots, venues, maxDailyHours);
    return separateUnscheduled(schedule, venues, maxDailyHours);
};

const generateExamSchedule = async (courses, options = {}) => {
    console.log('Generating Exam Schedule (ALNS)...');
    const exams  = applyFilters(courses, 'Exam', options);
    const venues = options.venues || [];
    const slots  = DAYS.flatMap(day => EXAM_SLOTS.map(s => ({ day, time: s.time })));

    if (!exams.length) return { scheduled: [], unscheduled: [] };

    const maxDailyHours = 9;
    const { schedule } = runMultiStartALNS(exams, slots, venues, maxDailyHours);

    const annotated = schedule.map(e => ({
        ...e,
        slotName: (EXAM_SLOTS.find(s => s.time === e.time) || {}).name || '',
        venue:    e.venue || 'Exam Hall',
    }));
    return separateUnscheduled(annotated, venues, maxDailyHours);
};

const generateTestSchedule = async (courses, options = {}) => {
    console.log('Generating Test Schedule (ALNS)...');
    const tests  = applyFilters(courses, 'Test', options);
    const venues = options.venues || [];
    const slots  = DAYS.flatMap(day => TIMES.map(time => ({ day, time })));

    if (!tests.length) return { scheduled: [], unscheduled: [] };

    const maxDailyHours = 6;
    const { schedule } = runMultiStartALNS(tests, slots, venues, maxDailyHours);
    return separateUnscheduled(schedule, venues, maxDailyHours);
};

// =============================================================================
// LEGACY EXPORT — kept for any external callers
// =============================================================================

const hasConflict = (schedule, day, time, duration, course) => {
    const ns = parseTime(time), ne = ns + Number(duration);
    const ck = getSharedKey(course);
    for (const item of schedule) {
        if (item.day !== day) continue;
        const is = parseTime(item.time), ie = is + Number(item.duration || 60);
        if (ns >= ie || is >= ne) continue;
        const ik = getSharedKey(item);
        if (Boolean(ck) && ck === ik) continue;
        if (item.venue === course.venue && item.venue !== 'Unassigned' && item.venue !== '') return true;
        if (toLecturerArray(course.lecturers).some(l => toLecturerArray(item.lecturers).includes(l))) return true;
        if (item.department === course.department && item.level === course.level) return true;
    }
    return false;
};

// =============================================================================
// 1. CONFLICT EXPLANATION
// For each unscheduled course, scan every slot and tally why it was blocked.
// Returns the same course object with an added `unscheduledReason` string.
// =============================================================================

const explainUnscheduled = (course, scheduled, slots) => {
    const counts = { lecturer: 0, room: 0, level: 0, dailyCap: 0 };
    const rules = { maxDailyHours: 6 };
    const ck = getSharedKey(course);

    for (const slot of slots) {
        const ns = parseTime(slot.time), ne = ns + Number(course.duration || 60);
        let blocked = false;

        // Daily cap check
        const dailyMins = scheduled
            .filter(e => e.day === slot.day && e.department === course.department && Number(e.level) === Number(course.level))
            .reduce((s, e) => s + Number(e.duration || 60), 0);
        if (dailyMins + Number(course.duration || 60) > rules.maxDailyHours * 60) {
            counts.dailyCap++;
            blocked = true;
        }

        if (!blocked) {
            for (const item of scheduled) {
                if (item.day !== slot.day) continue;
                const is = parseTime(item.time), ie = is + Number(item.duration || 60);
                if (ns >= ie || is >= ne) continue;
                const ik = getSharedKey(item);
                if (Boolean(ck) && ck === ik) continue;

                if (item.venue && course.venue && item.venue !== 'Unassigned' && item.venue === course.venue) {
                    counts.room++; blocked = true; break;
                }
                if (toLecturerArray(course.lecturers).some(l => toLecturerArray(item.lecturers).includes(l))) {
                    counts.lecturer++; blocked = true; break;
                }
                if (item.department === course.department && item.level === course.level) {
                    counts.level++; blocked = true; break;
                }
            }
        }
    }

    const total = slots.length;
    const parts = [];
    if (counts.lecturer > 0) parts.push(`lecturer unavailable on ${counts.lecturer}/${total} slots`);
    if (counts.level    > 0) parts.push(`group clash on ${counts.level}/${total} slots`);
    if (counts.room     > 0) parts.push(`room conflict on ${counts.room}/${total} slots`);
    if (counts.dailyCap > 0) parts.push(`daily hour cap exceeded on ${counts.dailyCap}/${total} slots`);
    if (!parts.length)       parts.push('no available slot found in the configured time range');

    return { ...course, unscheduledReason: parts.join('; ') };
};

const attachUnscheduledReasons = (scheduled, unscheduled, slots) =>
    unscheduled.map(c => explainUnscheduled(c, scheduled, slots));

// =============================================================================
// 2. SCHEDULE QUALITY REPORT
// Analyses a completed schedule and returns a structured report.
// =============================================================================

const generateQualityReport = (scheduled, unscheduled = [], venues = [], maxDailyHours = 6) => {
    const hardConflicts = [];

    for (let a = 0; a < scheduled.length; a++) {
        for (let b = a + 1; b < scheduled.length; b++) {
            const ea = scheduled[a], eb = scheduled[b];
            if (ea.day !== eb.day) continue;
            const sk = getSharedKey(ea);
            if (Boolean(sk) && sk === getSharedKey(eb)) continue;
            const as = parseTime(ea.time), ae = as + Number(ea.duration || 60);
            const bs = parseTime(eb.time), be = bs + Number(eb.duration || 60);
            if (as >= be || bs >= ae) continue;

            const types = [];
            if (ea.venue && eb.venue && ea.venue !== 'Unassigned' && ea.venue === eb.venue) types.push('room');
            if (toLecturerArray(ea.lecturers).some(l => toLecturerArray(eb.lecturers).includes(l))) types.push('lecturer');
            if (ea.department === eb.department && ea.level === eb.level) types.push('group');
            if (types.length) hardConflicts.push({ courseA: ea.code, courseB: eb.code, day: ea.day, time: ea.time, types });
        }
    }

    // Overloaded days
    const dailyMin = {};
    for (const e of scheduled) {
        const k = `${e.department}|${e.level}|${e.day}`;
        dailyMin[k] = (dailyMin[k] || 0) + Number(e.duration || 60);
    }
    const overloadedDays = Object.entries(dailyMin)
        .filter(([, mins]) => mins > maxDailyHours * 60)
        .map(([k, mins]) => {
            const [department, level, day] = k.split('|');
            return { department, level, day, hours: +(mins / 60).toFixed(1), maxHours: maxDailyHours };
        });

    // Back-to-back sessions per lecturer (no gap between consecutive classes)
    const byLecturer = {};
    for (const e of scheduled) {
        for (const l of toLecturerArray(e.lecturers)) {
            const k = `${l}|${e.day}`;
            (byLecturer[k] = byLecturer[k] || []).push(e);
        }
    }
    const backToBack = [];
    for (const [k, sessions] of Object.entries(byLecturer)) {
        const [lecturer, day] = k.split('|');
        const sorted = sessions.slice().sort((a, b) => parseTime(a.time) - parseTime(b.time));
        const runs = [];
        let run = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
            const prev = run[run.length - 1];
            const prevEnd = parseTime(prev.time) + Number(prev.duration || 60);
            if (parseTime(sorted[i].time) === prevEnd) {
                run.push(sorted[i]);
            } else {
                if (run.length >= 2) runs.push([...run]);
                run = [sorted[i]];
            }
        }
        if (run.length >= 2) runs.push(run);
        for (const r of runs) {
            backToBack.push({
                lecturer,
                day,
                sessions: r.map(s => ({ code: s.code, time: s.time, duration: s.duration || 60 })),
                totalHours: +(r.reduce((sum, s) => sum + Number(s.duration || 60), 0) / 60).toFixed(1),
            });
        }
    }

    // Workload distribution
    const coursesPerDay = {};
    for (const e of scheduled) {
        const k = `${e.department}|${e.level}`;
        if (!coursesPerDay[k]) coursesPerDay[k] = {};
        coursesPerDay[k][e.day] = (coursesPerDay[k][e.day] || 0) + 1;
    }

    return {
        totalScheduled:   scheduled.length,
        totalUnscheduled: unscheduled.length,
        hardConflicts,
        overloadedDays,
        backToBack,
        score: {
            conflicts:   hardConflicts.length,
            overloaded:  overloadedDays.length,
            backToBack:  backToBack.length,
            unscheduled: unscheduled.length,
        },
    };
};

// =============================================================================
// 3. REOPTIMIZE AROUND A LOCKED COURSE
// Called after an admin manually moves a course. Locks the moved course in
// place, identifies all courses that share a lecturer or dept+level with it,
// and re-runs ALNS on that affected subset only — leaving everything else
// untouched.
// =============================================================================

const reoptimizeAround = (lockedCourse, allScheduled, unscheduled, slots, venues, maxDailyHours) => {
    const lockedLecturers = new Set(toLecturerArray(lockedCourse.lecturers));
    const lockedKey = `${lockedCourse.department}|${lockedCourse.level}`;

    const isAffected = (c) => {
        if (c.code === lockedCourse.code) return false; // locked itself
        if (`${c.department}|${c.level}` === lockedKey) return true;
        return toLecturerArray(c.lecturers).some(l => lockedLecturers.has(l));
    };

    // Partition: locked course + untouched courses + affected courses
    const locked    = allScheduled.filter(c => c.code === lockedCourse.code && c.day === lockedCourse.day && c.time === lockedCourse.time);
    const untouched = allScheduled.filter(c => !isAffected(c) && !(c.code === lockedCourse.code && c.day === lockedCourse.day && c.time === lockedCourse.time));
    const affected  = [
        ...allScheduled.filter(isAffected),
        ...unscheduled.filter(isAffected),
    ].map(c => ({ ...c, _prefDay: c.preferred_day, _prefTime: c.preferred_time }));

    if (!affected.length) {
        return { scheduled: allScheduled, unscheduled };
    }

    // Run ALNS on affected subset with locked course already in the fixed set
    const fixedContext = [...locked, ...untouched];
    const initial = greedyWarmStart(affected, slots, venues, maxDailyHours);

    // Inject fixed context into cost function by wrapping the assignment
    const initialWithContext = [...fixedContext, ...initial];
    const { schedule: best } = runALNS(initialWithContext, slots, venues, maxDailyHours);

    // Split best back into fixed + reoptimized portion
    const reoptimizedCodes = new Set(affected.map(c => c.code));
    const reoptimizedPart  = best.filter(e => reoptimizedCodes.has(e.code));

    const finalScheduled = [...untouched, ...locked, ...reoptimizedPart];
    const { scheduled: cleanScheduled, unscheduled: cleanUnscheduled } =
        separateUnscheduled(finalScheduled, venues, maxDailyHours);

    return { scheduled: cleanScheduled, unscheduled: cleanUnscheduled };
};

module.exports = {
    generateLectureSchedule,
    generateExamSchedule,
    generateTestSchedule,
    hasConflict,
    attachUnscheduledReasons,
    generateQualityReport,
    reoptimizeAround,
};
