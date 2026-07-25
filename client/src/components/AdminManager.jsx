import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import API_BASE_URL from '../apiBase';
import { adminHeaders } from '../adminAuth';
import FloatingNotice from './FloatingNotice';
import getNoticeTimeoutMs from '../noticeTimeout';

const emptyForms = {
    college: { code: '', name: '' },
    department: { code: '', name: '', college_code: '' },
    lecturer: { name: '', department_code: '', email: '' },
    venue: { name: '', college_code: '', capacity: '' },
    course: { code: '', title: '', department: '', level: '', lecturers: [], units: '', semester: 'First', type: 'Lecture', is_compulsory: false, preferred_day: 'AUTO', preferred_time: 'AUTO', venue: '', duration: 1, timetable_id: '' }
};

const SectionCard = ({ title, subtitle, children }) => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="p-6">{children}</div>
    </div>
);

const DeleteButton = ({ onClick }) => (
    <button 
        onClick={onClick} 
        className="text-red-600 hover:text-red-800 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
    >
        Delete
    </button>
);

const AddButton = ({ onClick, children }) => (
    <button 
        onClick={onClick} 
        className="bg-[#4c1d95] hover:bg-[#3c1780] text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
    >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
        </svg>
        {children}
    </button>
);

const FormInput = ({ ...props }) => (
    <input
        className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent text-sm w-full"
        {...props}
    />
);

// Generic CSV bulk-upload bar used by each setup section.
// `fields`  — array of { key, label, required? } describing expected columns
// `onUpload` — async fn(rows) → { message, errors? }
// `templateName` — filename for the downloaded sample CSV
const BulkUploadBar = ({ fields, onUpload, templateName }) => {
    const inputId = React.useId();

    const downloadTemplate = () => {
        const headers = fields.map(f => f.label);
        const sample = fields.map(f => f.sample || '');
        const csv = headers.join(',') + '\n' + sample.map(v => `"${v}"`).join(',');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.setAttribute('download', templateName || 'template.csv');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleFile = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) { alert('CSV is empty or missing header row.'); return; }

        // Simple RFC-4180 line parser (same logic as courses bulk)
        const parseLine = (line) => {
            const out = []; let field = ''; let inQ = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (inQ) { if (ch === '"') { if (line[i+1] === '"') { field += '"'; i++; } else { inQ = false; } } else { field += ch; } }
                else { if (ch === '"') { inQ = true; } else if (ch === ',') { out.push(field.trim()); field = ''; } else { field += ch; } }
            }
            out.push(field.trim());
            return out;
        };

        const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
        const rows = lines.slice(1).map(line => {
            const vals = parseLine(line);
            const row = {};
            fields.forEach(f => {
                const idx = headers.findIndex(h => h.includes(f.key.toLowerCase()) || h === f.label.toLowerCase().replace(/\s+/g, '_'));
                row[f.key] = idx >= 0 ? vals[idx] || '' : '';
            });
            return row;
        }).filter(r => fields.filter(f => f.required).every(f => r[f.key]));

        if (rows.length === 0) { alert('No valid rows found. Make sure required columns are filled.'); return; }
        await onUpload(rows);
        e.target.value = '';
    };

    return (
        <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-slate-500 mr-1">Bulk import:</span>
            <button onClick={downloadTemplate} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg flex items-center gap-1 transition-colors border border-slate-300">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Template
            </button>
            <input type="file" id={inputId} accept=".csv" className="hidden" onChange={handleFile} />
            <label htmlFor={inputId} className="px-3 py-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-medium rounded-lg flex items-center gap-1 transition-colors cursor-pointer">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Upload CSV
            </label>
        </div>
    );
};

const AddRuleForm = ({ onCreate }) => {
    const empty = { name: '', rule_key: '', rule_value: '', is_active: 1 };
    const [form, setForm] = React.useState(empty);
    const [saving, setSaving] = React.useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name || !form.rule_key || form.rule_value === '') return;
        setSaving(true);
        const ok = await onCreate(form);
        if (ok) setForm(empty);
        setSaving(false);
    };

    return (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Add New Rule</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Rule Name *</label>
                    <FormInput required placeholder="e.g. Max lectures per day" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Key *</label>
                    <FormInput required placeholder="e.g. max_lectures_per_day" value={form.rule_key} onChange={e => setForm(p => ({ ...p, rule_key: e.target.value }))} className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent text-sm w-full font-mono" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Value *</label>
                    <FormInput required placeholder="e.g. 4" value={form.rule_value} onChange={e => setForm(p => ({ ...p, rule_value: e.target.value }))} />
                </div>
                <div className="flex flex-col justify-end gap-2 sm:flex-row sm:items-end">
                    <select value={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: Number(e.target.value) }))} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#4c1d95]">
                        <option value={1}>Active</option>
                        <option value={0}>Inactive</option>
                    </select>
                    <button type="submit" disabled={saving} className="bg-[#4c1d95] hover:bg-[#3c1780] text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap">
                        {saving ? 'Adding…' : 'Add Rule'}
                    </button>
                </div>
            </div>
        </form>
    );
};

const FormSelect = ({ children, ...props }) => (
    <select 
        className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent text-sm w-full" 
        {...props}
    >
        {children}
    </select>
);

const EmptyState = ({ icon, message }) => (
    <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-lg border border-slate-100">
        <div className="text-3xl mb-2">{icon}</div>
        <p className="text-sm">{message}</p>
    </div>
);

