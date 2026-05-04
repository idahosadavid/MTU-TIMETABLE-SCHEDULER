import React, { useEffect, useMemo, useState } from 'react';
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
    const [notice, setNotice] = useState({ message: '', type: 'info' });
    const [editingCourseId, setEditingCourseId] = useState(null);
    const [editingMasterCourseId, setEditingMasterCourseId] = useState(null);
    const [courseSearch, setCourseSearch] = useState('');
    const [courseFilterDept, setCourseFilterDept] = useState('');
    const [courseFilterLevel, setCourseFilterLevel] = useState('');
    const [selectedTimetableForAssign, setSelectedTimetableForAssign] = useState('');

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
        setEditingCourseId(null);
        setNotice({ message: editingCourseId ? 'Course updated' : 'Course added', type: 'success' });
        fetchAll();
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
        setEditingCourseId(null);
    };

    // Master Course (Course Pool) functions
    const submitMasterCourse = async () => {
        const courseData = { ...forms.course, timetable_id: null };
        const url = editingMasterCourseId ? `${API_BASE_URL}/courses/${editingMasterCourseId}` : `${API_BASE_URL}/courses`;
        const method = editingMasterCourseId ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({
                    ...courseData,
                    units: parseInt(courseData.units),
                    level: parseInt(courseData.level),
                    duration: parseFloat(courseData.duration)
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Request failed');
            }

            setForms(prev => ({ ...prev, course: emptyForms.course }));
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
        setEditingMasterCourseId(course.id);
        setActiveTab('coursepool');
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

    const cancelMasterCourseEdit = () => {
        setForms(prev => ({ ...prev, course: emptyForms.course }));
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

    const tabs = [
        { id: 'colleges', label: 'Colleges', count: colleges.length, icon: '🏛️' },
        { id: 'departments', label: 'Departments', count: departments.length, icon: '📚' },
        { id: 'lecturers', label: 'Lecturers', count: lecturers.length, icon: '👨‍🏫' },
        { id: 'venues', label: 'Venues', count: venues.length, icon: '🏢' },
        { id: 'coursepool', label: 'Course Pool', count: masterCourses.length, icon: '�' },
        { id: 'rules', label: 'Scheduling Rules', count: rules.length, icon: '⚙️' }
    ];

    const [activeTab, setActiveTab] = useState('colleges');

    const SectionCard = ({ title, children }) => (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
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
                    Back to Timetables
                </Link>
                <h1 className="text-2xl font-bold text-slate-900">Admin Data Management</h1>
                <p className="text-slate-500 mt-1">Manage colleges, departments, lecturers, venues, courses, and scheduling rules</p>
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
                <SectionCard title="Manage Colleges">
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
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase w-24">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {colleges.map(c => (
                                        <tr key={c.id} className="hover:bg-slate-50">
                                            <td className="py-3 px-4">
                                                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded">
                                                    {c.code}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-slate-800 font-medium">{c.name}</td>
                                            <td className="py-3 px-4 text-right">
                                                <DeleteButton onClick={() => deleteEntity(`/admin/colleges/${c.id}`)} />
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
                <SectionCard title="Manage Departments">
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
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase w-24">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {departments.map(d => (
                                        <tr key={d.id} className="hover:bg-slate-50">
                                            <td className="py-3 px-4">
                                                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded">
                                                    {d.code}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-slate-800 font-medium">{d.name}</td>
                                            <td className="py-3 px-4 text-slate-500 text-sm">{d.college_code}</td>
                                            <td className="py-3 px-4 text-right">
                                                <DeleteButton onClick={() => deleteEntity(`/admin/departments/${d.id}`)} />
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
                <SectionCard title="Manage Lecturers">
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
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase w-24">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {lecturers.map(l => (
                                        <tr key={l.id} className="hover:bg-slate-50">
                                            <td className="py-3 px-4 text-slate-800 font-medium">{l.name}</td>
                                            <td className="py-3 px-4 text-slate-500 text-sm">{l.email || '-'}</td>
                                            <td className="py-3 px-4">
                                                {l.department_code && (
                                                    <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                                                        {l.department_code}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <DeleteButton onClick={() => deleteEntity(`/admin/lecturers/${l.id}`)} />
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
                <SectionCard title="Manage Venues">
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
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase w-24">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {venues.map(v => (
                                        <tr key={v.id} className="hover:bg-slate-50">
                                            <td className="py-3 px-4 text-slate-800 font-medium">{v.name}</td>
                                            <td className="py-3 px-4 text-slate-500 text-sm">
                                                {collegeMap[v.college_code] || v.college_code || 'General'}
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded">
                                                    {v.capacity} seats
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <DeleteButton onClick={() => deleteEntity(`/admin/venues/${v.id}`)} />
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
                <SectionCard title="Course Pool (Master Courses)">
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

                    {/* Add/Edit Master Course Form */}
                    <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <h4 className="font-medium text-slate-700 mb-4">{editingMasterCourseId ? 'Edit Master Course' : 'Add New Master Course'}</h4>
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
                                    value={forms.course.lecturers.join(', ')}
                                    onChange={(e) => setForms(prev => ({ ...prev, course: { ...prev.course, lecturers: e.target.value.split(',').map(l => l.trim()).filter(Boolean) } }))}
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
                        <FormSelect
                            value={selectedTimetableForAssign}
                            onChange={(e) => setSelectedTimetableForAssign(e.target.value)}
                        >
                            <option value="">Select a Timetable...</option>
                            {timetables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </FormSelect>
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
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Code</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Title</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Dept</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Level</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Type</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Units</th>
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase w-40">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredMasterCourses.map(course => (
                                        <tr key={course.id} className="hover:bg-slate-50">
                                            <td className="py-3 px-4">
                                                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded">{course.code}</span>
                                            </td>
                                            <td className="py-3 px-4 text-slate-800 font-medium">{course.title}</td>
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

            {/* Rules Section */}
            {activeTab === 'rules' && (
                <SectionCard title="Manage Scheduling Rules">
                    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                        <div className="flex items-start gap-2">
                            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p>Rules are configured via system settings. Use the table below to view and activate/deactivate existing rules.</p>
                        </div>
                    </div>
                    
                    {rules.length === 0 ? (
                        <EmptyState icon="⚙️" message="No scheduling rules configured" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Rule Name</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Key</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Value</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase">Status</th>
                                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-600 uppercase w-20">Action</th>
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
                                                <button 
                                                    className="bg-[#059669] hover:bg-[#047857] text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                                    onClick={() => updateRule(rule)}
                                                >
                                                    Save
                                                </button>
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
