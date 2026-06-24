require('dotenv').config();
const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');

const timingSafeEqual = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }
    const aHash = crypto.createHash('sha256').update(a).digest();
    const bHash = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(aHash, bHash);
};

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { initDatabase, db: rawDb, DB_PROVIDER } = require('./database/schema');
const { repositories } = require('./data/repositories');
const path = require('path');
const { createStudentSessionToken, verifyStudentSessionToken, DEFAULT_TTL_SECONDS } = require('./security/studentSession');
const { issuePortalAuthCode, consumePortalAuthCode } = require('./security/portalAuthCodeStore');
const { provisionStudentFromPortal } = require('./services/portalStudentProvisioner');

const { adminRepo, customFieldsRepo, coursesRepo, timetablesRepo, studentsRepo, timetableCoursesRepo, auditLogRepo, courseCatalogRepo } = repositories;

const app = express();
app.set('trust proxy', 1); // trust Render/reverse-proxy X-Forwarded-For
const PORT = process.env.PORT || 5000;
const STUDENT_AUTH_MODE = process.env.MTU_STUDENT_AUTH_MODE || 'legacy';
const MTU_PORTAL_SHARED_SECRET = process.env.MTU_PORTAL_SHARED_SECRET || '';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const PORTAL_AUTH_CODE_TTL_SECONDS = Number(process.env.MTU_PORTAL_CODE_TTL_SECONDS) > 0
    ? Number(process.env.MTU_PORTAL_CODE_TTL_SECONDS)
    : 120;

// Debug Logger
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
});

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. curl, mobile apps) and all localhost origins
        if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }
        // Allow any origin in development; tighten this in production via env
        const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        // Default: allow all (permissive dev setup)
        callback(null, true);
    },
    credentials: true,
    exposedHeaders: ['Content-Disposition']
}));
app.use(bodyParser.json());

// Rate limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later.' }
});
app.use('/api', generalLimiter);
app.use('/api/student/login', authLimiter);
app.use('/api/student/portal/authorize', authLimiter);
app.use('/api/student/portal/exchange', authLimiter);
app.use('/api/admin/ping', authLimiter);

process.on('exit', (code) => {
    console.log(`About to exit with code: ${code}`);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Initialize Database
initDatabase();

const getActiveRules = async () => {
    const rows = await adminRepo.listRules();
    const rules = {};
    rows
        .filter(row => row.is_active === true || Number(row.is_active) === 1)
        .forEach(row => {
            rules[row.rule_key] = row.rule_value;
        });
    return rules;
};

const to12HourForExport = (t) => {
    if (!t) return t;
    if (String(t).includes('AM') || String(t).includes('PM')) return t;
    const [hStr, mStr] = String(t).split(':');
    const h = parseInt(hStr, 10);
    const m = mStr || '00';
    if (h === 0) return `12:${m} AM`;
    if (h < 12) return `${h}:${m} AM`;
    if (h === 12) return `12:${m} PM`;
    return `${h - 12}:${m} PM`;
};

const EXPORT_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const EXPORT_TIMES = ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM'];

const flattenForExport = (courses) => courses.map(course => ({
    code: course.code,
    title: course.title,
    college: course.college || '',
    department: course.department,
    level: course.level,
    semester: course.semester,
    day: course.day || '',
    time: to12HourForExport(course.time) || '',
    venue: course.venue || '',
    units: course.units,
    duration_minutes: course.duration,
    lecturers: Array.isArray(course.lecturers) ? course.lecturers.join(', ') : course.lecturers
}));

// Build Excel grid workbook (rows=days, cols=time slots)
const buildExcelGrid = async (rows, sheetTitle) => {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet(sheetTitle || 'Timetable');

    // Header row
    const headerRow = ws.addRow(['Day / Time', ...EXPORT_TIMES]);
    headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4C1D95' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' },
            bottom: { style: 'thin' }, right: { style: 'thin' }
        };
    });
    ws.getColumn(1).width = 14;
    EXPORT_TIMES.forEach((_, i) => { ws.getColumn(i + 2).width = 22; });
    ws.getRow(1).height = 28;

    // Data rows
    EXPORT_DAYS.forEach((day, dIdx) => {
        const excelRowIndex = dIdx + 2;
        const dataRow = ws.addRow([day, ...EXPORT_TIMES.map(() => '')]);

        // Row height: each course occupies 2 text lines (code + venue) plus 1 separator
        // line between courses → (3n - 1) lines total. At ~15pt/line + padding, 55pt
        // per course ensures all content is fully visible without clipping.
        const maxCoursesInSlot = Math.max(
            1,
            ...EXPORT_TIMES.map(time => rows.filter(r => r.day === day && r.time === time).length)
        );
        dataRow.height = Math.max(55, maxCoursesInSlot * 55);

        const dayCell = dataRow.getCell(1);
        dayCell.font = { bold: true };
        dayCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        dayCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: dIdx % 2 === 0 ? 'FFF5F3FF' : 'FFFAF5FF' } };
        dayCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        const consumed = new Set();
        EXPORT_TIMES.forEach((time, tIdx) => {
            const colNumber = tIdx + 2;
            // Skip slave cells of already-merged regions entirely
            if (consumed.has(tIdx)) return;
            const courses = rows.filter(r => r.day === day && r.time === time);
            const colSpan = courses.length > 0
                ? Math.max(1, Math.round((courses[0].duration_minutes || 60) / 60))
                : 1;
            const clampedSpan = Math.min(colSpan, EXPORT_TIMES.length - tIdx);

            // Mark consumed slots BEFORE touching any cells
            for (let c = 1; c < clampedSpan; c++) consumed.add(tIdx + c);

            // Merge FIRST — ExcelJS resets all cells in the range on merge,
            // so any value set before mergeCells() would be wiped.
            if (clampedSpan > 1) {
                const endCol = colNumber + clampedSpan - 1;
                ws.mergeCells(excelRowIndex, colNumber, excelRowIndex, endCol);
            }

            // Now safe to write to the master cell (the merge is already done)
            const cell = dataRow.getCell(colNumber);
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
            if (courses.length > 0) {
                cell.value = courses.map(c => `${c.code}\n${c.venue || 'Unassigned'}`).join('\n· · · · ·\n');
            }
        });
    });

    return workbook.xlsx.writeBuffer();
};

