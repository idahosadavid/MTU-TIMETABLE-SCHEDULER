import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../apiBase';
import { adminHeaders } from '../adminAuth';
import FloatingNotice from './FloatingNotice';
import getNoticeTimeoutMs from '../noticeTimeout';

// Stats Card Component
const StatCard = ({ icon, label, value, color, subtext }) => (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default">
        <div className="flex items-start justify-between">
            <div>
                <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
                <p className="text-3xl font-bold text-slate-900">{value}</p>
                {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
            </div>
            <div className={`p-3 rounded-xl ${color}`}>
                {icon}
            </div>
        </div>
    </div>
);

// Skeleton loader for the table
const TableSkeleton = () => (
    <div className="space-y-3 p-2">
        {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
                <div className="skeleton w-8 h-8 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                    <div className="skeleton h-3.5 rounded w-1/3" />
                    <div className="skeleton h-3 rounded w-1/5" />
                </div>
                <div className="skeleton h-5 w-16 rounded-md hidden sm:block" />
                <div className="skeleton h-5 w-16 rounded-md hidden md:block" />
                <div className="skeleton h-5 w-20 rounded-md hidden lg:block" />
            </div>
        ))}
    </div>
);

const TimetableList = () => {
    const navigate = useNavigate();
    const [timetables, setTimetables] = useState([]);
    const [stats, setStats] = useState({ totalCourses: 0, totalLecturers: 0, totalVenues: 0, totalDepartments: 0 });
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedCollege, setSelectedCollege] = useState('');
    const [colleges, setColleges] = useState([]);
    const [changeNotice, setChangeNotice] = useState('');
    const [lastCheckedAt, setLastCheckedAt] = useState(null);
    const [actionNotice, setActionNotice] = useState({ message: '', type: 'info' });
    const previousSignatureRef = useRef('');
    const suppressNextNotificationRef = useRef(false);
    const [newTimetable, setNewTimetable] = useState({
        name: '',
        type: 'Lecture',
        academic_session: '',
        semester: 'First',
        college: ''
    });

    const fetchTimetables = async ({ silent = false } = {}) => {
        try {
            let url = `${API_BASE_URL}/timetables`;
            if (selectedCollege) {
                url += `?college=${selectedCollege}`;
            }
            const response = await fetch(url);
            const data = await response.json();
            const nextTimetables = data.data || [];
            const nextSignature = JSON.stringify(
                nextTimetables.map((item) => ({
                    id: item.id,
                    updated_at: item.updated_at,
                    name: item.name,
                    status: item.status
                }))
            );

            if (!silent && previousSignatureRef.current && previousSignatureRef.current !== nextSignature) {
                if (suppressNextNotificationRef.current) {
                    suppressNextNotificationRef.current = false;
                } else {
                    setChangeNotice('Timetable list updated with new changes.');
                }
            }

            previousSignatureRef.current = nextSignature;
            setTimetables(nextTimetables);
            setLastCheckedAt(new Date());
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch timetables', err);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTimetables({ silent: true });
    }, [selectedCollege]);

    useEffect(() => {
        const intervalId = setInterval(() => {
            fetchTimetables({ silent: false });
        }, 15000);

        return () => clearInterval(intervalId);
    }, [selectedCollege]);

    useEffect(() => {
        if (!changeNotice) {
            return;
        }

        const timeoutId = setTimeout(() => setChangeNotice(''), getNoticeTimeoutMs('info'));
        return () => clearTimeout(timeoutId);
    }, [changeNotice]);

    useEffect(() => {
        if (!actionNotice.message) {
            return;
        }

        const timeoutId = setTimeout(() => setActionNotice({ message: '', type: 'info' }), getNoticeTimeoutMs(actionNotice.type));
        return () => clearTimeout(timeoutId);
    }, [actionNotice]);

    useEffect(() => {
        const fetchColleges = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/admin/colleges`);
                const data = await response.json();
                setColleges(data.data || []);
                if ((data.data || []).length > 0) {
                    setNewTimetable(prev => ({ ...prev, college: prev.college || data.data[0].code }));
                }
            } catch (err) {
                console.error('Failed to fetch colleges', err);
            }
        };
        fetchColleges();
    }, []);

    // Fetch institutional stats
    useEffect(() => {
        const fetchStats = async () => {
            try {
                const [coursesRes, lecturersRes, venuesRes, departmentsRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/courses`, { headers: adminHeaders() }),
                    fetch(`${API_BASE_URL}/admin/lecturers`, { headers: adminHeaders() }),
                    fetch(`${API_BASE_URL}/admin/venues`, { headers: adminHeaders() }),
                    fetch(`${API_BASE_URL}/admin/departments`, { headers: adminHeaders() })
                ]);

                const [coursesData, lecturersData, venuesData, departmentsData] = await Promise.all([
                    coursesRes.json(),
                    lecturersRes.json(),
                    venuesRes.json(),
                    departmentsRes.json()
                ]);

                setStats({
                    totalCourses: Array.isArray(coursesData.data) ? coursesData.data.length : 0,
                    totalLecturers: Array.isArray(lecturersData.data) ? lecturersData.data.length : 0,
                    totalVenues: Array.isArray(venuesData.data) ? venuesData.data.length : 0,
                    totalDepartments: Array.isArray(departmentsData.data) ? departmentsData.data.length : 0
                });
            } catch (err) {
                console.error('Failed to fetch stats', err);
            }
        };
        fetchStats();
    }, []);

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_BASE_URL}/timetables`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify(newTimetable)
            });
            if (response.ok) {
                suppressNextNotificationRef.current = true;
                setShowCreateModal(false);
                fetchTimetables();
                setShowCreateModal(false);
                fetchTimetables();
                setNewTimetable({ name: '', type: 'Lecture', academic_session: '', semester: 'First', college: colleges[0]?.code || '' });
                setActionNotice({ message: 'Timetable created successfully.', type: 'success' });
            } else {
                setActionNotice({ message: 'Failed to create timetable.', type: 'error' });
            }
        } catch (err) {
            console.error(err);
            setActionNotice({ message: 'Failed to create timetable.', type: 'error' });
        }
    };

    const handleDelete = async (id, e) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this timetable?')) return;
        try {
            suppressNextNotificationRef.current = true;
            await fetch(`${API_BASE_URL}/timetables/${id}`, { method: 'DELETE', headers: adminHeaders() });
            fetchTimetables();
        } catch (err) {
            console.error(err);
        }
    };

    const handleDuplicate = async (id, e) => {
        e.stopPropagation();
        try {
            suppressNextNotificationRef.current = true;
            await fetch(`${API_BASE_URL}/timetables/${id}/duplicate`, { method: 'POST', headers: adminHeaders() });
            fetchTimetables();
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="space-y-8">
            <FloatingNotice
                message={changeNotice}
                type="info"
                actionLabel="Refresh"
                onAction={() => {
                    setChangeNotice('');
                    fetchTimetables({ silent: true });
                }}
                onDismiss={() => setChangeNotice('')}
                stackIndex={1}
            />
            <FloatingNotice
                message={actionNotice.message}
                type={actionNotice.type}
                onDismiss={() => setActionNotice({ message: '', type: 'info' })}
                stackIndex={0}
            />

            {/* Hero Banner */}
            <div className="bg-gradient-to-r from-[#4c1d95] via-[#6d28d9] to-[#4c1d95] rounded-2xl p-6 sm:p-8 text-white shadow-lg overflow-hidden relative">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-white" />
                    <div className="absolute -bottom-12 -left-12 w-64 h-64 rounded-full bg-white" />
                </div>
                <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin Dashboard</h1>
                        <p className="text-purple-200 text-sm mt-1">Manage timetables and generate conflict-free schedules for Mountain Top University</p>
                    </div>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-white text-[#4c1d95] rounded-xl font-semibold text-sm hover:bg-purple-50 transition-colors shadow-md shrink-0"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        New Timetable
                    </button>
                </div>
            </div>

            {/* Institutional Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Total Courses"
                    value={stats.totalCourses}
                    subtext="Active in system"
                    color="bg-purple-50 text-purple-600"
                    icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                    }
                />
                <StatCard
                    label="Total Lecturers"
                    value={stats.totalLecturers}
                    subtext="Teaching staff"
                    color="bg-emerald-50 text-emerald-600"
                    icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                    }
                />
                <StatCard
                    label="Total Venues"
                    value={stats.totalVenues}
                    subtext="Classrooms & halls"
                    color="bg-amber-50 text-amber-600"
                    icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                    }
                />
                <StatCard
                    label="Departments"
                    value={stats.totalDepartments}
                    subtext="Academic units"
                    color="bg-blue-50 text-blue-600"
                    icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                    }
                />
            </div>

            {/* Timetable Management Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900">Timetables</h2>
                        <p className="text-slate-500 text-sm mt-1">Manage your lecture, exam, and test schedules</p>
                        {lastCheckedAt && (
                            <p className="text-xs text-slate-400 mt-1">
                                Last updated: {lastCheckedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <select
                            value={selectedCollege}
                            onChange={(e) => setSelectedCollege(e.target.value)}
                            className="flex-1 sm:flex-none px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        >
                            <option value="">All Colleges</option>
                            {colleges.map(college => (
                                <option key={college.id} value={college.code}>{college.code}</option>
                            ))}
                        </select>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-[#4c1d95] text-white rounded-lg hover:bg-[#3b0764] transition-colors font-medium shadow-sm whitespace-nowrap"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            Add Timetable
                        </button>
                    </div>
                </div>

                {loading ? (
                    <TableSkeleton />
                ) : timetables.length === 0 ? (
                    <div className="text-center py-16 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <p className="text-slate-600 text-lg font-medium mb-2">No timetables found</p>
                        <p className="text-slate-400 text-sm mb-4">Get started by creating your first timetable</p>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="text-[#4c1d95] hover:text-[#3b0764] font-medium text-sm hover:underline"
                        >
                            Create your first timetable
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">College</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Session</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Semester</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Modified</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {timetables.map(timetable => (
                                    <tr
                                        key={timetable.id}
                                        onClick={() => navigate(`/timetable/${timetable.id}`)}
                                        className="hover:bg-slate-50 cursor-pointer transition-colors group"
                                    >
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center mr-3">
                                                    <span className="text-purple-700 font-semibold text-sm">{timetable.name?.charAt(0) || 'T'}</span>
                                                </div>
                                                <span className="text-sm font-semibold text-slate-900">{timetable.name || 'Untitled'}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            <span className="px-2.5 py-1 inline-flex text-xs leading-4 font-medium rounded-md bg-slate-100 text-slate-700">
                                                {timetable.college || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            <span className={`px-2.5 py-1 inline-flex text-xs leading-4 font-medium rounded-md ${
                                                timetable.type === 'Lecture' ? 'bg-emerald-100 text-emerald-700' :
                                                timetable.type === 'Exam' ? 'bg-purple-100 text-purple-700' :
                                                'bg-amber-100 text-amber-700'
                                            }`}>
                                                {timetable.type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-600 hidden sm:table-cell">
                                            {timetable.academic_session || '-'}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-600 hidden md:table-cell">
                                            {timetable.semester || '-'}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500 hidden lg:table-cell">
                                            {new Date(timetable.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex justify-end items-center gap-1">
                                                <button
                                                    onClick={(e) => handleDuplicate(timetable.id, e)}
                                                    className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors"
                                                    title="Duplicate"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={(e) => handleDelete(timetable.id, e)}
                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                                    title="Delete"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create Timetable Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="bg-[#4c1d95] px-6 py-4">
                            <h3 className="text-lg font-semibold text-white">Create New Timetable</h3>
                        </div>
                        <form onSubmit={handleCreate} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Timetable Name</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    value={newTimetable.name}
                                    onChange={e => setNewTimetable({ ...newTimetable, name: e.target.value })}
                                    placeholder="e.g., CSC 100 Level - First Semester"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                                    <select
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                                        value={newTimetable.type}
                                        onChange={e => setNewTimetable({ ...newTimetable, type: e.target.value })}
                                    >
                                        <option value="Lecture">Lecture</option>
                                        <option value="Exam">Exam</option>
                                        <option value="Test">Test</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Semester</label>
                                    <select
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                                        value={newTimetable.semester}
                                        onChange={e => setNewTimetable({ ...newTimetable, semester: e.target.value })}
                                    >
                                        <option value="First">First</option>
                                        <option value="Second">Second</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">College</label>
                                <select
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                                    value={newTimetable.college}
                                    onChange={e => setNewTimetable({ ...newTimetable, college: e.target.value })}
                                >
                                    {colleges.map(college => (
                                        <option key={college.id} value={college.code}>{college.code} — {college.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Academic Session</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                                    value={newTimetable.academic_session}
                                    onChange={e => setNewTimetable({ ...newTimetable, academic_session: e.target.value })}
                                    placeholder="e.g. 2024/2025"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-[#4c1d95] text-white rounded-lg hover:bg-[#3b0764] font-medium transition-colors"
                                >
                                    Create Timetable
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TimetableList;
