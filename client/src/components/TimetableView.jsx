import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Dashboard from './Dashboard';
import API_BASE_URL from '../apiBase';
import FloatingNotice from './FloatingNotice';
import getNoticeTimeoutMs from '../noticeTimeout';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TIMES = ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];


const TimetableView = () => {
    const { id } = useParams();
    const timetableId = id;
    const [timetable, setTimetable] = useState(null);
    const [scheduled, setScheduled] = useState([]);
    const [unscheduled, setUnscheduled] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('timetable'); // 'timetable' or 'courses'
    const [showOnlyCompulsory, setShowOnlyCompulsory] = useState(false);
    const [exportFormat, setExportFormat] = useState('excel');
    const [exportDepartment, setExportDepartment] = useState('');
    const [exportLevel, setExportLevel] = useState('');
    const [changeNotice, setChangeNotice] = useState('');
    const [actionNotice, setActionNotice] = useState({ message: '', type: 'info' });
    const [lastCheckedAt, setLastCheckedAt] = useState(null);
    const previousSignatureRef = useRef('');
    const suppressNextNotificationRef = useRef(false);

    const fetchTimetable = async ({ silent = false } = {}) => {
        try {
            const response = await fetch(`${API_BASE_URL}/timetables/${timetableId}`);
            const data = await response.json();
            if (data.data) {
                const nextSignature = JSON.stringify({
                    updated_at: data.data.updated_at,
                    scheduled: data.data.data?.scheduled || [],
                    unscheduled: data.data.data?.unscheduled || []
                });

                if (!silent && previousSignatureRef.current && previousSignatureRef.current !== nextSignature) {
                    if (suppressNextNotificationRef.current) {
                        suppressNextNotificationRef.current = false;
                    } else {
                        setChangeNotice('Timetable updated with new changes.');
                    }
                }

                previousSignatureRef.current = nextSignature;
                setTimetable(data.data);
                setScheduled(data.data.data.scheduled || []);
                setUnscheduled(data.data.data.unscheduled || []);
                setLastCheckedAt(new Date());
            }
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch timetable', err);
            setLoading(false);
        }
    };

    useEffect(() => {
        if (timetableId) {
            fetchTimetable();
        }
    }, [timetableId]);

    useEffect(() => {
        if (!timetableId) {
            return;
        }

        const intervalId = setInterval(() => {
            fetchTimetable({ silent: false });
        }, 15000);

        return () => clearInterval(intervalId);
    }, [timetableId]);

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

    const handleDragStart = (e, course, source) => {
        e.dataTransfer.setData('course', JSON.stringify(course));
        e.dataTransfer.setData('source', source); // 'scheduled' or 'unscheduled'
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = async (e, day, time) => {
        e.preventDefault();
        const course = JSON.parse(e.dataTransfer.getData('course'));
        const source = e.dataTransfer.getData('source');

        // Optimistic update? No, let's validate first.
        try {
            const response = await fetch(`${API_BASE_URL}/timetables/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schedule: scheduled, course, day, time })
            });
            const result = await response.json();

            if (result.valid) {
                // Update state
                let newScheduled = [...scheduled];
                let newUnscheduled = [...unscheduled];

                // Remove from old position if it was scheduled
                if (source === 'scheduled') {
                    newScheduled = newScheduled.filter(c => c.code !== course.code);
                } else {
                    newUnscheduled = newUnscheduled.filter(c => c.code !== course.code);
                }

                // Add to new position
                newScheduled.push({ ...course, day, time, venue: course.venue || 'Unassigned' });

                setScheduled(newScheduled);
                setUnscheduled(newUnscheduled);
                suppressNextNotificationRef.current = true;

                // Save changes
                await fetch(`${API_BASE_URL}/timetables/${timetableId}/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scheduled: newScheduled, unscheduled: newUnscheduled })
                });
                setActionNotice({ message: 'Course moved successfully.', type: 'success' });
            } else {
                setActionNotice({ message: 'Conflict detected. Cannot move course here.', type: 'error' });
            }
        } catch (err) {
            console.error('Error validating/saving move:', err);
            setActionNotice({ message: 'Failed to update timetable.', type: 'error' });
        }
    };

    const handleClearUnscheduled = async () => {
        if (!window.confirm('Clear all unscheduled courses from this view? They will remain in the database.')) return;

        // Optimistically update UI
        setUnscheduled([]);

        try {
            // Use dedicated endpoint to ensure we don't accidentally wipe scheduled courses
            suppressNextNotificationRef.current = true;
            await fetch(`${API_BASE_URL}/timetables/${timetableId}/clear-unscheduled`, {
                method: 'POST'
            });
            setActionNotice({ message: 'Unscheduled list cleared.', type: 'success' });
        } catch (err) {
            console.error('Error clearing unscheduled:', err);
            setActionNotice({ message: 'Failed to save changes.', type: 'error' });
        }
    };

    const handleExport = async () => {
        try {
            const query = new URLSearchParams({ format: exportFormat });
            if (exportDepartment) query.append('department', exportDepartment);
            if (exportLevel) query.append('level', exportLevel);

            const response = await fetch(`${API_BASE_URL}/timetables/${timetableId}/export?${query.toString()}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Export failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            const ext = exportFormat === 'word' ? 'docx' : exportFormat === 'pdf' ? 'pdf' : 'xlsx';
            link.href = url;
            link.download = `${timetable.name || 'timetable'}_${exportDepartment || 'all'}_${exportLevel || 'all'}.${ext}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            setActionNotice({ message: 'Export completed successfully.', type: 'success' });
        } catch (error) {
            setActionNotice({ message: error.message || 'Export failed', type: 'error' });
        }
    };

    const departments = Array.from(new Set(scheduled.map(item => item.department).filter(Boolean)));
    const isCompulsoryCourse = (course) => course.is_compulsory === true || course.is_compulsory === 1 || course.is_compulsory === '1' || course.is_compulsory === 'true';
    const filteredUnscheduled = showOnlyCompulsory ? unscheduled.filter(isCompulsoryCourse) : unscheduled;

    if (loading) {
        return <div className="p-6">Loading timetable...</div>;
    }

    if (!timetable) {
        return <div className="p-6 text-red-600">Error: Timetable not found.</div>;
    }

    const isTimetableEmpty = !scheduled || (scheduled.length === 0 && unscheduled.length === 0);

    return (
        <div className="p-6">
            <FloatingNotice
                message={changeNotice}
                type="info"
                actionLabel="Refresh"
                onAction={() => {
                    setChangeNotice('');
                    fetchTimetable({ silent: true });
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
            <div className="flex items-center justify-between mb-4">
                <div>
                    <Link to="/" className="text-blue-600 hover:underline mb-2 inline-block">&larr; Back to List</Link>
                    <h2 className="text-2xl font-bold text-blue-900">{timetable.name}</h2>
                    <p className="text-sm text-gray-600">{timetable.academic_session} - {timetable.semester} Semester ({timetable.type})</p>
                    {lastCheckedAt && (
                        <p className="mt-1 text-xs text-gray-500">
                            Last checked: {lastCheckedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                    )}
                </div>
                <div className="space-x-2">
                    <button
                        onClick={() => {
                            setViewMode('timetable');
                            fetchTimetable();
                        }}
                        className={`px-4 py-2 rounded ${viewMode === 'timetable' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                    >
                        View Timetable
                    </button>
                    <button
                        onClick={() => setViewMode('courses')}
                        className={`px-4 py-2 rounded ${viewMode === 'courses' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                    >
                        Manage Courses
                    </button>
                </div>
            </div>

            <div className="mb-4 p-3 border rounded bg-gray-50 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm text-gray-700">Download:</span>
                <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} className="border p-2 rounded text-sm">
                    <option value="excel">Excel</option>
                    <option value="pdf">PDF</option>
                    <option value="word">Word</option>
                </select>
                <select value={exportDepartment} onChange={(e) => setExportDepartment(e.target.value)} className="border p-2 rounded text-sm">
                    <option value="">All Departments</option>
                    {departments.map(dep => <option key={dep} value={dep}>{dep}</option>)}
                </select>
                <select value={exportLevel} onChange={(e) => setExportLevel(e.target.value)} className="border p-2 rounded text-sm">
                    <option value="">All Levels</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                    <option value="300">300</option>
                    <option value="400">400</option>
                    <option value="500">500</option>
                </select>
                <button onClick={handleExport} className="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700">Export</button>
                <label className="ml-auto flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        checked={showOnlyCompulsory}
                        onChange={(e) => setShowOnlyCompulsory(e.target.checked)}
                    />
                    Show only compulsory
                </label>
            </div>

            {
                viewMode === 'courses' ? (
                    <Dashboard timetableId={timetableId} />
                ) : (
                    <>
                        {isTimetableEmpty ? (
                            <div className="p-4 text-gray-500 bg-gray-50 border rounded">
                                <div>No timetable generated yet.</div>
                                <div className="mt-2 text-sm">
                                    Go to <strong>Manage Courses</strong> to add courses, then click user generic buttons to generate.
                                </div>
                                {unscheduled.length > 0 && (
                                    <div className="mt-4">
                                        <h3 className="text-lg font-bold text-red-600">Unscheduled Courses</h3>
                                        <ul className="list-disc pl-5">
                                            {unscheduled.map((course, idx) => (
                                                <li key={idx} className="text-red-500">
                                                    {course.code} - {course.title} (Reason: Conflict)
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex gap-4">
                                {/* Unscheduled Courses Sidebar */}
                                <div className="w-1/4 bg-gray-50 p-4 rounded shadow h-[calc(100vh-200px)] overflow-y-auto">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="font-bold text-gray-700">Unscheduled ({filteredUnscheduled.length})</h3>
                                        {filteredUnscheduled.length > 0 && (
                                            <button
                                                onClick={handleClearUnscheduled}
                                                className="text-xs text-red-600 hover:text-red-800 underline"
                                                title="Clear all unscheduled courses (Safely)"
                                            >
                                                Clear List
                                            </button>
                                        )}
                                    </div>
                                    <div
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, 'unscheduled', null, null)}
                                        className="min-h-[200px] space-y-2"
                                    >
                                        {filteredUnscheduled.map((course, index) => (
                                            <div
                                                key={course.id || index}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, course, 'unscheduled')}
                                                className="bg-white p-2 rounded shadow text-sm cursor-move border-l-4 border-yellow-400 hover:bg-yellow-50"
                                            >
                                                <div className="font-bold flex items-center justify-between gap-1">
                                                    <span>{course.code}</span>
                                                    {course.is_compulsory && <span className="text-[10px] bg-blue-200 px-1 rounded text-blue-800">COMP</span>}
                                                </div>
                                                <div className="text-xs text-gray-600">{course.title}</div>
                                                <div className="text-xs text-gray-500">{course.duration / 60}h • {course.student_count} students</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Timetable Grid */}
                                <div className="w-3/4 overflow-x-auto">
                                    <table className="min-w-full border-collapse border border-gray-300">
                                        <thead>
                                            <tr>
                                                <th className="border border-gray-300 p-2 bg-gray-100 w-20">Time</th>
                                                {DAYS.map(day => (
                                                    <th key={day} className="border border-gray-300 p-2 bg-gray-100">{day}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {TIMES.map(time => (
                                                <tr key={time}>
                                                    <td className="border border-gray-300 p-2 font-bold text-center bg-gray-50">{time}</td>
                                                    {DAYS.map(day => {
                                                        const slotCourses = scheduled.filter(c => {
                                                            if (!(c.day === day && c.time === time)) return false;
                                                            if (!showOnlyCompulsory) return true;
                                                            return isCompulsoryCourse(c);
                                                        });
                                                        return (
                                                            <td
                                                                key={`${day}-${time}`}
                                                                className="border border-gray-300 p-1 h-24 align-top relative"
                                                                onDragOver={handleDragOver}
                                                                onDrop={(e) => handleDrop(e, 'scheduled', day, time)}
                                                            >
                                                                {slotCourses.map((course, idx) => (
                                                                    <div
                                                                        key={`${course.code}-${idx}`}
                                                                        draggable
                                                                        onDragStart={(e) => handleDragStart(e, course, 'scheduled')}
                                                                        className="bg-blue-100 p-1 rounded text-xs mb-1 border-l-4 border-blue-500 cursor-move hover:bg-blue-200 relative group"
                                                                        title={`${course.title} (${course.lecturers})`}
                                                                    >
                                                                        <div className="font-bold flex items-center justify-between gap-1">
                                                                            <span>{course.code}</span>
                                                                            {course.is_compulsory && <span className="text-[10px] bg-blue-200 px-1 rounded text-blue-800">COMP</span>}
                                                                        </div>
                                                                        <div>{course.venue}</div>

                                                                        {/* Remove Button (Hover) */}
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                // Move back to unscheduled
                                                                                const newScheduled = scheduled.filter(c => c !== course);
                                                                                const newUnscheduled = [...unscheduled, course];
                                                                                setScheduled(newScheduled);
                                                                                setUnscheduled(newUnscheduled);
                                                                                suppressNextNotificationRef.current = true;
                                                                                // Save immediately
                                                                                fetch(`${API_BASE_URL}/timetables/${timetableId}/save`, {
                                                                                    method: 'POST',
                                                                                    headers: { 'Content-Type': 'application/json' },
                                                                                    body: JSON.stringify({ scheduled: newScheduled, unscheduled: newUnscheduled })
                                                                                });
                                                                            }}
                                                                            className="absolute top-0 right-0 text-red-500 hover:text-red-700 p-1 opacity-0 group-hover:opacity-100"
                                                                            title="Remove from slot"
                                                                        >
                                                                            ×
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                        <div className="mt-3 text-xs text-gray-600">
                            <span className="bg-blue-200 px-1 rounded text-blue-800 mr-1">COMP</span>
                            Compulsory course
                        </div>
                    </>
                )
            }
        </div >
    );
};

export default TimetableView;