// Build PDF grid (rows=days, cols=time slots)
const buildPdfGrid = (rows, title, subtitle1, subtitle2, onEnd, onError) => {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('error', onError);
    doc.on('end', () => onEnd(Buffer.concat(chunks)));

    // Title
    doc.fontSize(14).font('Helvetica-Bold').text(title, { underline: true });
    doc.fontSize(9).font('Helvetica').text(subtitle1);
    if (subtitle2) doc.text(subtitle2);
    doc.moveDown(0.5);

    const pageWidth = doc.page.width - 60; // margins
    const colCount = EXPORT_TIMES.length + 1; // day col + time cols
    const dayColW = 62;
    const timeColW = (pageWidth - dayColW) / EXPORT_TIMES.length;
    const rowH = 56;
    const headerH = 24;
    const startX = 30;
    let startY = doc.y;

    // Draw header
    doc.rect(startX, startY, dayColW, headerH).fillAndStroke('#4C1D95', '#4C1D95');
    doc.fillColor('white').fontSize(7).font('Helvetica-Bold')
        .text('Day / Time', startX + 2, startY + 7, { width: dayColW - 4, align: 'center' });
    EXPORT_TIMES.forEach((t, i) => {
        const x = startX + dayColW + i * timeColW;
        doc.rect(x, startY, timeColW, headerH).fillAndStroke('#4C1D95', '#4C1D95');
        doc.fillColor('white').fontSize(6.5).font('Helvetica-Bold')
            .text(t, x + 2, startY + 8, { width: timeColW - 4, align: 'center' });
    });
    startY += headerH;

    // Draw data rows
    EXPORT_DAYS.forEach((day, dIdx) => {
        const rowBg = dIdx % 2 === 0 ? '#F5F3FF' : '#FAF5FF';
        doc.rect(startX, startY, dayColW, rowH).fillAndStroke(rowBg, '#CCCCCC');
        doc.fillColor('#1E1B4B').fontSize(7).font('Helvetica-Bold')
            .text(day, startX + 2, startY + rowH / 2 - 6, { width: dayColW - 4, align: 'center' });

        const consumed = new Set();
        EXPORT_TIMES.forEach((time, i) => {
            if (consumed.has(i)) return;
            const x = startX + dayColW + i * timeColW;
            const courses = rows.filter(r => r.day === day && r.time === time);
            const colSpan = courses.length > 0
                ? Math.max(1, Math.round((courses[0].duration_minutes || 60) / 60))
                : 1;
            const cellW = timeColW * Math.min(colSpan, EXPORT_TIMES.length - i);
            doc.rect(x, startY, cellW, rowH).fillAndStroke('#FFFFFF', '#CCCCCC');
            if (courses.length > 0) {
                for (let c = 1; c < colSpan && i + c < EXPORT_TIMES.length; c++) consumed.add(i + c);
                let ty = startY + 3;
                courses.forEach((c, ci) => {
                    if (ci > 0) {
                        // Draw dashed separator between concurrent courses
                        doc.save();
                        doc.lineWidth(0.5).dash(2, { space: 2 })
                            .moveTo(x + 3, ty).lineTo(x + cellW - 3, ty)
                            .strokeColor('#CCCCCC').stroke();
                        doc.restore();
                        ty += 4;
                    }
                    doc.fillColor('#1E1B4B').fontSize(6.5).font('Helvetica-Bold')
                        .text(c.code, x + 3, ty, { width: cellW - 6, lineBreak: false });
                    ty += 9;
                    doc.fillColor('#6B7280').fontSize(5.5).font('Helvetica')
                        .text(c.venue || 'Unassigned', x + 3, ty, { width: cellW - 6, lineBreak: false });
                    ty += 8;
                });
            }
        });
        startY += rowH;
    });

    doc.end();
};

// Build Word grid (rows=days, cols=time slots)
const buildWordGrid = async (rows, title, subtitle1, subtitle2) => {
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, BorderStyle } = require('docx');
    const border = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' };
    const cellBorders = { top: border, bottom: border, left: border, right: border };
    const headerShading = { type: ShadingType.SOLID, color: '4C1D95' };
    const colWidths = [1200, ...EXPORT_TIMES.map(() => Math.floor(7000 / EXPORT_TIMES.length))];

    const headerCells = [
        new TableCell({ width: { size: colWidths[0], type: WidthType.DXA }, shading: headerShading, borders: cellBorders,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Day / Time', bold: true, color: 'FFFFFF', size: 16 })] })] })
    ];
    EXPORT_TIMES.forEach((t, i) => {
        headerCells.push(new TableCell({
            width: { size: colWidths[i + 1], type: WidthType.DXA }, shading: headerShading, borders: cellBorders,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, bold: true, color: 'FFFFFF', size: 14 })] })]
        }));
    });

    const timeColW = Math.floor(7000 / EXPORT_TIMES.length);

    const dataRows = EXPORT_DAYS.map((day, dIdx) => {
        const cells = [new TableCell({
            width: { size: colWidths[0], type: WidthType.DXA },
            shading: { type: ShadingType.SOLID, color: dIdx % 2 === 0 ? 'EDE9FE' : 'F5F3FF' },
            borders: cellBorders,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: day, bold: true, size: 16, color: '1E1B4B' })] })]
        })];
        const consumed = new Set();
        EXPORT_TIMES.forEach((time, i) => {
            if (consumed.has(i)) return;
            const courses = rows.filter(r => r.day === day && r.time === time);
            const colSpan = courses.length > 0
                ? Math.max(1, Math.round((courses[0].duration_minutes || 60) / 60))
                : 1;
            const clampedSpan = Math.min(colSpan, EXPORT_TIMES.length - i);
            for (let c = 1; c < clampedSpan; c++) consumed.add(i + c);
            cells.push(new TableCell({
                width: { size: timeColW * clampedSpan, type: WidthType.DXA },
                borders: cellBorders,
                columnSpan: clampedSpan > 1 ? clampedSpan : undefined,
                children: courses.length === 0
                    ? [new Paragraph('')]
                    : courses.flatMap((c, ci) => [
                        ...(ci > 0 ? [new Paragraph({
                            border: { top: { style: BorderStyle.DASHED, size: 4, color: 'CCCCCC' } },
                            children: [new TextRun({ text: '' })]
                        })] : []),
                        new Paragraph({ children: [new TextRun({ text: c.code, bold: true, color: '4C1D95', size: 16 })] }),
                        new Paragraph({ children: [new TextRun({ text: c.venue || 'Unassigned', size: 12, color: '6B7280' })] }),
                    ])
            }));
        });
        return new TableRow({ children: cells });
    });

    const table = new Table({ rows: [new TableRow({ children: headerCells }), ...dataRows], width: { size: 100, type: WidthType.PERCENTAGE } });
    const doc = new Document({
        sections: [{ properties: {}, children: [
            new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 28 })] }),
            new Paragraph({ children: [new TextRun({ text: subtitle1, size: 18 })] }),
            ...(subtitle2 ? [new Paragraph({ children: [new TextRun({ text: subtitle2, size: 18 })] })] : []),
            new Paragraph(''),
            table
        ]}]
    });
    return Packer.toBuffer(doc);
};

