import React, { useEffect, useState } from 'react';
import CustomFieldsManager from './CustomFieldsManager';
import API_BASE_URL from '../apiBase';
import { adminHeaders } from '../adminAuth';
import FloatingNotice from './FloatingNotice';
import getNoticeTimeoutMs from '../noticeTimeout';

const Dashboard = ({ timetableId }) => {
    const [course, setCourse] = useState({
        code: '',
        title: '',
        department: '',
        level: '',
        lecturers: [],
        units: '',
        semester: 'First',
        type: 'Lecture',
        is_compulsory: false,
        preferred_day: 'AUTO',
        preferred_time: 'AUTO',
        venue: '',
        duration: 1,
        student_count: 0,
        shared_session_key: '',
        custom_data: {}
    });
    // Course Catalog modal state
    const [showCatalog, setShowCatalog] = useState(false);
    const [catalogCourses, setCatalogCourses] = useState([]);
    const [catalogSelected, setCatalogSelected] = useState([]);
    const [catalogFilter, setCatalogFilter] = useState({ department: '', level: '', semester: '' });

    // College selection for the Add Course form (independent of generation scope)
    const [courseCollege, setCourseCollege] = useState('');

    const [customFields, setCustomFields] = useState([]);
    const [loading, setLoading] = useState(false);
    const [options, setOptions] = useState({ colleges: [], departments: [], lecturers: [], venues: [] });
    const [notice, setNotice] = useState({ message: '', type: 'info' });
    const [generationScope, setGenerationScope] = useState({
        scope: 'college',
        department: '',
        level: '',
        semester: 'First'
    });

    useEffect(() => {
        if (!notice.message) {
            return;
        }

        const timeoutId = setTimeout(() => setNotice({ message: '', type: 'info' }), getNoticeTimeoutMs(notice.type));
        return () => clearTimeout(timeoutId);
    }, [notice]);

    React.useEffect(() => {
        const fetchOptions = async () => {
            try {
                const optionsResponse = await fetch(`${API_BASE_URL}/options`);
                const optionsData = await optionsResponse.json();
                if (!optionsData.data) return;

                setOptions(optionsData.data);

                let timetableCollege = '';
                if (timetableId) {
                    try {
                        const timetableResponse = await fetch(`${API_BASE_URL}/timetables/${timetableId}`);
                        const timetableData = await timetableResponse.json();
                        timetableCollege = timetableData?.data?.college || '';
                    } catch (timetableError) {
                        console.warn('Failed to fetch timetable college for scope sync', timetableError);
                    }
                }

                const availableCollegeCodes = (optionsData.data.colleges || []).map(c => c.code);
                const resolvedCollege = availableCollegeCodes.includes(timetableCollege)
                    ? timetableCollege
                    : (optionsData.data.colleges?.[0]?.code || '');

                setGenerationScope(prev => ({
                    ...prev,
                    department: '',
                    semester: prev.semester || 'First'
                }));
                // Pre-select college for the Add Course form
                setCourseCollege(resolvedCollege);
            } catch (error) {
                console.error('Failed to fetch options', error);
            }
        };
        fetchOptions();
    }, [timetableId]);

    // Departments filtered for the Add Course form by the course-form college
    const filteredDepartments = options.departments.filter(d => !courseCollege || d.college_code === courseCollege);
    // Departments available in the Generation Scope panel (all departments — admin picks one when scope = department)
    const scopeDepartments = options.departments;

    const handleCustomFieldChange = (e, fieldName) => {
        setCourse({
            ...course,
            custom_data: {
                ...course.custom_data,
                [fieldName]: e.target.type === 'checkbox' ? e.target.checked : e.target.value
            }
        });
    };

    const handleChange = (e) => {
        setCourse({ ...course, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        console.log("Submitting Course:", course);

        if (!timetableId) {
            setNotice({ message: 'No timetable selected.', type: 'error' });
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/courses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...adminHeaders()
                },
                body: JSON.stringify({
                    ...course,
                    college: courseCollege || '',
                    lecturers: course.lecturers, // already an array
                    units: parseInt(course.units),
                    level: parseInt(course.level),
                    duration: parseFloat(course.duration), // Send hours, backend converts to minutes
                    is_compulsory: course.is_compulsory,
                    student_count: parseInt(course.student_count),
                    custom_data: course.custom_data,
                    ...(course.shared_session_key
                        ? {
                            custom_data: {
                                ...(course.custom_data || {}),
                                shared_session_key: course.shared_session_key
                            }
                        }
                        : {}),
                    timetable_id: timetableId
                }),
            });

            if (response.ok) {
                try {
                    await fetch(`${API_BASE_URL}/course-catalog`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                        body: JSON.stringify({
                            ...course,
                            college: courseCollege || '',
                            lecturers: course.lecturers,
                            units: parseInt(course.units),
                            level: parseInt(course.level),
                            duration: parseFloat(course.duration),
                            is_compulsory: course.is_compulsory,
                            custom_data: course.custom_data
                        })
                    });
                } catch { /* non-fatal */ }
                setNotice({ message: 'Course added successfully.', type: 'success' });
                // Reset form
                setCourse({
                    code: '',
                    title: '',
                    department: filteredDepartments[0]?.code || '',
                    level: '',
                    lecturers: [],
                    units: '',
                    semester: 'First',
                    type: 'Lecture',
                    is_compulsory: false,
                    preferred_day: 'AUTO',
                    preferred_time: 'AUTO',
                    venue: '',
                    duration: 1,
                    student_count: 0,
                    shared_session_key: '',
                    custom_data: {}
                });
            } else {
                const error = await response.json();
                setNotice({ message: `Failed to add course: ${error.error}`, type: 'error' });
            }
        } catch (err) {
            console.error(err);
            setNotice({ message: 'Failed to connect to server.', type: 'error' });
        }
    };

    const handleGenerate = async (type) => {
        if (!timetableId) {
            setNotice({ message: 'No timetable selected.', type: 'error' });
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/generate/${type}s`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({
                    timetable_id: timetableId,
                    scope: generationScope.scope,
                    department: generationScope.scope === 'department' ? generationScope.department : null,
                    level: generationScope.level || null,
                    semester: generationScope.semester || null
                })
            });
            const data = await response.json();

            if (!response.ok) {
                setNotice({ message: data.error || 'Generation failed.', type: 'error' });
                return;
            }

            const derivedCount = Array.isArray(data.derived_timetables) ? data.derived_timetables.length : 0;
            const baseMessage = data.message || 'Generation completed successfully.';
            const fullMessage = derivedCount > 0
                ? `${baseMessage} Created/updated ${derivedCount} department/level timetable${derivedCount === 1 ? '' : 's'}.`
                : baseMessage;

            setNotice({ message: fullMessage, type: 'success' });
        } catch (err) {
            console.error(err);
            setNotice({ message: 'Generation failed.', type: 'error' });
        }
        setLoading(false);
    };

    const openCatalog = async () => {
        try {
            const params = new URLSearchParams();
            if (catalogFilter.department) params.set('department', catalogFilter.department);
            if (catalogFilter.level) params.set('level', catalogFilter.level);
            if (catalogFilter.semester) params.set('semester', catalogFilter.semester);
            const res = await fetch(`${API_BASE_URL}/course-catalog?${params}`);
            const data = await res.json();
            setCatalogCourses(data.data || []);
            setCatalogSelected([]);
            setShowCatalog(true);
        } catch {
            setNotice({ message: 'Failed to load catalog.', type: 'error' });
        }
    };

    const handleCatalogImport = async () => {
        if (!timetableId) {
            setNotice({ message: 'No timetable selected.', type: 'error' });
            return;
        }
        if (catalogSelected.length === 0) {
            setNotice({ message: 'No courses selected.', type: 'error' });
            return;
        }
        let successCount = 0;
        for (const entry of catalogSelected) {
            try {
                const res = await fetch(`${API_BASE_URL}/courses`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                    body: JSON.stringify({ ...entry, timetable_id: timetableId, id: undefined })
                });
                if (res.ok) successCount++;
            } catch { /* skip */ }
        }
        setShowCatalog(false);
        setNotice({ message: `Imported ${successCount} course(s) from catalog.`, type: 'success' });
    };

    return (
        <div className="p-6 bg-white rounded-lg shadow-md">
            <FloatingNotice
                message={notice.message}
                type={notice.type}
                onDismiss={() => setNotice({ message: '', type: 'info' })}
                stackIndex={0}
            />
            {showCatalog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 p-6 max-h-[85vh] flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold">Import from Course Catalog</h3>
                            <button onClick={() => setShowCatalog(false)} className="text-gray-500 hover:text-gray-800 text-2xl leading-none">&times;</button>
                        </div>
                        <div className="flex gap-2 mb-4 flex-wrap">
                            <select value={catalogFilter.department} onChange={e => setCatalogFilter(f => ({ ...f, department: e.target.value }))} className="border p-2 rounded text-sm flex-1">
                                <option value="">All Departments</option>
                                {options.departments.map(d => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
                            </select>
                            <select value={catalogFilter.level} onChange={e => setCatalogFilter(f => ({ ...f, level: e.target.value }))} className="border p-2 rounded text-sm">
                                <option value="">All Levels</option>
                                {['100','200','300','400','500'].map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                            <select value={catalogFilter.semester} onChange={e => setCatalogFilter(f => ({ ...f, semester: e.target.value }))} className="border p-2 rounded text-sm">
                                <option value="">Both Semesters</option>
                                <option value="First">First</option>
                                <option value="Second">Second</option>
                            </select>
                            <button onClick={openCatalog} className="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700">Filter</button>
                        </div>
                        <div className="overflow-y-auto flex-1 border rounded">
                            {catalogCourses.length === 0 ? (
                                <p className="text-gray-500 text-sm p-4">No courses in catalog. Add courses and tick "Save to Catalog" to build it up.</p>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-100 sticky top-0">
                                        <tr>
                                            <th className="p-2 text-left w-8">
                                                <input type="checkbox" checked={catalogSelected.length === catalogCourses.length && catalogCourses.length > 0}
                                                    onChange={e => setCatalogSelected(e.target.checked ? [...catalogCourses] : [])} />
                                            </th>
                                            <th className="p-2 text-left">Code</th>
                                            <th className="p-2 text-left">Title</th>
                                            <th className="p-2 text-left">Dept</th>
                                            <th className="p-2 text-left">Level</th>
                                            <th className="p-2 text-left">Sem</th>
                                            <th className="p-2 text-left">Units</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {catalogCourses.map(c => {
                                            const checked = catalogSelected.some(s => s.id === c.id);
                                            return (
                                                <tr key={c.id} className={`border-t cursor-pointer hover:bg-blue-50 ${checked ? 'bg-blue-50' : ''}`}
                                                    onClick={() => setCatalogSelected(prev => checked ? prev.filter(s => s.id !== c.id) : [...prev, c])}>
                                                    <td className="p-2"><input type="checkbox" checked={checked} readOnly /></td>
                                                    <td className="p-2 font-mono">{c.code}</td>
                                                    <td className="p-2">{c.title}</td>
                                                    <td className="p-2">{c.department}</td>
                                                    <td className="p-2">{c.level}</td>
                                                    <td className="p-2">{c.semester}</td>
                                                    <td className="p-2">{c.units}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div className="flex justify-between items-center mt-4">
                            <span className="text-sm text-gray-500">{catalogSelected.length} selected</span>
                            <div className="flex gap-2">
                                <button onClick={() => setShowCatalog(false)} className="border px-4 py-2 rounded text-sm hover:bg-gray-100">Cancel</button>
                                <button onClick={handleCatalogImport} disabled={catalogSelected.length === 0} className={`bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 ${catalogSelected.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    Import {catalogSelected.length > 0 ? `(${catalogSelected.length})` : ''}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Course Management</h2>
                <div className="flex flex-wrap gap-2">
                    <button onClick={openCatalog} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">Import from Catalog</button>
                    <button onClick={() => handleGenerate('lecture')} disabled={loading} className={`bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>Generate Lectures</button>
                    <button onClick={() => handleGenerate('exam')} disabled={loading} className={`bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>Generate Exams</button>
                    <button onClick={() => handleGenerate('test')} disabled={loading} className={`bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>Generate Tests</button>
                </div>
            </div>

            <div className="mb-6 p-4 border rounded bg-blue-50">
                <h3 className="font-semibold mb-1">Generation Scope</h3>
                <p className="text-xs text-gray-500 mb-3">Controls which courses are included when you click Generate. The timetable's college is applied automatically.</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <select value={generationScope.scope} onChange={(e) => setGenerationScope({ ...generationScope, scope: e.target.value, department: '' })} className="border p-2 rounded">
                        <option value="college">Entire College</option>
                        <option value="department">Specific Department</option>
                    </select>
                    <select
                        value={generationScope.department}
                        onChange={(e) => setGenerationScope({ ...generationScope, department: e.target.value })}
                        className="border p-2 rounded"
                        disabled={generationScope.scope !== 'department'}
                        title={generationScope.scope !== 'department' ? 'Select \'Specific Department\' scope to enable' : ''}
                    >
                        <option value="">Select Department</option>
                        {scopeDepartments.map(dept => <option key={dept.code} value={dept.code}>{dept.code} — {dept.name}</option>)}
                    </select>
                    <select value={generationScope.level} onChange={(e) => setGenerationScope({ ...generationScope, level: e.target.value })} className="border p-2 rounded">
                        <option value="">All Levels</option>
                        <option value="100">100</option>
                        <option value="200">200</option>
                        <option value="300">300</option>
                        <option value="400">400</option>
                        <option value="500">500</option>
                    </select>
                    <select value={generationScope.semester} onChange={(e) => setGenerationScope({ ...generationScope, semester: e.target.value })} className="border p-2 rounded">
                        <option value="First">First Semester</option>
                        <option value="Second">Second Semester</option>
                    </select>
                </div>
            </div>

            <CustomFieldsManager onFieldsChange={setCustomFields} />

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input name="code" value={course.code} placeholder="Course Code" onChange={handleChange} className="border p-2 rounded" required />
                <input name="title" value={course.title} placeholder="Course Title" onChange={handleChange} className="border p-2 rounded" required />

                {/* College selector for the Add Course form — controls which departments appear */}
                <select
                    value={courseCollege}
                    onChange={(e) => {
                        setCourseCollege(e.target.value);
                        setCourse(prev => ({ ...prev, department: '' }));
                    }}
                    className="border p-2 rounded"
                >
                    <option value="">Select College</option>
                    {options.colleges.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                </select>

                <select name="department" value={course.department} onChange={handleChange} className="border p-2 rounded" required>
                    <option value="">Select Department</option>
                    {filteredDepartments.map(dept => <option key={dept.code} value={dept.code}>{dept.code} - {dept.name}</option>)}
                </select>

                <select name="level" value={course.level} onChange={handleChange} className="border p-2 rounded" required>
                    <option value="">Select Level</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                    <option value="300">300</option>
                    <option value="400">400</option>
                    <option value="500">500</option>
                </select>

                {/* Lecturer checkboxes — tick to select from pre-loaded lecturers */}
                <div className="flex flex-col">
                    <label className="text-sm text-gray-600 mb-1">Lecturers</label>
                    {options.lecturers.length > 0 ? (
                        <div className="border rounded p-2 max-h-36 overflow-y-auto space-y-1 bg-white">
                            {options.lecturers.map(l => {
                                const isChecked = course.lecturers.includes(l.name);
                                return (
                                    <label key={l.name} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 rounded">
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => {
                                                setCourse(prev => ({
                                                    ...prev,
                                                    lecturers: isChecked
                                                        ? prev.lecturers.filter(n => n !== l.name)
                                                        : [...prev.lecturers, l.name]
                                                }));
                                            }}
                                        />
                                        {l.name}{l.department_code ? ` (${l.department_code})` : ''}
                                    </label>
                                );
                            })}
                        </div>
                    ) : (
                        <input
                            name="lecturers"
                            value={course.lecturers.join(', ')}
                            placeholder="Lecturers (comma separated)"
                            onChange={(e) => setCourse(prev => ({ ...prev, lecturers: e.target.value.split(',').map(l => l.trim()).filter(Boolean) }))}
                            className="border p-2 rounded"
                        />
                    )}
                    {course.lecturers.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">Selected: {course.lecturers.join(', ')}</p>
                    )}
                </div>
                <input name="units" value={course.units} type="number" placeholder="Units" onChange={handleChange} className="border p-2 rounded" required />
                <select name="semester" value={course.semester} onChange={handleChange} className="border p-2 rounded">
                    <option value="First">First Semester</option>
                    <option value="Second">Second Semester</option>
                </select>
                <select name="type" value={course.type} onChange={handleChange} className="border p-2 rounded">
                    <option value="Lecture">Lecture</option>
                    <option value="Exam">Exam</option>
                    <option value="Test">Test</option>
                </select>
                <select
                    name="is_compulsory"
                    value={course.is_compulsory ? 'true' : 'false'}
                    onChange={(e) => setCourse({ ...course, is_compulsory: e.target.value === 'true' })}
                    className="border p-2 rounded"
                >
                    <option value="true">Compulsory</option>
                    <option value="false">Elective</option>
                </select>
                <input name="preferred_day" value={course.preferred_day} placeholder="Preferred Day (or AUTO)" onChange={handleChange} className="border p-2 rounded" />
                <input name="preferred_time" value={course.preferred_time} placeholder="Preferred Time (or AUTO)" onChange={handleChange} className="border p-2 rounded" />
                {options.venues.length > 0 ? (
                    <select name="venue" value={course.venue} onChange={handleChange} className="border p-2 rounded">
                        <option value="">Select Venue (optional)</option>
                        {options.venues.map(v => (
                            <option key={v.name} value={v.name}>
                                {v.name}{v.capacity ? ` (${v.capacity} seats)` : ''}
                            </option>
                        ))}
                    </select>
                ) : (
                    <input name="venue" value={course.venue} placeholder="Venue" onChange={handleChange} className="border p-2 rounded" />
                )}
                <input name="duration" value={course.duration} type="number" step="0.5" placeholder="Duration (hours)" onChange={handleChange} className="border p-2 rounded" />
                <input name="student_count" value={course.student_count} type="number" placeholder="Student Count" onChange={handleChange} className="border p-2 rounded" />
                <input
                    name="shared_session_key"
                    value={course.shared_session_key}
                    placeholder="Shared Session Key (e.g. CSC 305/CSE 307)"
                    onChange={handleChange}
                    className="border p-2 rounded"
                />

                {customFields.map(field => (
                    <div key={field.id} className="flex flex-col">
                        <label className="text-sm text-gray-600 mb-1">{field.label}</label>
                        {field.type === 'boolean' ? (
                            <input
                                type="checkbox"
                                onChange={(e) => handleCustomFieldChange(e, field.name)}
                                className="border p-2 rounded"
                            />
                        ) : (
                            <input
                                type={field.type === 'number' ? 'number' : 'text'}
                                placeholder={field.label}
                                onChange={(e) => handleCustomFieldChange(e, field.name)}
                                className="border p-2 rounded"
                                required={field.required === 1}
                            />
                        )}
                    </div>
                ))}

                <button type="submit" className="col-span-2 bg-blue-600 text-white p-2 rounded hover:bg-blue-700">
                    Add Course
                </button>
            </form>
        </div>
    );
};

export default Dashboard;
