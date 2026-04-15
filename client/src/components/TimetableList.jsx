import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../apiBase';
import { adminHeaders } from '../adminAuth';
import FloatingNotice from './FloatingNotice';
import getNoticeTimeoutMs from '../noticeTimeout';

const TimetableList = () => {
    const navigate = useNavigate();
    const [timetables, setTimetables] = useState([]);
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

    if (loading) return <div>Loading timetables...</div>;

    return (
        <div className="p-6">
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
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-gray-800">Timetables</h2>
                    <p className="text-gray-600">Manage your lecture, exam, and test schedules.</p>
                    {lastCheckedAt && (
                        <p className="mt-1 text-xs text-gray-500">
                            Last checked: {lastCheckedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                    )}
                </div>
                <div className="flex space-x-4">
                    <select
                        value={selectedCollege}
                        onChange={(e) => setSelectedCollege(e.target.value)}
                        className="border p-2 rounded shadow-sm"
                    >
                        <option value="">All Colleges</option>
                        {colleges.map(college => (
                            <option key={college.id} value={college.code}>{college.code}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg hover:bg-blue-700 font-semibold flex items-center"
                    >
                        <span className="text-xl mr-2">+</span> Add Timetable
                    </button>
                </div>
            </div>

            {timetables.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg shadow border border-gray-200">
                    <p className="text-gray-500 text-lg mb-4">No timetables found.</p>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="text-blue-600 hover:underline"
                    >
                        Create your first timetable
                    </button>
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">College</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Session</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Semester</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Modified</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {timetables.map(timetable => (
                                <tr
                                    key={timetable.id}
                                    onClick={() => navigate(`/timetable/${timetable.id}`)}
                                    className="hover:bg-gray-50 cursor-pointer transition-colors group"
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-blue-900">{timetable.name || 'Untitled'}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                                            {timetable.college || 'N/A'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${timetable.type === 'Lecture' ? 'bg-green-100 text-green-800' :
                                            timetable.type === 'Exam' ? 'bg-purple-100 text-purple-800' :
                                                'bg-orange-100 text-orange-800'
                                            }`}>
                                            {timetable.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {timetable.academic_session || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {timetable.semester || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {timetable.status || 'Draft'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {new Date(timetable.updated_at).toLocaleDateString()} {new Date(timetable.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => handleDuplicate(timetable.id, e)}
                                                className="text-indigo-600 hover:text-indigo-900"
                                                title="Duplicate"
                                            >
                                                Copy
                                            </button>
                                            <button
                                                onClick={(e) => handleDelete(timetable.id, e)}
                                                className="text-red-600 hover:text-red-900"
                                                title="Delete"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showCreateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-96">
                        <h3 className="text-xl font-bold mb-4">Create New Timetable</h3>
                        <form onSubmit={handleCreate}>
                            <div className="mb-3">
                                <label className="block text-sm font-medium text-gray-700">Name</label>
                                <input
                                    type="text"
                                    className="w-full border p-2 rounded"
                                    value={newTimetable.name}
                                    onChange={e => setNewTimetable({ ...newTimetable, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="mb-3">
                                <label className="block text-sm font-medium text-gray-700">Type</label>
                                <select
                                    className="w-full border p-2 rounded"
                                    value={newTimetable.type}
                                    onChange={e => setNewTimetable({ ...newTimetable, type: e.target.value })}
                                >
                                    <option value="Lecture">Lecture</option>
                                    <option value="Exam">Exam</option>
                                    <option value="Test">Test</option>
                                </select>
                            </div>
                            <div className="mb-3">
                                <label className="block text-sm font-medium text-gray-700">College</label>
                                <select
                                    className="w-full border p-2 rounded"
                                    value={newTimetable.college}
                                    onChange={e => setNewTimetable({ ...newTimetable, college: e.target.value })}
                                >
                                    {colleges.map(college => (
                                        <option key={college.id} value={college.code}>{college.code} - {college.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="mb-3">
                                <label className="block text-sm font-medium text-gray-700">Academic Session</label>
                                <input
                                    type="text"
                                    className="w-full border p-2 rounded"
                                    value={newTimetable.academic_session}
                                    onChange={e => setNewTimetable({ ...newTimetable, academic_session: e.target.value })}
                                    placeholder="e.g. 2024/2025"
                                />
                            </div>
                            <div className="mb-3">
                                <label className="block text-sm font-medium text-gray-700">Semester</label>
                                <select
                                    className="w-full border p-2 rounded"
                                    value={newTimetable.semester}
                                    onChange={e => setNewTimetable({ ...newTimetable, semester: e.target.value })}
                                >
                                    <option value="First">First</option>
                                    <option value="Second">Second</option>
                                </select>
                            </div>
                            <div className="flex justify-end space-x-2 mt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                    Create
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