const parseVenueSeats = (payload = {}) => {
    const parsed = Number(payload.seats ?? payload.capacity ?? 0);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const withVenueSeatsAlias = (venue) => ({
    ...venue,
    seats: Number(venue?.capacity || 0)
});

// Direct Student Login (Legacy Only)
const handleStudentLogin = async (req, res) => {
    if (isPortalTokenMode()) {
        return res.status(403).json({
            error: 'Direct login is not supported. Please access your timetable through the MTU Student Portal.'
        });
    }

    const { matric_number } = req.body || {};
    if (!matric_number) {
        return res.status(400).json({ error: 'matric_number is required' });
    }

    try {
        const student = await studentsRepo.getByMatric(matric_number);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }
        return res.json({ data: student });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const getBearerToken = (authorizationHeader = '') => {
    if (!authorizationHeader || typeof authorizationHeader !== 'string') {
        return null;
    }
    const [scheme, token] = authorizationHeader.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
        return null;
    }
    return token;
};

const isPortalTokenMode = () => STUDENT_AUTH_MODE === 'portal-token';

// --- Admin RBAC Middleware ---
const requireAdmin = (req, res, next) => {
    if (!ADMIN_API_KEY) {
        return res.status(503).json({ error: 'Admin access is not configured. Set ADMIN_API_KEY in .env.' });
    }
    const provided = req.headers['x-admin-key'];
    if (!provided || !timingSafeEqual(provided, ADMIN_API_KEY)) {
        return res.status(401).json({ error: 'Unauthorized. Valid admin key required.' });
    }
    next();
};

const assertPortalTokenAccess = (req, res) => {
    if (!isPortalTokenMode()) {
        return true;
    }

    const bearer = getBearerToken(req.headers.authorization);
    if (!bearer) {
        res.status(401).json({ error: 'Missing portal session token' });
        return false;
    }

    let payload;
    try {
        payload = verifyStudentSessionToken(bearer);
    } catch (err) {
        res.status(500).json({ error: err.message });
        return false;
    }

    if (!payload) {
        res.status(401).json({ error: 'Invalid or expired portal session token' });
        return false;
    }

    const requestedMatric = decodeURIComponent(req.params.matric_number || '');
    if (payload.sub !== requestedMatric) {
        res.status(403).json({ error: 'Portal session does not match requested student' });
        return false;
    }

    return true;
};

const getStudentTimetablePayload = async (matric_number) => {
    // Try local DB first; fall back to JIT provisioning from MTU Portal API
    let student = await studentsRepo.getByMatric(matric_number);
    if (!student) {
        console.log(`[Timetable] Student ${matric_number} not in local DB — attempting JIT provisioning...`);
        student = await provisionStudentFromPortal(matric_number, studentsRepo);
    }
    if (!student) {
        const error = new Error('Student not found. Please access your timetable through the MTU Student Portal.');
        error.status = 404;
        throw error;
    }

    const [registrations, results] = await Promise.all([
        studentsRepo.listRegisteredCourses(matric_number),
        studentsRepo.listCarryoverResults(matric_number)
    ]);

    const registeredCodes = registrations.map(r => r.course_code);
    const carryoverCodes = results.map(r => r.course_code);
    const allStudentCourses = [...new Set([...registeredCodes, ...carryoverCodes])];

    const timetableRow = await studentsRepo.getLatestLectureTimetable();
    if (!timetableRow) {
        const error = new Error('No active timetable found');
        error.status = 404;
        throw error;
    }

    let timetableData;
    try {
        timetableData = typeof timetableRow.data === 'string'
            ? JSON.parse(timetableRow.data)
            : (timetableRow.data || { scheduled: [], unscheduled: [] });
    } catch {
        timetableData = { scheduled: [], unscheduled: [] };
    }

    const scheduledCourses = timetableData.scheduled || [];
    const studentSchedule = scheduledCourses.filter(course =>
        allStudentCourses.includes(course.code)
    ).map(course => ({
        ...course,
        is_carryover: carryoverCodes.includes(course.code)
    }));

    for (let i = 0; i < studentSchedule.length; i++) {
        for (let j = i + 1; j < studentSchedule.length; j++) {
            const c1 = studentSchedule[i];
            const c2 = studentSchedule[j];

            if (c1.day === c2.day) {
                const start1 = parseInt(c1.time.split(':')[0]) * 60 + parseInt(c1.time.split(':')[1] || 0);
                const end1 = start1 + c1.duration;
                const start2 = parseInt(c2.time.split(':')[0]) * 60 + parseInt(c2.time.split(':')[1] || 0);
                const end2 = start2 + c2.duration;

                if (start1 < end2 && start2 < end1) {
                    c1.clash_warning = true;
                    c2.clash_warning = true;
                }
            }
        }
    }

    return {
        student,
        timetable: {
            ...timetableRow,
            data: {
                scheduled: studentSchedule,
                unscheduled: []
            }
        }
    };
};

const handleStudentTimetable = (req, res) => {
    const { matric_number } = req.params;

    if (!assertPortalTokenAccess(req, res)) {
        return;
    }

    getStudentTimetablePayload(matric_number)
        .then(payload => res.json(payload))
        .catch((err) => {
            const status = err.status || 500;
            res.status(status).json({ error: err.message });
        });
};

// Admin auth ping — lightweight endpoint to validate the admin key
app.get('/api/admin/ping', requireAdmin, (req, res) => {
    res.json({ ok: true });
});

console.log('Registering Student API Routes...');

// --- Student API ---

app.post('/api/student/portal/session', async (req, res) => {
    const incomingSecret = req.headers['x-mtu-portal-secret'];
    if (!MTU_PORTAL_SHARED_SECRET || !timingSafeEqual(incomingSecret, MTU_PORTAL_SHARED_SECRET)) {
        return res.status(401).json({ error: 'Unauthorized integration client' });
    }

    const { matric_number, ttl_seconds } = req.body || {};
    if (!matric_number) {
        return res.status(400).json({ error: 'matric_number is required' });
    }

    const ttl = Number(ttl_seconds) > 0 ? Number(ttl_seconds) : DEFAULT_TTL_SECONDS;

    try {
        let student = await studentsRepo.getByMatric(matric_number);
        if (!student) {
            console.log(`[Portal Session] JIT provisioning for ${matric_number}...`);
            student = await provisionStudentFromPortal(matric_number, studentsRepo);
        }
        if (!student) {
            return res.status(404).json({ error: 'Student not found in portal. Ensure the student is registered on the MTU Portal.' });
        }

        const token = createStudentSessionToken(matric_number, ttl);
        const nowSeconds = Math.floor(Date.now() / 1000);
        return res.json({
            data: {
                matric_number,
                token,
                token_type: 'Bearer',
                expires_at: nowSeconds + ttl
            }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/student/portal/authorize', async (req, res) => {
    const incomingSecret = req.headers['x-mtu-portal-secret'];
    if (!MTU_PORTAL_SHARED_SECRET || !timingSafeEqual(incomingSecret, MTU_PORTAL_SHARED_SECRET)) {
        return res.status(401).json({ error: 'Unauthorized integration client' });
    }

    const { matric_number } = req.body || {};
    if (!matric_number) {
        return res.status(400).json({ error: 'matric_number is required' });
    }

    try {
        let student = await studentsRepo.getByMatric(matric_number);
        if (!student) {
            console.log(`[Portal Authorize] JIT provisioning for ${matric_number}...`);
            student = await provisionStudentFromPortal(matric_number, studentsRepo);
        }
        if (!student) {
            return res.status(404).json({ error: 'Student not found in portal. Ensure the student is registered on the MTU Portal.' });
        }

        const { code, exp } = issuePortalAuthCode(matric_number, PORTAL_AUTH_CODE_TTL_SECONDS);

        return res.json({
            data: {
                matric_number,
                portal_code: code,
                expires_at: exp,
                token_exchange_path: '/api/student/portal/exchange'
            }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/student/portal/exchange', async (req, res) => {
    const { portal_code } = req.body || {};
    const payload = consumePortalAuthCode(portal_code);

    if (!payload || !payload.matric_number) {
        return res.status(401).json({ error: 'Invalid or expired portal code' });
    }

    try {
        let student = await studentsRepo.getByMatric(payload.matric_number);
        if (!student) {
            console.log(`[Portal Exchange] JIT provisioning for ${payload.matric_number}...`);
            student = await provisionStudentFromPortal(payload.matric_number, studentsRepo);
        }
        if (!student) {
            return res.status(404).json({ error: 'Student not found in portal. Ensure the student is registered on the MTU Portal.' });
        }

        const token = createStudentSessionToken(payload.matric_number, DEFAULT_TTL_SECONDS);
        const now = Math.floor(Date.now() / 1000);

        return res.json({
            data: {
                matric_number: payload.matric_number,
                token,
                token_type: 'Bearer',
                expires_at: now + DEFAULT_TTL_SECONDS
            }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Student Login — disabled. Access is portal-SSO only.
app.post('/api/student/login', (req, res) => handleStudentLogin(req, res));

// Get Student Timetable
app.get(/^\/api\/student\/(.+)\/timetable$/, (req, res) => {
    req.params.matric_number = req.params[0];
    handleStudentTimetable(req, res);
});

// Export Student Timetable (Excel, PDF, Word)
app.get(/^\/api\/student\/(.+)\/timetable\/export$/, async (req, res) => {
    req.params.matric_number = req.params[0];
    const { matric_number } = req.params;
    const { format = 'excel' } = req.query;

    if (!assertPortalTokenAccess(req, res)) {
        return;
    }

    try {
        const payload = await getStudentTimetablePayload(matric_number);
        const scheduled = payload.timetable.data.scheduled;
        const rows = flattenForExport(scheduled);
        // Replace slash with underscore in matric for filename
        const safeMatric = String(matric_number).replace(/[\/\\]/g, '_');
        const baseName = `Timetable_${safeMatric}`;

        if (format === 'excel') {
            const buffer = await buildExcelGrid(rows, `Timetable: ${matric_number}`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${baseName}.xlsx`);
            return res.send(buffer);
        }

        if (format === 'pdf') {
            buildPdfGrid(
                rows,
                `Personal Timetable: ${matric_number}`,
                `Name: ${payload.student.name || 'Student'}`,
                `Department: ${payload.student.department || 'N/A'} | Level: ${payload.student.level || 'N/A'}`,
                (pdfBuffer) => {
                    if (!res.headersSent) {
                        res.setHeader('Content-Type', 'application/pdf');
                        res.setHeader('Content-Disposition', `attachment; filename=${baseName}.pdf`);
                        res.send(pdfBuffer);
                    }
                },
                (pdfErr) => {
                    console.error('[Student PDF Export] PDFKit error:', pdfErr);
                    if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed: ' + pdfErr.message });
                }
            );
            return;
        }

        if (format === 'word') {
            const buffer = await buildWordGrid(
                rows,
                `Personal Timetable: ${matric_number}`,
                `Name: ${payload.student.name || 'Student'}`,
                `Department: ${payload.student.department || 'N/A'} | Level: ${payload.student.level || 'N/A'}`
            );
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', `attachment; filename=${baseName}.docx`);
            return res.send(buffer);
        }

        return res.status(400).json({ error: 'Unsupported format. Use excel, pdf, or word.' });
    } catch (err) {
        const status = err.status || 500;
        return res.status(status).json({ error: err.message });
    }
});

// Routes
app.get('/', (req, res) => {
    res.send('MTU AI Timetable Generator API is running');
});

// --- Custom Fields API ---

// Get all custom fields
app.get('/api/custom-fields', (req, res) => {
    customFieldsRepo.list()
        .then(rows => res.json({ data: rows }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// Add a new custom field
app.post('/api/custom-fields', requireAdmin, (req, res) => {
    const { name, label, type, required } = req.body;
    customFieldsRepo.create({ name, label, type, required })
        .then(result => res.json({ message: 'Custom field added', id: result.id }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// Delete a custom field
app.delete('/api/custom-fields/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    customFieldsRepo.deleteById(id)
        .then(() => res.json({ message: 'Custom field deleted' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// --- Admin Entity APIs ---

app.get('/api/admin/colleges', (req, res) => {
    adminRepo.listColleges()
        .then(rows => res.json({ data: rows }))
        .catch(err => res.status(500).json({ error: err.message }));
});

app.post('/api/admin/colleges', requireAdmin, (req, res) => {
    const { code, name, is_active = 1 } = req.body;
    adminRepo.createCollege({ code, name, is_active })
        .then(result => {
            writeAuditLog('CREATE', 'college', result.lastID, `code=${code} name=${name}`, req.ip);
            res.json({ message: 'College added', id: result.lastID });
        })
        .catch(err => res.status(400).json({ error: err.message }));
});

app.put('/api/admin/colleges/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { code, name, is_active = 1 } = req.body;
    adminRepo.updateCollege(id, { code, name, is_active })
        .then(() => {
            writeAuditLog('UPDATE', 'college', id, `code=${code} name=${name}`, req.ip);
            res.json({ message: 'College updated' });
        })
        .catch(err => res.status(400).json({ error: err.message }));
});

app.delete('/api/admin/colleges/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    adminRepo.deleteCollege(id)
        .then(() => {
            writeAuditLog('DELETE', 'college', id, null, req.ip);
            res.json({ message: 'College deleted' });
        })
        .catch(err => res.status(400).json({ error: err.message }));
});

app.get('/api/admin/departments', (req, res) => {
    const { college_code } = req.query;
    adminRepo.listDepartments(college_code || null)
        .then(rows => res.json({ data: rows }))
        .catch(err => res.status(500).json({ error: err.message }));
});

app.post('/api/admin/departments', requireAdmin, (req, res) => {
    const { code, name, college_code, is_active = 1 } = req.body;
    adminRepo.createDepartment({ code, name, college_code, is_active })
        .then(result => {
            writeAuditLog('CREATE', 'department', result.lastID, `code=${code} name=${name} college=${college_code}`, req.ip);
            res.json({ message: 'Department added', id: result.lastID });
        })
        .catch(err => res.status(400).json({ error: err.message }));
});

app.put('/api/admin/departments/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { code, name, college_code, is_active = 1 } = req.body;
    adminRepo.updateDepartment(id, { code, name, college_code, is_active })
        .then(() => {
            writeAuditLog('UPDATE', 'department', id, `code=${code} name=${name}`, req.ip);
            res.json({ message: 'Department updated' });
        })
        .catch(err => res.status(400).json({ error: err.message }));
});

app.delete('/api/admin/departments/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    adminRepo.deleteDepartment(id)
        .then(() => {
            writeAuditLog('DELETE', 'department', id, null, req.ip);
            res.json({ message: 'Department deleted' });
        })
        .catch(err => res.status(400).json({ error: err.message }));
});

app.get('/api/admin/lecturers', (req, res) => {
    adminRepo.listLecturers()
        .then(rows => res.json({ data: rows }))
        .catch(err => res.status(500).json({ error: err.message }));
});

app.post('/api/admin/lecturers', requireAdmin, (req, res) => {
    const { name, department_code, email = null } = req.body;
    adminRepo.createLecturer({ name, department_code, email })
        .then(result => {
            writeAuditLog('CREATE', 'lecturer', result.lastID, `name=${name} dept=${department_code}`, req.ip);
            res.json({ message: 'Lecturer added', id: result.lastID });
        })
        .catch(err => res.status(400).json({ error: err.message }));
});

app.put('/api/admin/lecturers/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { name, department_code, email = null } = req.body;
    adminRepo.updateLecturer(id, { name, department_code, email })
        .then(() => {
            writeAuditLog('UPDATE', 'lecturer', id, `name=${name}`, req.ip);
            res.json({ message: 'Lecturer updated' });
        })
        .catch(err => res.status(400).json({ error: err.message }));
});

app.delete('/api/admin/lecturers/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    adminRepo.deleteLecturer(id)
        .then(() => {
            writeAuditLog('DELETE', 'lecturer', id, null, req.ip);
            res.json({ message: 'Lecturer deleted' });
        })
        .catch(err => res.status(400).json({ error: err.message }));
});

app.get('/api/admin/venues', (req, res) => {
    adminRepo.listVenues()
        .then(rows => res.json({ data: rows.map(withVenueSeatsAlias) }))
        .catch(err => res.status(500).json({ error: err.message }));
});

app.post('/api/admin/venues', requireAdmin, (req, res) => {
    const { name, college_code = null } = req.body;
    const capacity = parseVenueSeats(req.body);
    adminRepo.createVenue({ name, college_code, capacity })
        .then(result => {
            writeAuditLog('CREATE', 'venue', result.lastID, `name=${name} capacity=${capacity}`, req.ip);
            res.json({ message: 'Venue added', id: result.lastID, seats: capacity });
        })
        .catch(err => res.status(400).json({ error: err.message }));
});

app.put('/api/admin/venues/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { name, college_code = null } = req.body;
    const capacity = parseVenueSeats(req.body);
    adminRepo.updateVenue(id, { name, college_code, capacity })
        .then(() => {
            writeAuditLog('UPDATE', 'venue', id, `name=${name} capacity=${capacity}`, req.ip);
            res.json({ message: 'Venue updated', seats: capacity });
        })
        .catch(err => res.status(400).json({ error: err.message }));
});

app.delete('/api/admin/venues/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    adminRepo.deleteVenue(id)
        .then(() => {
            writeAuditLog('DELETE', 'venue', id, null, req.ip);
            res.json({ message: 'Venue deleted' });
        })
        .catch(err => res.status(400).json({ error: err.message }));
});

app.get('/api/admin/rules', (req, res) => {
    adminRepo.listRules()
        .then(rows => res.json({ data: rows }))
        .catch(err => res.status(500).json({ error: err.message }));
});

app.put('/api/admin/rules/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { name, rule_key, rule_value, is_active = 1 } = req.body;
    adminRepo.updateRule(id, { name, rule_key, rule_value, is_active })
        .then(() => res.json({ message: 'Rule updated' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// Course Catalog routes
app.get('/api/course-catalog', (req, res) => {
    const { department, level, semester, college } = req.query;
    courseCatalogRepo.list({ department, level, semester: semester || undefined, college: college || undefined })
        .then(data => res.json({ data }))
        .catch(err => res.status(500).json({ error: err.message }));
});

app.post('/api/course-catalog', requireAdmin, (req, res) => {
    courseCatalogRepo.create(req.body)
        .then(result => res.json({ message: 'Course saved to catalog', id: result.lastID }))
        .catch(err => res.status(400).json({ error: err.message }));
});

app.put('/api/course-catalog/:id', requireAdmin, (req, res) => {
    courseCatalogRepo.update(req.params.id, req.body)
        .then(() => res.json({ message: 'Catalog course updated' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

app.delete('/api/course-catalog/:id', requireAdmin, (req, res) => {
    courseCatalogRepo.remove(req.params.id)
        .then(() => res.json({ message: 'Catalog course deleted' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

app.get('/api/options', (req, res) => {
    adminRepo.getOptions()
        .then(data => res.json({
            data: {
                ...data,
                venues: (data.venues || []).map(withVenueSeatsAlias)
            }
        }))
        .catch(err => res.status(500).json({ error: err.message }));
});

// Internal helper: auto-sync courses from MTU Portal if configured.
// Called automatically by handleGenerate — no manual trigger needed.
const autoSyncCoursesFromPortal = async ({ timetable_id, timetableRow, department }) => {
    const MTU_PORTAL_API_URL = process.env.MTU_PORTAL_API_URL || '';
    const MTU_PORTAL_API_KEY = process.env.MTU_PORTAL_API_KEY || '';

    if (!MTU_PORTAL_API_URL) {
        return { synced: false, reason: 'MTU_PORTAL_API_URL not configured' };
    }

    const college = timetableRow.college || null;
    const headers = { 'Content-Type': 'application/json' };
    if (MTU_PORTAL_API_KEY) {
        headers['x-api-key'] = MTU_PORTAL_API_KEY;
    }

    const params = new URLSearchParams();
    if (college) params.append('college', college);
    if (department) params.append('department', department);
    if (timetableRow.semester) params.append('semester', timetableRow.semester);
    if (timetableRow.academic_session) params.append('session', timetableRow.academic_session);

    const catalogUrl = `${MTU_PORTAL_API_URL.replace(/\/$/, '')}/courses?${params.toString()}`;

    let portalResponse;
    try {
        portalResponse = await fetch(catalogUrl, { headers });
    } catch (fetchErr) {
        console.warn('[Portal Sync] Could not reach MTU Portal API:', fetchErr.message);
        return { synced: false, reason: fetchErr.message };
    }

    if (!portalResponse.ok) {
        const errText = await portalResponse.text();
        console.warn(`[Portal Sync] MTU Portal API returned ${portalResponse.status}:`, errText);
        return { synced: false, reason: `Portal API ${portalResponse.status}` };
    }

    const portalData = await portalResponse.json();
    let rawCourses = Array.isArray(portalData)
        ? portalData
        : (Array.isArray(portalData.courses) ? portalData.courses : []);

    // Post-filter by department in case portal ignores the query param
    if (department) {
        const normalizedFilter = String(department).trim().toLowerCase();
        rawCourses = rawCourses.filter(raw => {
            const dept = String(raw.department || raw.dept || raw.department_code || '').trim().toLowerCase();
            return dept === normalizedFilter;
        });
    }

    let imported = 0;
    let skipped = 0;

    for (const raw of rawCourses) {
        try {
            const code = raw.code || raw.course_code || raw.courseCode || '';
            const title = raw.title || raw.name || raw.course_title || raw.courseTitle || '';
            const dept = raw.department || raw.dept || raw.department_code || '';
            const level = Number(raw.level || raw.year || 0);
            const units = Number(raw.units || raw.credit_units || raw.creditUnits || 1);
            const semester = raw.semester || timetableRow.semester || 'First';
            const type = raw.type || 'Lecture';
            const is_compulsory = raw.is_compulsory || raw.compulsory || false;
            const lecturers = Array.isArray(raw.lecturers)
                ? raw.lecturers
                : (raw.lecturer ? [raw.lecturer] : []);
            const duration = Number(raw.duration_hours || raw.duration || 1) * 60;
            const student_count = Number(raw.student_count || raw.students || 0);

            if (!code || !title || !dept || !level) {
                skipped++;
                continue;
            }

            const created = await coursesRepo.create({
                code, title, college, department: dept, level, lecturers,
                units, semester, type, is_compulsory,
                preferred_day: 'AUTO', preferred_time: 'AUTO',
                venue: '', duration, student_count, custom_data: {}
            });
            await timetableCoursesRepo.assignCourse(timetable_id, created.lastID);
            imported++;
        } catch {
            skipped++;
        }
    }

    console.log(`[Portal Sync] Imported: ${imported}, Skipped: ${skipped}`);
    return { synced: true, imported, skipped };
};

// Add a new course
app.post('/api/courses', requireAdmin, (req, res) => {
    const { code, title, department, level, lecturers, units, semester, type, is_compulsory, preferred_day, preferred_time, venue, duration, custom_data } = req.body;
    // API accepts duration in hours; store duration in minutes.
    const durationInMinutes = parseFloat(duration) * 60;
    const timetable_id = req.body.timetable_id;

    (timetable_id ? timetablesRepo.getRawById(timetable_id) : Promise.resolve(null))
        .then(async (timetableRow) => {
            if (timetable_id && !timetableRow) {
                throw new Error('Invalid timetable_id');
            }

            const college = timetableRow ? timetableRow.college || null : null;
            const result = await coursesRepo.create({
                code,
                title,
                college,
                department,
                level,
                lecturers,
                units,
                semester,
                type,
                is_compulsory,
                preferred_day,
                preferred_time,
                venue,
                duration: durationInMinutes,
                custom_data
            });
            if (timetable_id) {
                await timetableCoursesRepo.assignCourse(timetable_id, result.lastID);
            }
            return result;
        })
        .then((result) => {
            res.json({ message: 'Course added successfully', id: result.lastID });
        })
        .catch((err) => {
            console.error('[POST /api/courses] error:', err.message, '| body:', JSON.stringify(req.body));
            if (err.message === 'Invalid timetable_id') {
                return res.status(400).json({ error: 'Invalid timetable_id' });
            }
            return res.status(400).json({ error: err.message });
        });
});
// Bulk Add courses
app.post('/api/courses/bulk', requireAdmin, async (req, res) => {
    const { courses } = req.body;
    if (!Array.isArray(courses)) {
        return res.status(400).json({ error: 'Expected an array of courses' });
    }

    let addedCount = 0;
    let errors = [];

    for (let i = 0; i < courses.length; i++) {
        const c = courses[i];
        try {
            const durationInMinutes = parseFloat(c.duration || 1) * 60;
            let college = null;
            if (c.timetable_id) {
                const timetableRow = await timetablesRepo.getRawById(c.timetable_id);
                if (!timetableRow) throw new Error('Invalid timetable_id');
                college = timetableRow.college || null;
            }

            const created = await coursesRepo.create({
                code: c.code,
                title: c.title,
                college,
                department: c.department,
                level: c.level,
                lecturers: Array.isArray(c.lecturers) ? c.lecturers : (c.lecturers ? String(c.lecturers).split(',').map(l => l.trim()) : []),
                units: c.units,
                semester: c.semester || 'First',
                type: c.type || 'Lecture',
                is_compulsory: c.is_compulsory === 'true' || c.is_compulsory === true,
                preferred_day: c.preferred_day || 'AUTO',
                preferred_time: c.preferred_time || 'AUTO',
                venue: c.venue || '',
                duration: durationInMinutes,
                custom_data: c.custom_data || {}
            });
            if (c.timetable_id) {
                await timetableCoursesRepo.assignCourse(c.timetable_id, created.lastID);
            }
            addedCount++;
        } catch (err) {
            errors.push(`Row ${i + 1} (${c.code}): ${err.message}`);
        }
    }

    res.json({ message: `Successfully added ${addedCount} courses.`, addedCount, errors });
});

// Get all courses
app.get('/api/courses', (req, res) => {
    const { timetable_id } = req.query;
    coursesRepo.list({ timetableId: timetable_id })
        .then((rows) => {
            const courses = rows.map(row => {
                const custom_data = typeof row.custom_data === 'string'
                    ? (row.custom_data ? JSON.parse(row.custom_data) : {})
                    : (row.custom_data || {});
                const is_compulsory =
                    row.is_compulsory === true || row.is_compulsory === 1 || row.is_compulsory === '1' || row.is_compulsory === 'true'
                    || custom_data.is_compulsory === true || custom_data.is_compulsory === 1;
                return { ...row, is_compulsory, custom_data };
            });
            res.json({ data: courses });
        })
        .catch((err) => {
            console.error('[GET /api/courses] error:', err.message);
            res.status(400).json({ error: err.message });
        });
});

// Get master courses (not assigned to any timetable) - MUST be before /api/courses/:id
app.get('/api/courses/master', (req, res) => {
    timetableCoursesRepo.getMasterCourses()
        .then(courses => res.json({ data: courses }))
        .catch(err => {
            console.error('getMasterCourses error:', err);
            res.status(400).json({ error: err.message || 'Unknown error' });
        });
});

// Get single course
app.get('/api/courses/:id', (req, res) => {
    const { id } = req.params;
    coursesRepo.getById(id)
        .then((course) => {
            if (!course) {
                return res.status(404).json({ error: 'Course not found' });
            }
            res.json({ data: course });
        })
        .catch((err) => {
            res.status(400).json({ error: err.message });
        });
});

// Update a course
app.put('/api/courses/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { code, title, department, level, lecturers, units, semester, type, is_compulsory, preferred_day, preferred_time, venue, duration, custom_data } = req.body;
    const durationInMinutes = parseFloat(duration) * 60;

    coursesRepo.getById(id)
        .then((existing) => {
            if (!existing) {
                throw new Error('Course not found');
            }
            return coursesRepo.update(id, {
                code,
                title,
                college: existing.college,
                department,
                level,
                lecturers,
                units,
                semester,
                type,
                is_compulsory,
                preferred_day,
                preferred_time,
                venue,
                duration: durationInMinutes,
                custom_data
            });
        })
        .then(() => {
            res.json({ message: 'Course updated successfully' });
        })
        .catch((err) => {
            if (err.message === 'Course not found') {
                return res.status(404).json({ error: 'Course not found' });
            }
            res.status(400).json({ error: err.message });
        });
});

// Delete a course
app.delete('/api/courses/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    coursesRepo.remove(id)
        .then(() => {
            res.json({ message: 'Course deleted successfully' });
        })
        .catch((err) => {
            res.status(400).json({ error: err.message });
        });
});

// --- Timetable-Courses Relationship APIs ---

// Diagnostic: Direct Supabase test
app.get('/api/debug/supabase', requireAdmin, async (req, res) => {
    try {
        const { getSupabaseClient } = require('./database/supabaseAdapter');
        const supabase = getSupabaseClient();

        // Test 1: Simple count query
        const { data: countData, error: countError } = await supabase
            .from('courses')
            .select('*', { count: 'exact', head: true });

        // Test 2: Try to get all courses (no filter)
        const { data: allData, error: allError } = await supabase
            .from('courses')
            .select('id, code, title')
            .limit(5);

        // Test 3: Check timetable_courses junction table
        const { data: nullData, error: nullError } = await supabase
            .from('timetable_courses')
            .select('timetable_id, course_id')
            .limit(5);

        res.json({
            test1_count: { data: countData, error: countError },
            test2_all: { data: allData, error: allError },
            test3_null_filter: { data: nullData, error: nullError }
        });
    } catch (err) {
        console.error('Debug endpoint error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get courses for a specific timetable
app.get('/api/timetables/:id/courses', (req, res) => {
    const { id } = req.params;
    timetableCoursesRepo.getCoursesByTimetableId(id)
        .then(courses => res.json({ data: courses }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// Assign a course to a timetable
app.post('/api/timetables/:id/courses', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { course_id } = req.body;
    if (!course_id) {
        return res.status(400).json({ error: 'course_id is required' });
    }
    timetableCoursesRepo.assignCourse(id, course_id)
        .then(() => res.json({ message: 'Course assigned to timetable' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// Assign multiple courses to a timetable
app.post('/api/timetables/:id/courses/bulk', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { course_ids } = req.body;
    if (!Array.isArray(course_ids) || course_ids.length === 0) {
        return res.status(400).json({ error: 'course_ids array is required' });
    }
    timetableCoursesRepo.assignCourses(id, course_ids)
        .then(() => res.json({ message: `${course_ids.length} courses assigned to timetable` }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// Remove a course from a timetable
app.delete('/api/timetables/:timetableId/courses/:courseId', requireAdmin, (req, res) => {
    const { timetableId, courseId } = req.params;
    timetableCoursesRepo.removeCourse(timetableId, courseId)
        .then(() => res.json({ message: 'Course removed from timetable' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// Copy courses from one timetable to another
app.post('/api/timetables/:id/courses/copy', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { source_timetable_id } = req.body;
    if (!source_timetable_id) {
        return res.status(400).json({ error: 'source_timetable_id is required' });
    }
    timetableCoursesRepo.copyCoursesFromTimetable(id, source_timetable_id)
        .then(() => res.json({ message: 'Courses copied from source timetable' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// --- Timetable CRUD APIs ---

// List all timetables
app.get('/api/timetables', (req, res) => {
    const { college } = req.query;
    timetablesRepo.list({ college: college || null })
        .then(rows => res.json({ data: rows }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// Get specific timetable
app.get('/api/timetables/:id', (req, res) => {
    const { id } = req.params;
    timetablesRepo.getById(id)
        .then((row) => {
            if (row) {
                res.json({ data: row });
            } else {
                res.status(404).json({ error: 'Timetable not found' });
            }
        })
        .catch(err => res.status(400).json({ error: err.message }));
});

// Create new timetable (Empty)
app.post('/api/timetables', requireAdmin, (req, res) => {
    const { type, name, academic_session, semester, college } = req.body;

    adminRepo.getActiveCollegeByCode(college)
        .then((row) => {
            if (!row) {
                throw new Error('INVALID_COLLEGE');
            }
            return timetablesRepo.create({ type, name, academic_session, semester, college });
        })
        .then((created) => {
            res.json({ message: 'Timetable created', id: created.id });
        })
        .catch((err) => {
            if (err.message === 'INVALID_COLLEGE') {
                return res.status(400).json({ error: 'Invalid or missing college. Configure colleges in Admin Setup.' });
            }
            return res.status(500).json({ error: err.message });
        });
});

// Update timetable metadata
app.put('/api/timetables/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { name, academic_session, semester, status } = req.body;
    timetablesRepo.updateMeta(id, { name, academic_session, semester, status })
        .then(() => res.json({ message: 'Timetable updated' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// Delete timetable
app.delete('/api/timetables/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    timetablesRepo.deleteById(id)
        .then(() => res.json({ message: 'Timetable deleted' }))
        .catch(err => res.status(400).json({ error: err.message }));
});

// Duplicate timetable
app.post('/api/timetables/:id/duplicate', requireAdmin, (req, res) => {
    const { id } = req.params;
    timetablesRepo.duplicateById(id)
        .then((result) => {
            if (!result) {
                return res.status(400).json({ error: 'Timetable not found' });
            }
            return res.json({ message: 'Timetable duplicated', id: result.lastID });
        })
        .catch(err => res.status(400).json({ error: err.message }));
});

// Generate Timetable (Creates NEW entry)
const { generateLectureSchedule, generateExamSchedule, generateTestSchedule } = require('./ai/scheduler');

const handleGenerate = async (req, res, generateFn, type) => {
    const { timetable_id, scope = 'college', department = null, level = null, semester = null } = req.body;
    if (!timetable_id) {
        return res.status(400).json({ error: 'timetable_id is required' });
    }

    try {
        const timetableRow = await timetablesRepo.getRawById(timetable_id);
        if (!timetableRow) {
            return res.status(400).json({ error: 'Invalid timetable_id' });
        }

        // Auto-sync courses from MTU Portal if configured — no manual step needed.
        const syncDepartment = scope === 'department' ? department : null;
        const syncResult = await autoSyncCoursesFromPortal({
            timetable_id,
            timetableRow,
            department: syncDepartment
        });
        if (syncResult.synced) {
            console.log(`[Generate] Portal auto-sync: ${syncResult.imported} imported, ${syncResult.skipped} skipped.`);
        }

        const courses = await coursesRepo.listByTimetableId(timetable_id);

        if (courses.length === 0) {
            return res.status(400).json({ error: 'No courses found for this timetable. Please add courses first.' });
        }

        const rules = await getActiveRules();
        const venues = await adminRepo.listVenues();
        let departmentAliases = [];

        if (scope === 'department' && department) {
            const allDepartments = await adminRepo.listDepartments();
            const normalizedSelected = String(department).trim().toLowerCase();
            const matchedDepartment = (allDepartments || []).find((d) => {
                const code = String(d.code || '').trim().toLowerCase();
                const name = String(d.name || '').trim().toLowerCase();
                return code === normalizedSelected || name === normalizedSelected;
            });

            if (matchedDepartment) {
                departmentAliases = Array.from(new Set([
                    String(department).trim(),
                    String(matchedDepartment.code || '').trim(),
                    String(matchedDepartment.name || '').trim()
                ].filter(Boolean)));
            } else {
                departmentAliases = [String(department).trim()];
            }
        }

        const filterOptions = {
            scope,
            department: scope === 'department' ? department : null,
            departmentAliases,
            level: level || null,
            semester: semester || timetableRow.semester || null,
            college: timetableRow.college,
            rules,
            venues: venues.filter(v => !v.college_code || v.college_code === timetableRow.college)
        };

        const schedule = await generateFn(courses, filterOptions);
        const generatedData = Array.isArray(schedule)
            ? { scheduled: schedule, unscheduled: [] }
            : {
                scheduled: Array.isArray(schedule?.scheduled) ? schedule.scheduled : [],
                unscheduled: Array.isArray(schedule?.unscheduled) ? schedule.unscheduled : []
            };
        const finalData = JSON.stringify(generatedData);

        await timetablesRepo.updateGeneratedDataById(timetable_id, finalData);

        writeAuditLog('GENERATE', 'timetable', timetable_id, `type=${type} scope=${scope} dept=${department || 'all'}`, req.ip);
        res.json({
            message: `${type} timetable generated`,
            id: timetable_id,
            data: generatedData
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

app.post('/api/generate/lectures', requireAdmin, (req, res) => handleGenerate(req, res, generateLectureSchedule, 'Lecture'));
app.post('/api/generate/exams', requireAdmin, (req, res) => handleGenerate(req, res, generateExamSchedule, 'Exam'));
app.post('/api/generate/tests', requireAdmin, (req, res) => handleGenerate(req, res, generateTestSchedule, 'Test'));

// Validate Timetable Move
app.post('/api/timetables/validate', requireAdmin, (req, res) => {
    const { schedule, course, day, time } = req.body;
    const { hasConflict } = require('./ai/scheduler');

    // Check if the move creates a conflict
    // We need to filter out the course itself from the schedule if it's already there (for move operations)
    const otherCourses = schedule.filter(c => c.code !== course.code);
    const conflict = hasConflict(otherCourses, day, time, course.duration || 60, course);

    res.json({ valid: !conflict });
});


// Save Timetable (Specific ID)
app.post('/api/timetables/:id/save', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { scheduled, unscheduled } = req.body;

    const data = JSON.stringify({ scheduled, unscheduled });

    timetablesRepo.updateDataById(id, data)
        .then(() => res.json({ message: 'Timetable saved successfully' }))
        .catch((err) => res.status(400).json({ error: err.message }));
});

// Clear Unscheduled Courses (Specific ID)
app.post('/api/timetables/:id/clear-unscheduled', requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const row = await timetablesRepo.getById(id);
        if (!row) return res.status(400).json({ error: 'Timetable not found' });

        const currentData = row.data;
        const scheduled = Array.isArray(currentData) ? currentData : (currentData.scheduled || []);
        const unscheduled = Array.isArray(currentData) ? [] : (currentData.unscheduled || []);

        // Unassign courses that are only in unscheduled (not placed in the grid),
        // so the injection logic on reload won't re-add them.
        const scheduledIds = new Set(scheduled.map(c => c.id).filter(Boolean));
        const toUnassign = unscheduled.map(c => c.id).filter(id => id && !scheduledIds.has(id));

        await timetablesRepo.updateDataById(id, JSON.stringify({ scheduled, unscheduled: [] }));
        if (toUnassign.length > 0) {
            await timetableCoursesRepo.removeCourses(id, toUnassign);
        }

        res.json({ message: 'Unscheduled courses cleared' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Latest timetable by type (legacy compatibility endpoint)
app.get('/api/timetables/latest/:type', (req, res) => {
    const { type } = req.params;
    timetablesRepo.getLatestByType(type)
        .then((row) => {
            if (row) {
                const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
                return res.json({ data: parsed, meta: row });
            }
            return res.json({ data: { scheduled: [], unscheduled: [] } });
        })
        .catch((err) => res.status(400).json({ error: err.message }));
});

// Export Timetable (Excel, PDF, Word)
app.get('/api/timetables/:id/export', async (req, res) => {
    const { id } = req.params;
    const { format = 'excel', department, level } = req.query;
    try {
        const timetable = await timetablesRepo.getRawById(id);
        if (!timetable) {
            return res.status(404).json({ error: 'Timetable not found' });
        }

        let data;
        try {
            data = typeof timetable.data === 'string'
                ? JSON.parse(timetable.data || '{"scheduled":[],"unscheduled":[]}')
                : (timetable.data || { scheduled: [], unscheduled: [] });
        } catch {
            data = { scheduled: [], unscheduled: [] };
        }

        const scheduled = Array.isArray(data) ? data : (data.scheduled || []);
        const filtered = scheduled.filter(item => {
            if (department && item.department !== department) return false;
            if (level && Number(item.level) !== Number(level)) return false;
            return true;
        });
        const rows = flattenForExport(filtered);
        const baseName = `${timetable.name || 'timetable'}_${department || 'all'}_${level || 'all'}`.replace(/\s+/g, '_');

        if (format === 'excel') {
            const buffer = await buildExcelGrid(rows, timetable.name || 'Timetable');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${baseName}.xlsx`);
            return res.send(buffer);
        }

        if (format === 'pdf') {
            buildPdfGrid(
                rows,
                `${timetable.name || 'Timetable'}`,
                `College: ${timetable.college || 'N/A'} | Semester: ${timetable.semester || 'N/A'}`,
                `Department: ${department || 'All'} | Level: ${level || 'All'}`,
                (pdfBuffer) => {
                    if (!res.headersSent) {
                        res.setHeader('Content-Type', 'application/pdf');
                        res.setHeader('Content-Disposition', `attachment; filename=${baseName}.pdf`);
                        res.send(pdfBuffer);
                    }
                },
                (pdfErr) => {
                    console.error('[PDF Export] PDFKit error:', pdfErr);
                    if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed: ' + pdfErr.message });
                }
            );
            return;
        }

        if (format === 'word') {
            const buffer = await buildWordGrid(
                rows,
                `${timetable.name || 'Timetable'}`,
                `College: ${timetable.college || 'N/A'} | Semester: ${timetable.semester || 'N/A'}`,
                `Department: ${department || 'All'} | Level: ${level || 'All'}`
            );
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', `attachment; filename=${baseName}.docx`);
            return res.send(buffer);
        }

        return res.status(400).json({ error: 'Unsupported format. Use excel, pdf, or word.' });
    } catch (err) {
        const status = err.status || 500;
        return res.status(status).json({ error: err.message || 'Export failed' });
    }
});


// --- Audit Log ---

const writeAuditLog = (action, entity_type, entity_id, detail, ip_address) => {
    auditLogRepo.write({ action, entity_type, entity_id, detail, ip_address });
};

app.get('/api/admin/audit-log', requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 100, 500);
        const offset = Number(req.query.offset) || 0;
        const rows = await auditLogRepo.list({ limit, offset });
        res.json({ data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Conflict Detection ---

app.get('/api/timetables/:id/conflicts', requireAdmin, async (req, res) => {
    try {
        const timetable = await timetablesRepo.getRawById(req.params.id);
        if (!timetable) return res.status(404).json({ error: 'Timetable not found' });

        let data;
        try {
            data = typeof timetable.data === 'string' ? JSON.parse(timetable.data) : timetable.data;
        } catch {
            data = { scheduled: [] };
        }

        const courses = Array.isArray(data) ? data : (data.scheduled || []);
        const conflicts = [];

        const parseMinutes = (t) => {
            if (!t) return null;
            const [h, m] = String(t).split(':').map(Number);
            return h * 60 + (m || 0);
        };

        for (let i = 0; i < courses.length; i++) {
            for (let j = i + 1; j < courses.length; j++) {
                const a = courses[i];
                const b = courses[j];
                if (!a.day || !b.day || a.day !== b.day) continue;

                const aStart = parseMinutes(a.time);
                const bStart = parseMinutes(b.time);
                if (aStart === null || bStart === null) continue;

                const aEnd = aStart + (a.duration || 60);
                const bEnd = bStart + (b.duration || 60);
                const overlap = aStart < bEnd && bStart < aEnd;
                if (!overlap) continue;

                // Venue conflict
                if (a.venue && b.venue && a.venue === b.venue) {
                    conflicts.push({
                        type: 'venue',
                        day: a.day,
                        time: a.time,
                        venue: a.venue,
                        courses: [a.code, b.code],
                        message: `Venue "${a.venue}" double-booked on ${a.day} at ${a.time} (${a.code} & ${b.code})`
                    });
                }

                // Lecturer conflict
                const aLecturers = Array.isArray(a.lecturers) ? a.lecturers : (a.lecturers ? [a.lecturers] : []);
                const bLecturers = Array.isArray(b.lecturers) ? b.lecturers : (b.lecturers ? [b.lecturers] : []);
                const sharedLecturers = aLecturers.filter(l => bLecturers.includes(l));
                sharedLecturers.forEach(lecturer => {
                    conflicts.push({
                        type: 'lecturer',
                        day: a.day,
                        time: a.time,
                        lecturer,
                        courses: [a.code, b.code],
                        message: `Lecturer "${lecturer}" scheduled twice on ${a.day} at ${a.time} (${a.code} & ${b.code})`
                    });
                });

                // Level conflict (same dept + level at same time)
                if (a.department && b.department && a.department === b.department &&
                    a.level && b.level && a.level === b.level) {
                    conflicts.push({
                        type: 'level',
                        day: a.day,
                        time: a.time,
                        department: a.department,
                        level: a.level,
                        courses: [a.code, b.code],
                        message: `${a.department} Level ${a.level} has overlapping classes on ${a.day} at ${a.time} (${a.code} & ${b.code})`
                    });
                }
            }
        }

        res.json({ data: conflicts, total: conflicts.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

server.on('close', () => {
    console.log('Server closed');
});

// Keep-alive hack to prevent premature exit if event loop drains
setInterval(() => {
    // console.log('Heartbeat');
}, 10000);