const AdminManager = () => {
    const [colleges, setColleges] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [lecturers, setLecturers] = useState([]);
    const [venues, setVenues] = useState([]);
    const [rules, setRules] = useState([]);
    const [courses, setCourses] = useState([]);
    const [masterCourses, setMasterCourses] = useState([]);
    const [timetables, setTimetables] = useState([]);
    const [forms, setForms] = useState(emptyForms);
    const [lecturerText, setLecturerText] = useState('');
    const [notice, setNotice] = useState({ message: '', type: 'info' });
    const [editingCourseId, setEditingCourseId] = useState(null);
    const [editingMasterCourseId, setEditingMasterCourseId] = useState(null);
    const masterCourseFormRef = useRef(null);
    const [courseSearch, setCourseSearch] = useState('');
    const [courseFilterDept, setCourseFilterDept] = useState('');
    const [courseFilterLevel, setCourseFilterLevel] = useState('');
    const [selectedTimetableForAssign, setSelectedTimetableForAssign] = useState('');
    const [selectedMasterCourseIds, setSelectedMasterCourseIds] = useState(new Set());
    const [editingCollegeId, setEditingCollegeId] = useState(null);
    const [editingCollegeData, setEditingCollegeData] = useState({});
    const [editingDepartmentId, setEditingDepartmentId] = useState(null);
    const [editingDepartmentData, setEditingDepartmentData] = useState({});
    const [editingLecturerId, setEditingLecturerId] = useState(null);
    const [editingLecturerData, setEditingLecturerData] = useState({});
    const [editingVenueId, setEditingVenueId] = useState(null);
    const [editingVenueData, setEditingVenueData] = useState({});

    const fetchAll = async () => {
        const [cRes, dRes, lRes, vRes, rRes, coRes, tRes, mRes] = await Promise.all([
            fetch(`${API_BASE_URL}/admin/colleges`),
            fetch(`${API_BASE_URL}/admin/departments`),
            fetch(`${API_BASE_URL}/admin/lecturers`),
            fetch(`${API_BASE_URL}/admin/venues`),
            fetch(`${API_BASE_URL}/admin/rules`),
            fetch(`${API_BASE_URL}/courses`, { headers: adminHeaders() }),
            fetch(`${API_BASE_URL}/timetables`, { headers: adminHeaders() }),
            fetch(`${API_BASE_URL}/courses/master`, { headers: adminHeaders() })
        ]);

        const [cData, dData, lData, vData, rData, coData, tData, mData] = await Promise.all([
            cRes.json(), dRes.json(), lRes.json(), vRes.json(), rRes.json(), coRes.json(), tRes.json(), mRes.json()
        ]);

        setColleges(cData.data || []);
        setDepartments(dData.data || []);
        setLecturers(lData.data || []);
        setVenues(vData.data || []);
        setRules(rData.data || []);
        setCourses(coData.data || []);
        setTimetables(tData.data || []);
        setMasterCourses(mData.data || []);
    };

    useEffect(() => {
        fetchAll();
    }, []);

    useEffect(() => {
        if (!notice.message) {
            return;
        }

        const timeoutId = setTimeout(() => setNotice({ message: '', type: 'info' }), getNoticeTimeoutMs(notice.type));
        return () => clearTimeout(timeoutId);
    }, [notice]);

    const collegeMap = useMemo(() => Object.fromEntries(colleges.map(c => [c.code, c.name])), [colleges]);

    const updateForm = (key, field, value) => {
        setForms(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    };

    const postEntity = async (path, payload, resetKey) => {
        // Client-side validation
        if (resetKey === 'department' && !payload.college_code) {
            setNotice({ message: 'Please select a college for the department.', type: 'error' });
            return;
        }
        if (resetKey === 'department' && !payload.code.trim()) {
            setNotice({ message: 'Department code is required.', type: 'error' });
            return;
        }
        if (resetKey === 'department' && !payload.name.trim()) {
            setNotice({ message: 'Department name is required.', type: 'error' });
            return;
        }
        if (resetKey === 'college' && (!payload.code.trim() || !payload.name.trim())) {
            setNotice({ message: 'College code and name are required.', type: 'error' });
            return;
        }
        if (resetKey === 'lecturer' && !payload.name.trim()) {
            setNotice({ message: 'Lecturer name is required.', type: 'error' });
            return;
        }
        if (resetKey === 'venue' && !payload.name.trim()) {
            setNotice({ message: 'Venue name is required.', type: 'error' });
            return;
        }

        const response = await fetch(`${API_BASE_URL}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...adminHeaders() },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json();
            setNotice({ message: error.error || 'Request failed', type: 'error' });
            return;
        }

        setForms(prev => ({ ...prev, [resetKey]: emptyForms[resetKey] }));
        setNotice({ message: 'Saved successfully.', type: 'success' });
        fetchAll();
    };

    const deleteEntity = async (path) => {
        const response = await fetch(`${API_BASE_URL}${path}`, { method: 'DELETE', headers: adminHeaders() });
        if (!response.ok) {
            const error = await response.json();
            const errMsg = error.error || 'Delete failed';
            setNotice({ message: errMsg, type: 'error' });
            throw new Error(errMsg);
        }
        setNotice({ message: 'Deleted successfully.', type: 'success' });
        fetchAll();
    };

    const updateEntity = async (path, payload) => {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...adminHeaders() },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const error = await response.json();
            setNotice({ message: error.error || 'Update failed', type: 'error' });
            return false;
        }
        setNotice({ message: 'Updated successfully.', type: 'success' });
        fetchAll();
        return true;
    };

    const handleCourseLecturerToggle = (lecturerName) => {
        setForms(prev => ({
            ...prev,
            course: {
                ...prev.course,
                lecturers: prev.course.lecturers.includes(lecturerName)
                    ? prev.course.lecturers.filter(l => l !== lecturerName)
                    : [...prev.course.lecturers, lecturerName]
            }
        }));
    };

    const submitCourse = async () => {
        if (!forms.course.timetable_id) {
            setNotice({ message: 'Please select a timetable', type: 'error' });
            return;
        }
        const url = editingCourseId ? `${API_BASE_URL}/courses/${editingCourseId}` : `${API_BASE_URL}/courses`;
        const method = editingCourseId ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({
                    ...forms.course,
                    units: parseInt(forms.course.units),
                    level: parseInt(forms.course.level),
                    duration: parseFloat(forms.course.duration)
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Request failed');
            }

            setForms(prev => ({ ...prev, course: emptyForms.course }));
            setLecturerText('');
            setEditingCourseId(null);
            setNotice({ message: editingCourseId ? 'Course updated' : 'Course added', type: 'success' });
            fetchAll();
        } catch (err) {
            setNotice({ message: err.message, type: 'error' });
        }
    };

    const editCourse = (course) => {
        setForms(prev => ({
            ...prev,
            course: {
                code: course.code,
                title: course.title,
                department: course.department,
                level: course.level.toString(),
                lecturers: course.lecturers || [],
                units: course.units.toString(),
                semester: course.semester,
                type: course.type,
                is_compulsory: course.is_compulsory,
                preferred_day: course.preferred_day || 'AUTO',
                preferred_time: course.preferred_time || 'AUTO',
                venue: course.venue || '',
                duration: (course.duration / 60).toString(),
                timetable_id: course.timetable_id?.toString() || ''
            }
        }));
        setLecturerText((course.lecturers || []).join(', '));
        setEditingCourseId(course.id);
        setActiveTab('courses');
    };

    const deleteCourse = async (id) => {
        if (!window.confirm('Are you sure you want to delete this course?')) return;
        try {
            await deleteEntity(`/courses/${id}`);
        } catch (err) {
            console.error('Delete course error:', err);
            setNotice({ message: `Failed to delete course: ${err.message}`, type: 'error' });
        }
    };

    const cancelCourseEdit = () => {
        setForms(prev => ({ ...prev, course: emptyForms.course }));
        setLecturerText('');
        setEditingCourseId(null);
    };

    const downloadSampleCSV = () => {
        const headers = ['Course Code', 'Course Title', 'Department', 'Level', 'Lecturer', 'Units', 'Semester', 'Type', 'Compulsory', 'Preferred Day', 'Preferred Time', 'Venue', 'Duration (hours)'];
        const sampleData1 = ['CSC 101', 'Introduction to Computer Science', 'CSC', '100', 'Dr. Smith', '3', 'First', 'Lecture', 'true', 'Monday', '10:00', 'Hall A', '2'];
        const sampleData2 = ['MTS 101', 'Introductory Mathematics I', 'MTS', '100', 'Prof. John', '3', 'First', 'Lecture', 'false', 'AUTO', 'AUTO', '', '2'];
        const csvContent = headers.join(',') + '\n' + 
            sampleData1.map(v => `"${v}"`).join(',') + '\n' + 
            sampleData2.map(v => `"${v}"`).join(',');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'sample_courses.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Proper RFC 4180-compliant CSV line parser
    const parseCSVLine = (line) => {
        const fields = [];
        let field = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (line[i + 1] === '"') { field += '"'; i++; } // escaped quote
                    else { inQuotes = false; } // closing quote
                } else { field += ch; }
            } else {
                if (ch === '"') { inQuotes = true; }
                else if (ch === ',') { fields.push(field.trim()); field = ''; }
                else { field += ch; }
            }
        }
        fields.push(field.trim());
        return fields;
    };

    // Bulk Upload Handler
    const handleBulkUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const csv = event.target.result;
            // Simple split by newline, ignoring empty lines
            const lines = csv.split(/\r?\n/).filter(line => line.trim() !== '');
            if (lines.length < 2) {
                setNotice({ message: 'CSV file is empty or missing headers.', type: 'error' });
                return;
            }

            // Use proper RFC 4180-compliant parser for all rows
            const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
            const coursesToUpload = [];

            for (let i = 1; i < lines.length; i++) {
                const cleanValues = parseCSVLine(lines[i]);

                let course = {};
                headers.forEach((header, index) => {
                    const val = cleanValues[index] || '';
                    if (header.includes('code')) course.code = val;
                    else if (header.includes('title')) course.title = val;
                    else if (header.includes('department')) course.department = val;
                    else if (header.includes('level')) course.level = val;
                    else if (header.includes('lecturer')) course.lecturers = val;
                    else if (header.includes('unit')) course.units = val;
                    else if (header.includes('semester')) course.semester = val;
                    else if (header.includes('type')) course.type = val;
                    else if (header.includes('compulsory')) course.is_compulsory = val;
                    else if (header.includes('day')) course.preferred_day = val;
                    else if (header.includes('time')) course.preferred_time = val;
                    else if (header.includes('venue')) course.venue = val;
                    else if (header.includes('duration')) course.duration = val;
                });
                if (course.code && course.title && course.department) {
                    coursesToUpload.push(course);
                }
            }

            if (coursesToUpload.length === 0) {
                setNotice({ message: 'No valid courses found in CSV.', type: 'error' });
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/courses/bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                    body: JSON.stringify({ courses: coursesToUpload })
                });

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Bulk upload failed');
                }

                if (data.errors && data.errors.length > 0) {
                    const summary = `${data.addedCount} imported, ${data.errors.length} failed:\n• ${data.errors.slice(0, 5).join('\n• ')}${data.errors.length > 5 ? `\n…and ${data.errors.length - 5} more` : ''}`;
                    setNotice({ message: summary, type: data.addedCount > 0 ? 'warning' : 'error' });
                } else {
                    setNotice({ message: data.message, type: 'success' });
                }
                fetchAll();
            } catch (err) {
                setNotice({ message: err.message, type: 'error' });
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset file input
    };

    // Master Course (Course Pool) functions
    const submitMasterCourse = async () => {
        const courseData = { ...forms.course, timetable_id: null };

        const level = parseInt(courseData.level);
        const units = parseInt(courseData.units);
        if (!courseData.code || !courseData.title || !courseData.department) {
            setNotice({ message: 'Code, title, and department are required.', type: 'error' });
            return;
        }
        if (isNaN(level)) {
            setNotice({ message: 'Level is required (e.g. 100, 200).', type: 'error' });
            return;
        }

        const url = editingMasterCourseId ? `${API_BASE_URL}/courses/${editingMasterCourseId}` : `${API_BASE_URL}/courses`;
        const method = editingMasterCourseId ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({
                    ...courseData,
                    units: isNaN(units) ? null : units,
                    level,
                    duration: parseFloat(courseData.duration) || 1
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Request failed');
            }

            setForms(prev => ({ ...prev, course: emptyForms.course }));
            setLecturerText('');
            setEditingMasterCourseId(null);
            setNotice({ message: editingMasterCourseId ? 'Course updated' : 'Course added to pool', type: 'success' });
            fetchAll();
        } catch (err) {
            setNotice({ message: err.message, type: 'error' });
        }
    };

    const editMasterCourse = (course) => {
        setForms(prev => ({
            ...prev,
            course: {
                code: course.code,
                title: course.title,
                department: course.department,
                level: course.level.toString(),
                lecturers: course.lecturers || [],
                units: course.units.toString(),
                semester: course.semester,
                type: course.type,
                is_compulsory: course.is_compulsory,
                preferred_day: course.preferred_day || 'AUTO',
                preferred_time: course.preferred_time || 'AUTO',
                venue: course.venue || '',
                duration: (course.duration / 60).toString(),
                timetable_id: ''
            }
        }));
        setLecturerText((course.lecturers || []).join(', '));
        setEditingMasterCourseId(course.id);
        setActiveTab('coursepool');
        setTimeout(() => masterCourseFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    };

    const deleteMasterCourse = async (id) => {
        if (!window.confirm('Are you sure you want to delete this course from the pool?')) return;
        try {
            await deleteEntity(`/courses/${id}`);
        } catch (err) {
            console.error('Delete master course error:', err);
        }
    };

    const assignCourseToTimetable = async (courseId) => {
        if (!selectedTimetableForAssign) {
            setNotice({ message: 'Please select a timetable first', type: 'error' });
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/timetables/${selectedTimetableForAssign}/courses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({ course_id: courseId })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Assignment failed');
            }

            setNotice({ message: 'Course assigned to timetable', type: 'success' });
            fetchAll();
        } catch (err) {
            setNotice({ message: err.message, type: 'error' });
        }
    };

    const assignBulkCoursesToTimetable = async () => {
        if (!selectedTimetableForAssign) {
            setNotice({ message: 'Please select a timetable first', type: 'error' });
            return;
        }
        if (selectedMasterCourseIds.size === 0) {
            setNotice({ message: 'Please select at least one course', type: 'error' });
            return;
        }
        
        try {
            const courseIdsArray = Array.from(selectedMasterCourseIds);
            const response = await fetch(`${API_BASE_URL}/timetables/${selectedTimetableForAssign}/courses/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({ course_ids: courseIdsArray })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Bulk assignment failed');
            }

            setNotice({ message: `${courseIdsArray.length} courses assigned to timetable`, type: 'success' });
            setSelectedMasterCourseIds(new Set());
            fetchAll();
        } catch (err) {
            setNotice({ message: err.message, type: 'error' });
        }
    };

    const toggleMasterCourseSelection = (id) => {
        const newSet = new Set(selectedMasterCourseIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedMasterCourseIds(newSet);
    };

    const toggleAllMasterCourses = () => {
        if (selectedMasterCourseIds.size === filteredMasterCourses.length && filteredMasterCourses.length > 0) {
            setSelectedMasterCourseIds(new Set());
        } else {
            setSelectedMasterCourseIds(new Set(filteredMasterCourses.map(c => c.id)));
        }
    };

    const cancelMasterCourseEdit = () => {
        setForms(prev => ({ ...prev, course: emptyForms.course }));
        setLecturerText('');
        setEditingMasterCourseId(null);
    };

    const filteredMasterCourses = masterCourses.filter(course => {
        const matchesSearch = courseSearch === '' ||
            course.code?.toLowerCase().includes(courseSearch.toLowerCase()) ||
            course.title?.toLowerCase().includes(courseSearch.toLowerCase());
        const matchesDept = courseFilterDept === '' || course.department === courseFilterDept;
        const matchesLevel = courseFilterLevel === '' || course.level?.toString() === courseFilterLevel;
        return matchesSearch && matchesDept && matchesLevel;
    });

    const filteredCourses = courses.filter(course => {
        const matchesSearch = courseSearch === '' ||
            course.code?.toLowerCase().includes(courseSearch.toLowerCase()) ||
            course.title?.toLowerCase().includes(courseSearch.toLowerCase());
        const matchesDept = courseFilterDept === '' || course.department === courseFilterDept;
        const matchesLevel = courseFilterLevel === '' || course.level?.toString() === courseFilterLevel;
        return matchesSearch && matchesDept && matchesLevel;
    });

    const getTimetableName = (id) => {
        const t = timetables.find(t => t.id === id);
        return t ? t.name : `Timetable #${id}`;
    };

    const updateRule = async (rule) => {
        const response = await fetch(`${API_BASE_URL}/admin/rules/${rule.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...adminHeaders() },
            body: JSON.stringify(rule)
        });
        if (!response.ok) {
            const error = await response.json();
            setNotice({ message: error.error || 'Rule update failed', type: 'error' });
            return;
        }
        setNotice({ message: 'Rule updated successfully.', type: 'success' });
        fetchAll();
    };

    const handleBulkUploadEntity = async (endpoint, rows, label) => {
        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({ rows })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Bulk import failed`);
            const msg = data.errors?.length
                ? `${data.count} ${label}(s) imported, ${data.errors.length} failed:\n• ${data.errors.slice(0, 5).join('\n• ')}`
                : data.message;
            setNotice({ message: msg, type: data.errors?.length ? 'warning' : 'success' });
            fetchAll();
        } catch (err) {
            setNotice({ message: err.message, type: 'error' });
        }
    };

    const createRule = async (ruleData) => {
        const response = await fetch(`${API_BASE_URL}/admin/rules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...adminHeaders() },
            body: JSON.stringify(ruleData)
        });
        if (!response.ok) {
            const error = await response.json();
            setNotice({ message: error.error || 'Failed to create rule', type: 'error' });
            return false;
        }
        setNotice({ message: 'Rule created successfully.', type: 'success' });
        fetchAll();
        return true;
    };

    const deleteRule = async (id) => {
        const response = await fetch(`${API_BASE_URL}/admin/rules/${id}`, {
            method: 'DELETE',
            headers: adminHeaders()
        });
        if (!response.ok) {
            setNotice({ message: 'Failed to delete rule', type: 'error' });
            return;
        }
        setNotice({ message: 'Rule deleted.', type: 'success' });
        fetchAll();
    };

    const tabs = [
        { id: 'colleges', label: 'Colleges', count: colleges.length, icon: '🏛️' },
        { id: 'departments', label: 'Departments', count: departments.length, icon: '📚' },
        { id: 'venues', label: 'Venues', count: venues.length, icon: '🏢' },
        { id: 'lecturers', label: 'Lecturers', count: lecturers.length, icon: '👨‍🏫' },
        { id: 'coursepool', label: 'Course Pool', count: masterCourses.length, icon: '📖' },
        { id: 'rules', label: 'Scheduling Rules', count: rules.length, icon: '⚙️' }
    ];

    const [activeTab, setActiveTab] = useState('colleges');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <FloatingNotice
                    message={notice.message}
                    type={notice.type}
                    onDismiss={() => setNotice({ message: '', type: 'info' })}
                />
                <Link to="/" className="inline-flex items-center text-sm text-slate-500 hover:text-[#4c1d95] mb-2 transition-colors">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                    Timetables
                </Link>
                <h1 className="text-2xl font-bold text-slate-900">System Setup</h1>
                <p className="text-slate-500 mt-1">Configure your institution before creating timetables. Complete each section in order — colleges first, then departments, venues, lecturers, courses, and rules.</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`p-4 rounded-xl border transition-all text-left ${
                            activeTab === tab.id
                                ? 'bg-[#4c1d95] text-white border-[#4c1d95] shadow-md'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:shadow-sm'
                        }`}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-2xl">{tab.icon}</span>
                            <span className={`text-2xl font-bold ${activeTab === tab.id ? 'text-white' : 'text-slate-800'}`}>
                                {tab.count}
                            </span>
                        </div>
                        <p className={`text-sm ${activeTab === tab.id ? 'text-purple-200' : 'text-slate-500'}`}>
                            {tab.label}
                        </p>
                    </button>
                ))}
            </div>

            {/* Colleges Section */}
            {activeTab === 'colleges' && (
                <SectionCard title="Colleges" subtitle="Step 1 — The top-level organisational units. Departments must belong to a college.">
                    <BulkUploadBar
                        templateName="colleges_template.csv"
                        fields={[
                            { key: 'code', label: 'Code', required: true, sample: 'CBAS' },
                            { key: 'name', label: 'Name', required: true, sample: 'College of Basic and Applied Sciences' },
                        ]}
                        onUpload={rows => handleBulkUploadEntity('/admin/colleges/bulk', rows, 'college')}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                        <FormInput 
                            placeholder="Code (e.g. CBAS)" 
                            value={forms.college.code} 
                            onChange={(e) => updateForm('college', 'code', e.target.value)} 
                        />
                        <FormInput 
                            placeholder="College Name" 
                            value={forms.college.name} 
                            onChange={(e) => updateForm('college', 'name', e.target.value)} 
                        />
                        <AddButton onClick={() => postEntity('/admin/colleges', forms.college, 'college')}>
                            Add College
                        </AddButton>
                    </div>
                    
                    {colleges.length === 0 ? (
                        <EmptyState icon="🏛️" message="No colleges added yet" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Code</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Name</th>
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase w-36">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {colleges.map(c => (
                                        <tr key={c.id} className="hover:bg-slate-50">
                                            <td className="py-3 px-4">
                                                {editingCollegeId === c.id ? (
                                                    <FormInput value={editingCollegeData.code} onChange={(e) => setEditingCollegeData(p => ({ ...p, code: e.target.value }))} />
                                                ) : (
                                                    <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded">{c.code}</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-slate-800 font-medium">
                                                {editingCollegeId === c.id ? (
                                                    <FormInput value={editingCollegeData.name} onChange={(e) => setEditingCollegeData(p => ({ ...p, name: e.target.value }))} />
                                                ) : c.name}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                {editingCollegeId === c.id ? (
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={async () => { const ok = await updateEntity(`/admin/colleges/${c.id}`, editingCollegeData); if (ok) setEditingCollegeId(null); }} className="bg-[#059669] hover:bg-[#047857] text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">Save</button>
                                                        <button onClick={() => setEditingCollegeId(null)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => { setEditingCollegeId(c.id); setEditingCollegeData({ code: c.code, name: c.name }); }} className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">Edit</button>
                                                        <DeleteButton onClick={() => deleteEntity(`/admin/colleges/${c.id}`)} />
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </SectionCard>
            )}

            {/* Departments Section */}
            {activeTab === 'departments' && (
                <SectionCard title="Departments" subtitle="Step 2 — Academic departments within each college. Courses and lecturers are grouped by department.">
                    <BulkUploadBar
                        templateName="departments_template.csv"
                        fields={[
                            { key: 'code', label: 'Code', required: true, sample: 'CSC' },
                            { key: 'name', label: 'Name', required: true, sample: 'Computer Science' },
                            { key: 'college_code', label: 'College Code', required: false, sample: 'CBAS' },
                        ]}
                        onUpload={rows => handleBulkUploadEntity('/admin/departments/bulk', rows, 'department')}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
                        <FormInput 
                            placeholder="Code (e.g. CSC)" 
                            value={forms.department.code} 
                            onChange={(e) => updateForm('department', 'code', e.target.value)} 
                        />
                        <FormInput 
                            placeholder="Department Name" 
                            value={forms.department.name} 
                            onChange={(e) => updateForm('department', 'name', e.target.value)} 
                        />
                        <FormSelect 
                            value={forms.department.college_code} 
                            onChange={(e) => updateForm('department', 'college_code', e.target.value)}
                        >
                            <option value="">Select College</option>
                            {colleges.map(c => <option key={c.id} value={c.code}>{c.code} - {c.name}</option>)}
                        </FormSelect>
                        <AddButton onClick={() => postEntity('/admin/departments', forms.department, 'department')}>
                            Add Department
                        </AddButton>
                    </div>
                    
                    {departments.length === 0 ? (
                        <EmptyState icon="📚" message="No departments added yet" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Code</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Department</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">College</th>
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase w-36">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {departments.map(d => (
                                        <tr key={d.id} className="hover:bg-slate-50">
                                            <td className="py-3 px-4">
                                                {editingDepartmentId === d.id ? (
                                                    <FormInput value={editingDepartmentData.code} onChange={(e) => setEditingDepartmentData(p => ({ ...p, code: e.target.value }))} />
                                                ) : (
                                                    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded">{d.code}</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-slate-800 font-medium">
                                                {editingDepartmentId === d.id ? (
                                                    <FormInput value={editingDepartmentData.name} onChange={(e) => setEditingDepartmentData(p => ({ ...p, name: e.target.value }))} />
                                                ) : d.name}
                                            </td>
                                            <td className="py-3 px-4 text-slate-500 text-sm">
                                                {editingDepartmentId === d.id ? (
                                                    <FormSelect value={editingDepartmentData.college_code} onChange={(e) => setEditingDepartmentData(p => ({ ...p, college_code: e.target.value }))}>
                                                        <option value="">Select College</option>
                                                        {colleges.map(c => <option key={c.id} value={c.code}>{c.code} - {c.name}</option>)}
                                                    </FormSelect>
                                                ) : d.college_code}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                {editingDepartmentId === d.id ? (
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={async () => { const ok = await updateEntity(`/admin/departments/${d.id}`, editingDepartmentData); if (ok) setEditingDepartmentId(null); }} className="bg-[#059669] hover:bg-[#047857] text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">Save</button>
                                                        <button onClick={() => setEditingDepartmentId(null)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => { setEditingDepartmentId(d.id); setEditingDepartmentData({ code: d.code, name: d.name, college_code: d.college_code }); }} className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">Edit</button>
                                                        <DeleteButton onClick={() => deleteEntity(`/admin/departments/${d.id}`)} />
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </SectionCard>
            )}

            {/* Lecturers Section */}
            {activeTab === 'lecturers' && (
                <SectionCard title="Lecturers" subtitle="Step 4 — Teaching staff who can be assigned to courses. The scheduler avoids double-booking a lecturer in the same time slot.">
                    <BulkUploadBar
                        templateName="lecturers_template.csv"
                        fields={[
                            { key: 'name', label: 'Name', required: true, sample: 'Dr. Adeyemi' },
                            { key: 'department_code', label: 'Department Code', required: false, sample: 'CSC' },
                            { key: 'email', label: 'Email', required: false, sample: 'adeyemi@mtu.edu.ng' },
                        ]}
                        onUpload={rows => handleBulkUploadEntity('/admin/lecturers/bulk', rows, 'lecturer')}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
                        <FormInput 
                            placeholder="Full Name" 
                            value={forms.lecturer.name} 
                            onChange={(e) => updateForm('lecturer', 'name', e.target.value)} 
                        />
                        <FormSelect 
                            value={forms.lecturer.department_code} 
                            onChange={(e) => updateForm('lecturer', 'department_code', e.target.value)}
                        >
                            <option value="">Select Department</option>
                            {departments.map(d => <option key={d.id} value={d.code}>{d.code} - {d.name}</option>)}
                        </FormSelect>
                        <FormInput 
                            placeholder="Email Address" 
                            type="email"
                            value={forms.lecturer.email} 
                            onChange={(e) => updateForm('lecturer', 'email', e.target.value)} 
                        />
                        <AddButton onClick={() => postEntity('/admin/lecturers', forms.lecturer, 'lecturer')}>
                            Add Lecturer
                        </AddButton>
                    </div>
                    
                    {lecturers.length === 0 ? (
                        <EmptyState icon="👨‍🏫" message="No lecturers added yet" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Name</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Email</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Department</th>
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase w-36">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {lecturers.map(l => (
                                        <tr key={l.id} className="hover:bg-slate-50">
                                            <td className="py-3 px-4 text-slate-800 font-medium">
                                                {editingLecturerId === l.id ? (
                                                    <FormInput value={editingLecturerData.name} onChange={(e) => setEditingLecturerData(p => ({ ...p, name: e.target.value }))} />
                                                ) : l.name}
                                            </td>
                                            <td className="py-3 px-4 text-slate-500 text-sm">
                                                {editingLecturerId === l.id ? (
                                                    <FormInput type="email" value={editingLecturerData.email} onChange={(e) => setEditingLecturerData(p => ({ ...p, email: e.target.value }))} />
                                                ) : (l.email || '-')}
                                            </td>
                                            <td className="py-3 px-4">
                                                {editingLecturerId === l.id ? (
                                                    <FormSelect value={editingLecturerData.department_code} onChange={(e) => setEditingLecturerData(p => ({ ...p, department_code: e.target.value }))}>
                                                        <option value="">No Department</option>
                                                        {departments.map(d => <option key={d.id} value={d.code}>{d.code} - {d.name}</option>)}
                                                    </FormSelect>
                                                ) : l.department_code && (
                                                    <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">{l.department_code}</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                {editingLecturerId === l.id ? (
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={async () => { const ok = await updateEntity(`/admin/lecturers/${l.id}`, editingLecturerData); if (ok) setEditingLecturerId(null); }} className="bg-[#059669] hover:bg-[#047857] text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">Save</button>
                                                        <button onClick={() => setEditingLecturerId(null)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => { setEditingLecturerId(l.id); setEditingLecturerData({ name: l.name, email: l.email || '', department_code: l.department_code || '' }); }} className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">Edit</button>
                                                        <DeleteButton onClick={() => deleteEntity(`/admin/lecturers/${l.id}`)} />
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </SectionCard>
            )}

            {/* Venues Section */}
            {activeTab === 'venues' && (
                <SectionCard title="Venues" subtitle="Step 3 — Lecture halls, labs, and classrooms available for scheduling. Capacity is used to detect overcrowding conflicts.">
                    <BulkUploadBar
                        templateName="venues_template.csv"
                        fields={[
                            { key: 'name', label: 'Name', required: true, sample: 'Hall A' },
                            { key: 'capacity', label: 'Capacity', required: false, sample: '200' },
                            { key: 'college_code', label: 'College Code', required: false, sample: 'CBAS' },
                        ]}
                        onUpload={rows => handleBulkUploadEntity('/admin/venues/bulk', rows, 'venue')}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
                        <FormInput 
                            placeholder="Venue Name" 
                            value={forms.venue.name} 
                            onChange={(e) => updateForm('venue', 'name', e.target.value)} 
                        />
                        <FormSelect 
                            value={forms.venue.college_code} 
                            onChange={(e) => updateForm('venue', 'college_code', e.target.value)}
                        >
                            <option value="">Select College</option>
                            {colleges.map(c => <option key={c.id} value={c.code}>{c.code} - {c.name}</option>)}
                        </FormSelect>
                        <FormInput 
                            type="number" 
                            min="0"
                            placeholder="Capacity (seats)" 
                            value={forms.venue.capacity} 
                            onChange={(e) => updateForm('venue', 'capacity', e.target.value)} 
                        />
                        <AddButton onClick={() => postEntity('/admin/venues', forms.venue, 'venue')}>
                            Add Venue
                        </AddButton>
                    </div>
                    
                    {venues.length === 0 ? (
                        <EmptyState icon="🏢" message="No venues added yet" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Venue Name</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">College</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Capacity</th>
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase w-36">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {venues.map(v => (
                                        <tr key={v.id} className="hover:bg-slate-50">
                                            <td className="py-3 px-4 text-slate-800 font-medium">
                                                {editingVenueId === v.id ? (
                                                    <FormInput value={editingVenueData.name} onChange={(e) => setEditingVenueData(p => ({ ...p, name: e.target.value }))} />
                                                ) : v.name}
                                            </td>
                                            <td className="py-3 px-4 text-slate-500 text-sm">
                                                {editingVenueId === v.id ? (
                                                    <FormSelect value={editingVenueData.college_code} onChange={(e) => setEditingVenueData(p => ({ ...p, college_code: e.target.value }))}>
                                                        <option value="">General</option>
                                                        {colleges.map(c => <option key={c.id} value={c.code}>{c.code} - {c.name}</option>)}
                                                    </FormSelect>
                                                ) : (collegeMap[v.college_code] || v.college_code || 'General')}
                                            </td>
                                            <td className="py-3 px-4">
                                                {editingVenueId === v.id ? (
                                                    <FormInput type="number" min="0" value={editingVenueData.capacity} onChange={(e) => setEditingVenueData(p => ({ ...p, capacity: e.target.value }))} />
                                                ) : (
                                                    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded">{v.capacity} seats</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                {editingVenueId === v.id ? (
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={async () => { const ok = await updateEntity(`/admin/venues/${v.id}`, editingVenueData); if (ok) setEditingVenueId(null); }} className="bg-[#059669] hover:bg-[#047857] text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">Save</button>
                                                        <button onClick={() => setEditingVenueId(null)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => { setEditingVenueId(v.id); setEditingVenueData({ name: v.name, college_code: v.college_code || '', capacity: v.capacity?.toString() || '' }); }} className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">Edit</button>
                                                        <DeleteButton onClick={() => deleteEntity(`/admin/venues/${v.id}`)} />
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </SectionCard>
            )}

            {/* Course Pool Section - Master Courses */}
            {activeTab === 'coursepool' && (
                <SectionCard title="Course Pool" subtitle="Step 5 — The master list of all courses in the institution. Assign courses from this pool to individual timetables when scheduling.">
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                        <div className="flex items-start gap-2">
                            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                                <p className="font-medium">Master courses are reusable across multiple timetables.</p>
                                <p className="mt-1">Add courses here first, then assign them to specific timetables when creating schedules.</p>
                            </div>
                        </div>
                    </div>

                    {/* CSV reference panel — shows valid values for fields that must match existing records */}
                    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                        <p className="font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            </svg>
                            When using CSV import, these fields must match existing records exactly
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Department codes</p>
                                {departments.length === 0 ? (
                                    <p className="text-xs text-amber-600 italic">None configured — add departments in Setup first</p>
                                ) : (
                                    <div className="flex flex-wrap gap-1">
                                        {departments.map(d => (
                                            <span key={d.id} className="px-1.5 py-0.5 bg-white border border-amber-300 rounded text-xs font-mono text-amber-900">{d.code}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Venue names</p>
                                {venues.length === 0 ? (
                                    <p className="text-xs text-amber-600 italic">None configured — add venues in Setup first</p>
                                ) : (
                                    <div className="flex flex-wrap gap-1">
                                        {venues.map(v => (
                                            <span key={v.id} className="px-1.5 py-0.5 bg-white border border-amber-300 rounded text-xs font-mono text-amber-900">{v.name}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Lecturer names</p>
                                {lecturers.length === 0 ? (
                                    <p className="text-xs text-amber-600 italic">None configured — add lecturers in Setup first</p>
                                ) : (
                                    <div className="flex flex-wrap gap-1">
                                        {lecturers.map(l => (
                                            <span key={l.id} className="px-1.5 py-0.5 bg-white border border-amber-300 rounded text-xs font-mono text-amber-900">{l.name}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Add/Edit Master Course Form */}
                    <div ref={masterCourseFormRef} className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-medium text-slate-700">{editingMasterCourseId ? 'Edit Master Course' : 'Add New Master Course'}</h4>
                            <div className="flex gap-2">
                                <button
                                    onClick={downloadSampleCSV}
                                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg flex items-center gap-1 transition-colors border border-slate-300"
                                    title="Download Sample CSV Template"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Template
                                </button>
                                <input type="file" id="bulkUploadMaster" accept=".csv" className="hidden" onChange={handleBulkUpload} />
                                <button
                                    onClick={() => document.getElementById('bulkUploadMaster').click()}
                                    className="px-3 py-1.5 bg-[#059669] hover:bg-[#047857] text-white text-sm font-medium rounded-lg flex items-center gap-1 transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                    Bulk Upload CSV
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* Course Code */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Course Code</label>
                                <input
                                    placeholder="e.g. CSC 101"
                                    value={forms.course.code}
                                    onChange={(e) => updateForm('course', 'code', e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent"
                                />
                                <p className="text-xs text-slate-500 mt-1">Unique identifier for the course</p>
                            </div>

                            {/* Course Title */}
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Course Title</label>
                                <input
                                    placeholder="e.g. Introduction to Computer Science"
                                    value={forms.course.title}
                                    onChange={(e) => updateForm('course', 'title', e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent"
                                />
                                <p className="text-xs text-slate-500 mt-1">Full name of the course</p>
                            </div>

                            {/* Department */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                                <FormSelect
                                    value={forms.course.department}
                                    onChange={(e) => updateForm('course', 'department', e.target.value)}
                                >
                                    <option value="">Select Department</option>
                                    {departments.map(d => <option key={d.id} value={d.code}>{d.code} - {d.name}</option>)}
                                </FormSelect>
                                <p className="text-xs text-slate-500 mt-1">Department offering this course</p>
                            </div>

                            {/* Level */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Level</label>
                                <FormSelect
                                    value={forms.course.level}
                                    onChange={(e) => updateForm('course', 'level', e.target.value)}
                                >
                                    <option value="">Select Level</option>
                                    <option value="100">100</option>
                                    <option value="200">200</option>
                                    <option value="300">300</option>
                                    <option value="400">400</option>
                                    <option value="500">500</option>
                                </FormSelect>
                                <p className="text-xs text-slate-500 mt-1">Academic level (100-500)</p>
                            </div>

                            {/* Units */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Units</label>
                                <input
                                    type="number"
                                    placeholder="e.g. 3"
                                    value={forms.course.units}
                                    onChange={(e) => updateForm('course', 'units', e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent"
                                />
                                <p className="text-xs text-slate-500 mt-1">Credit units for this course</p>
                            </div>

                            {/* Course Type */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Course Type</label>
                                <FormSelect
                                    value={forms.course.type}
                                    onChange={(e) => updateForm('course', 'type', e.target.value)}
                                >
                                    <option value="Lecture">Lecture</option>
                                    <option value="Exam">Exam</option>
                                    <option value="Test">Test</option>
                                </FormSelect>
                                <p className="text-xs text-slate-500 mt-1">Type of course session</p>
                            </div>

                            {/* Semester */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Semester</label>
                                <FormSelect
                                    value={forms.course.semester}
                                    onChange={(e) => updateForm('course', 'semester', e.target.value)}
                                >
                                    <option value="First">First Semester</option>
                                    <option value="Second">Second Semester</option>
                                </FormSelect>
                                <p className="text-xs text-slate-500 mt-1">When this course is offered</p>
                            </div>

                            {/* Duration */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Duration (hours)</label>
                                <input
                                    type="number"
                                    step="0.5"
                                    placeholder="e.g. 2"
                                    value={forms.course.duration}
                                    onChange={(e) => updateForm('course', 'duration', e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent"
                                />
                                <p className="text-xs text-slate-500 mt-1">Length of each class session</p>
                            </div>

                            {/* Preferred Day */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Day</label>
                                <input
                                    placeholder="AUTO or Monday"
                                    value={forms.course.preferred_day}
                                    onChange={(e) => updateForm('course', 'preferred_day', e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent"
                                />
                                <p className="text-xs text-slate-500 mt-1">AUTO for automatic scheduling</p>
                            </div>

                            {/* Preferred Time */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Time</label>
                                <input
                                    placeholder="AUTO or 9:00"
                                    value={forms.course.preferred_time}
                                    onChange={(e) => updateForm('course', 'preferred_time', e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent"
                                />
                                <p className="text-xs text-slate-500 mt-1">AUTO for automatic scheduling</p>
                            </div>

                            {/* Default Venue */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Default Venue</label>
                                <FormSelect
                                    value={forms.course.venue}
                                    onChange={(e) => updateForm('course', 'venue', e.target.value)}
                                >
                                    <option value="">Unassigned</option>
                                    {venues.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                                </FormSelect>
                                <p className="text-xs text-slate-500 mt-1">Preferred room (can be changed during scheduling)</p>
                            </div>

                            {/* Compulsory */}
                            <div className="flex items-end">
                                <label className="flex items-center gap-2 cursor-pointer pb-2">
                                    <input
                                        type="checkbox"
                                        checked={forms.course.is_compulsory}
                                        onChange={(e) => updateForm('course', 'is_compulsory', e.target.checked)}
                                        className="w-5 h-5 text-[#4c1d95] border-slate-300 rounded"
                                    />
                                    <div>
                                        <span className="text-sm font-medium text-slate-700 block">Compulsory Course</span>
                                        <span className="text-xs text-slate-500">Must be scheduled before electives</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* Lecturers */}
                        <div className="mt-3">
                            <p className="text-sm font-medium text-slate-700 mb-2">Lecturers</p>
                            {lecturers.length > 0 ? (
                                <div className="border rounded-lg p-2 max-h-32 overflow-y-auto bg-white">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        {lecturers.map(l => (
                                            <label key={l.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 p-1 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={forms.course.lecturers.includes(l.name)}
                                                    onChange={() => handleCourseLecturerToggle(l.name)}
                                                    className="w-4 h-4 text-[#4c1d95] border-slate-300 rounded"
                                                />
                                                <span className="truncate">{l.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <input
                                    value={lecturerText}
                                    onChange={(e) => setLecturerText(e.target.value)}
                                    onBlur={(e) => setForms(prev => ({ ...prev, course: { ...prev.course, lecturers: e.target.value.split(',').map(l => l.trim()).filter(Boolean) } }))}
                                    placeholder="Enter lecturer names separated by commas"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent"
                                />
                            )}
                        </div>

                        <div className="mt-3 flex gap-2">
                            <AddButton onClick={submitMasterCourse}>
                                {editingMasterCourseId ? 'Update Master Course' : 'Add to Course Pool'}
                            </AddButton>
                            {editingMasterCourseId && (
                                <button
                                    onClick={cancelMasterCourseEdit}
                                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Assignment Control */}
                    <div className="mb-4 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                        <label className="block text-sm font-medium text-emerald-800 mb-2">Quick Assign: Select Timetable to Assign Courses</label>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <FormSelect
                                    value={selectedTimetableForAssign}
                                    onChange={(e) => setSelectedTimetableForAssign(e.target.value)}
                                >
                                    <option value="">Select a Timetable...</option>
                                    {timetables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </FormSelect>
                            </div>
                            <button
                                onClick={assignBulkCoursesToTimetable}
                                disabled={!selectedTimetableForAssign || selectedMasterCourseIds.size === 0}
                                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                                    selectedTimetableForAssign && selectedMasterCourseIds.size > 0
                                        ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                                        : 'bg-emerald-100 text-emerald-400 cursor-not-allowed'
                                }`}
                            >
                                Assign Selected ({selectedMasterCourseIds.size})
                            </button>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                        <input
                            type="text"
                            value={courseSearch}
                            onChange={(e) => setCourseSearch(e.target.value)}
                            placeholder="Search by code or title..."
                            className="px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent"
                        />
                        <FormSelect value={courseFilterDept} onChange={(e) => setCourseFilterDept(e.target.value)}>
                            <option value="">All Departments</option>
                            {departments.map(d => <option key={d.id} value={d.code}>{d.code}</option>)}
                        </FormSelect>
                        <FormSelect value={courseFilterLevel} onChange={(e) => setCourseFilterLevel(e.target.value)}>
                            <option value="">All Levels</option>
                            <option value="100">100</option>
                            <option value="200">200</option>
                            <option value="300">300</option>
                            <option value="400">400</option>
                            <option value="500">500</option>
                        </FormSelect>
                    </div>

                    {/* Master Courses Table */}
                    {filteredMasterCourses.length === 0 ? (
                        <EmptyState icon="📚" message="No master courses in pool" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase w-10">
                                            <input 
                                                type="checkbox" 
                                                checked={filteredMasterCourses.length > 0 && selectedMasterCourseIds.size === filteredMasterCourses.length}
                                                onChange={toggleAllMasterCourses}
                                                className="w-4 h-4 text-[#4c1d95] border-slate-300 rounded focus:ring-[#4c1d95]"
                                            />
                                        </th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Code</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase min-w-[200px]">Title</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Dept</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Level</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Type</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Units</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Venue</th>
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase w-40">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredMasterCourses.map(course => (
                                        <tr key={course.id} className={`hover:bg-slate-50 ${selectedMasterCourseIds.has(course.id) ? 'bg-purple-50/50' : ''}`}>
                                            <td className="py-3 px-4">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedMasterCourseIds.has(course.id)}
                                                    onChange={() => toggleMasterCourseSelection(course.id)}
                                                    className="w-4 h-4 text-[#4c1d95] border-slate-300 rounded focus:ring-[#4c1d95]"
                                                />
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded">{course.code}</span>
                                            </td>
                                            <td className="py-3 px-4 text-slate-800 font-medium whitespace-normal break-words">{course.title}</td>
                                            <td className="py-3 px-4">
                                                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded">{course.department}</span>
                                            </td>
                                            <td className="py-3 px-4 text-slate-600">{course.level}</td>
                                            <td className="py-3 px-4">
                                                <span className={`px-2 py-1 text-xs rounded ${
                                                    course.type === 'Lecture' ? 'bg-emerald-100 text-emerald-700' :
                                                    course.type === 'Exam' ? 'bg-purple-100 text-purple-700' :
                                                    'bg-amber-100 text-amber-700'
                                                }`}>{course.type}</span>
                                            </td>
                                            <td className="py-3 px-4 text-slate-600">{course.units}</td>
                                            <td className="py-3 px-4 text-slate-600">{course.venue || <span className="text-slate-400 italic">—</span>}</td>
                                            <td className="py-3 px-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => editMasterCourse(course)}
                                                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => assignCourseToTimetable(course.id)}
                                                        disabled={!selectedTimetableForAssign}
                                                        className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                                            selectedTimetableForAssign
                                                                ? 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'
                                                                : 'text-slate-400 cursor-not-allowed'
                                                        }`}
                                                    >
                                                        Assign
                                                    </button>
                                                    <DeleteButton onClick={() => deleteMasterCourse(course.id)} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </SectionCard>
            )}

            {/* Assigned Courses section removed — managed per-timetable in TimetableView */}
            {false && (
                <SectionCard title="Assigned Courses">
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                        <div className="flex items-start gap-2">
                            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                                <p className="font-medium">These are courses assigned to specific timetables.</p>
                                <p className="mt-1">To add a reusable course not yet tied to a timetable, use the Course Pool tab instead.</p>
                            </div>
                        </div>
                    </div>

                    {/* Add/Edit Form */}
                    <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <h4 className="font-medium text-slate-700 mb-4">{editingCourseId ? 'Edit Course' : 'Add Course to Timetable'}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Timetable</label>
                                <FormSelect
                                    value={forms.course.timetable_id}
                                    onChange={(e) => updateForm('course', 'timetable_id', e.target.value)}
                                >
                                    <option value="">Select Timetable</option>
                                    {timetables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </FormSelect>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Course Code</label>
                                <FormInput placeholder="e.g. CSC 101" value={forms.course.code} onChange={(e) => updateForm('course', 'code', e.target.value)} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Course Title</label>
                                <FormInput placeholder="e.g. Introduction to Computer Science" value={forms.course.title} onChange={(e) => updateForm('course', 'title', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                                <FormSelect value={forms.course.department} onChange={(e) => updateForm('course', 'department', e.target.value)}>
                                    <option value="">Select Department</option>
                                    {departments.map(d => <option key={d.id} value={d.code}>{d.code} - {d.name}</option>)}
                                </FormSelect>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Level</label>
                                <FormSelect value={forms.course.level} onChange={(e) => updateForm('course', 'level', e.target.value)}>
                                    <option value="">Select Level</option>
                                    <option value="100">100</option>
                                    <option value="200">200</option>
                                    <option value="300">300</option>
                                    <option value="400">400</option>
                                    <option value="500">500</option>
                                </FormSelect>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Units</label>
                                <FormInput type="number" placeholder="e.g. 3" value={forms.course.units} onChange={(e) => updateForm('course', 'units', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                                <FormSelect value={forms.course.type} onChange={(e) => updateForm('course', 'type', e.target.value)}>
                                    <option value="Lecture">Lecture</option>
                                    <option value="Exam">Exam</option>
                                    <option value="Test">Test</option>
                                </FormSelect>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Semester</label>
                                <FormSelect value={forms.course.semester} onChange={(e) => updateForm('course', 'semester', e.target.value)}>
                                    <option value="First">First Semester</option>
                                    <option value="Second">Second Semester</option>
                                </FormSelect>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Duration (hours)</label>
                                <FormInput type="number" step="0.5" placeholder="e.g. 2" value={forms.course.duration} onChange={(e) => updateForm('course', 'duration', e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Venue</label>
                                <FormSelect value={forms.course.venue} onChange={(e) => updateForm('course', 'venue', e.target.value)}>
                                    <option value="">Unassigned</option>
                                    {venues.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                                </FormSelect>
                            </div>
                            <div className="flex items-end pb-1">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={forms.course.is_compulsory}
                                        onChange={(e) => updateForm('course', 'is_compulsory', e.target.checked)}
                                        className="w-5 h-5 text-[#4c1d95] border-slate-300 rounded"
                                    />
                                    <span className="text-sm font-medium text-slate-700">Compulsory</span>
                                </label>
                            </div>
                        </div>

                        {/* Lecturers */}
                        <div className="mt-4">
                            <label className="block text-sm font-medium text-slate-700 mb-2">Lecturers</label>
                            {lecturers.length > 0 ? (
                                <div className="border rounded-lg p-2 max-h-28 overflow-y-auto bg-white">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        {lecturers.map(l => (
                                            <label key={l.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 p-1 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={forms.course.lecturers.includes(l.name)}
                                                    onChange={() => handleCourseLecturerToggle(l.name)}
                                                    className="w-4 h-4 text-[#4c1d95] border-slate-300 rounded"
                                                />
                                                <span className="truncate">{l.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <FormInput
                                    value={lecturerText}
                                    onChange={(e) => setLecturerText(e.target.value)}
                                    onBlur={(e) => setForms(prev => ({ ...prev, course: { ...prev.course, lecturers: e.target.value.split(',').map(l => l.trim()).filter(Boolean) } }))}
                                    placeholder="Enter lecturer names separated by commas"
                                />
                            )}
                        </div>

                        <div className="mt-4 flex gap-2">
                            <AddButton onClick={submitCourse}>
                                {editingCourseId ? 'Update Course' : 'Add Course'}
                            </AddButton>
                            {editingCourseId && (
                                <button onClick={cancelCourseEdit} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
                                    Cancel
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                        <FormInput
                            type="text"
                            value={courseSearch}
                            onChange={(e) => setCourseSearch(e.target.value)}
                            placeholder="Search by code or title..."
                        />
                        <FormSelect value={courseFilterDept} onChange={(e) => setCourseFilterDept(e.target.value)}>
                            <option value="">All Departments</option>
                            {departments.map(d => <option key={d.id} value={d.code}>{d.code}</option>)}
                        </FormSelect>
                        <FormSelect value={courseFilterLevel} onChange={(e) => setCourseFilterLevel(e.target.value)}>
                            <option value="">All Levels</option>
                            <option value="100">100</option>
                            <option value="200">200</option>
                            <option value="300">300</option>
                            <option value="400">400</option>
                            <option value="500">500</option>
                        </FormSelect>
                    </div>

                    {/* Courses Table */}
                    {filteredCourses.length === 0 ? (
                        <EmptyState icon="📋" message="No assigned courses found" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Code</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase min-w-[180px]">Title</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Dept</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Level</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Type</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Timetable</th>
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase w-32">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredCourses.map(course => (
                                        <tr key={course.id} className="hover:bg-slate-50">
                                            <td className="py-3 px-4">
                                                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded">{course.code}</span>
                                            </td>
                                            <td className="py-3 px-4 text-slate-800 font-medium whitespace-normal break-words">{course.title}</td>
                                            <td className="py-3 px-4">
                                                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded">{course.department}</span>
                                            </td>
                                            <td className="py-3 px-4 text-slate-600">{course.level}</td>
                                            <td className="py-3 px-4">
                                                <span className={`px-2 py-1 text-xs rounded ${
                                                    course.type === 'Lecture' ? 'bg-emerald-100 text-emerald-700' :
                                                    course.type === 'Exam' ? 'bg-purple-100 text-purple-700' :
                                                    'bg-amber-100 text-amber-700'
                                                }`}>{course.type}</span>
                                            </td>
                                            <td className="py-3 px-4 text-slate-500 text-sm">{getTimetableName(course.timetable_id)}</td>
                                            <td className="py-3 px-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => editCourse(course)}
                                                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                                    >
                                                        Edit
                                                    </button>
                                                    <DeleteButton onClick={() => deleteCourse(course.id)} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </SectionCard>
            )}

            {/* Rules Section */}
            {activeTab === 'rules' && (
                <SectionCard title="Scheduling Rules" subtitle="Step 6 — Constraints and preferences the scheduler must respect when generating timetables, such as restricted days, break times, and max hours per day.">
                    {/* Add Rule Form */}
                    <AddRuleForm onCreate={createRule} />

                    {rules.length === 0 ? (
                        <EmptyState icon="⚙️" message="No scheduling rules configured yet. Add your first rule above." />
                    ) : (
                        <div className="overflow-x-auto mt-4">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Rule Name</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Key</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Value</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Status</th>
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase w-28">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {rules.map(rule => (
                                        <tr key={rule.id} className="hover:bg-slate-50">
                                            <td className="py-3 px-4 text-slate-800 font-medium">
                                                <input
                                                    className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-slate-200 rounded focus:border-[#4c1d95] focus:ring-1 focus:ring-[#4c1d95] text-sm"
                                                    value={rule.name}
                                                    onChange={(e) => setRules(prev => prev.map(r => r.id === rule.id ? { ...r, name: e.target.value } : r))}
                                                />
                                            </td>
                                            <td className="py-3 px-4">
                                                <input
                                                    className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-slate-200 rounded focus:border-[#4c1d95] focus:ring-1 focus:ring-[#4c1d95] text-sm font-mono text-xs"
                                                    value={rule.rule_key}
                                                    onChange={(e) => setRules(prev => prev.map(r => r.id === rule.id ? { ...r, rule_key: e.target.value } : r))}
                                                />
                                            </td>
                                            <td className="py-3 px-4">
                                                <input
                                                    className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-slate-200 rounded focus:border-[#4c1d95] focus:ring-1 focus:ring-[#4c1d95] text-sm font-mono text-xs"
                                                    value={rule.rule_value}
                                                    onChange={(e) => setRules(prev => prev.map(r => r.id === rule.id ? { ...r, rule_value: e.target.value } : r))}
                                                />
                                            </td>
                                            <td className="py-3 px-4">
                                                <select
                                                    className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-sm"
                                                    value={rule.is_active}
                                                    onChange={(e) => setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: Number(e.target.value) } : r))}
                                                >
                                                    <option value={1}>Active</option>
                                                    <option value={0}>Inactive</option>
                                                </select>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        className="bg-[#059669] hover:bg-[#047857] text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                                        onClick={() => updateRule(rule)}
                                                    >
                                                        Save
                                                    </button>
                                                    <DeleteButton onClick={() => deleteRule(rule.id)} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </SectionCard>
            )}
        </div>
    );
};

export default AdminManager;
