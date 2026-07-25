import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import API_BASE_URL from '../apiBase';
import { adminHeaders } from '../adminAuth';
import FloatingNotice from './FloatingNotice';
import getNoticeTimeoutMs from '../noticeTimeout';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TIMES = ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM'];

// Course type color schemes
const courseTypeStyles = {
    Lecture: {
        bg: 'bg-emerald-50',
        border: 'border-emerald-400',
        text: 'text-emerald-900',
        badge: 'bg-emerald-100 text-emerald-700',
        hover: 'hover:bg-emerald-100'
    },
    Exam: {
        bg: 'bg-purple-50',
        border: 'border-purple-400',
        text: 'text-purple-900',
        badge: 'bg-purple-100 text-purple-700',
        hover: 'hover:bg-purple-100'
    },
    Test: {
        bg: 'bg-amber-50',
        border: 'border-amber-400',
        text: 'text-amber-900',
        badge: 'bg-amber-100 text-amber-700',
        hover: 'hover:bg-amber-100'
    }
};

// Legend component
const Legend = () => (
    <div className="flex flex-wrap gap-4 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-emerald-50 border-2 border-emerald-400"></div>
            <span>Lecture</span>
        </div>
        <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-purple-50 border-2 border-purple-400"></div>
            <span>Exam</span>
        </div>
        <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-amber-50 border-2 border-amber-400"></div>
            <span>Test</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded">!</span>
            <span>Clash Warning</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded">COMP</span>
            <span>Compulsory</span>
        </div>
    </div>
);

// Convert stored 24-hour time (e.g. '13:00') to 12-hour AM/PM (e.g. '1:00 PM')
const to12Hour = (t) => {
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

// Convert 12-hour AM/PM display label back to 24-hour (e.g. '1:00 PM' -> '13:00')
const to24Hour = (t) => {
    if (!t) return t;
    if (!String(t).includes('AM') && !String(t).includes('PM')) return t; // Already 24h
    const isPM = String(t).includes('PM');
    const timePart = String(t).replace(' AM', '').replace(' PM', '');
    const [hStr, mStr = '00'] = timePart.split(':');
    let h = parseInt(hStr, 10);
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return `${h}:${mStr}`;
};


const TimetableView = () => {
    const { id } = useParams();
    const timetableId = id;
    const [timetable, setTimetable] = useState(null);
    const [scheduled, setScheduled] = useState([]);
    const [unscheduled, setUnscheduled] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('assign'); // 'timetable' or 'assign' — default assign so new timetables land on the right step
    const [masterCourses, setMasterCourses] = useState([]);
    const [assignedCourseIds, setAssignedCourseIds] = useState(new Set());
    const [poolLoading, setPoolLoading] = useState(false);
    const [exportFormat, setExportFormat] = useState('excel');
    const [exportDepartment, setExportDepartment] = useState('');
    const [exportLevel, setExportLevel] = useState('');
    const [changeNotice, setChangeNotice] = useState('');
    const [actionNotice, setActionNotice] = useState({ message: '', type: 'info' });
    const [lastCheckedAt, setLastCheckedAt] = useState(null);
    const [conflicts, setConflicts] = useState(null);
    const [conflictsLoading, setConflictsLoading] = useState(false);
    const [showConflicts, setShowConflicts] = useState(false);
    const [qualityReport, setQualityReport] = useState(null);
    const [showReport, setShowReport] = useState(false);
    const [reoptimizing, setReoptimizing] = useState(false);
    const previousSignatureRef = useRef('');
    const pendingDataRef = useRef(null);   // incoming server state not yet applied to grid
    const isDirtyRef = useRef(false);      // user has uncommitted local edits
    const hasInitiallyLoadedRef = useRef(false);

    const fetchTimetable = async ({ silent = false } = {}) => {
        try {
            const timetableRes = await fetch(`${API_BASE_URL}/timetables/${timetableId}`);
            const data = await timetableRes.json();
            
            let assignedCourses = null;
            try {
                const assignedRes = await fetch(`${API_BASE_URL}/timetables/${timetableId}/courses`, { headers: adminHeaders() });
                if (assignedRes.ok) {
                    const assignedData = await assignedRes.json();
                    assignedCourses = assignedData.data || [];
                }
            } catch (e) {
                console.error('Failed to fetch assigned courses', e);
            }

            if (data.data) {
                let currentScheduled = data.data.data?.scheduled || [];
                let currentUnscheduled = data.data.data?.unscheduled || [];

                if (assignedCourses && !hasInitiallyLoadedRef.current && !data.data.data?.cleared_unscheduled) {
                    // Only inject missing assigned courses on the very first load.
                    // On subsequent polls we trust the server state so that user actions
                    // like "clear unscheduled" are not reversed by the polling loop.
                    const existingCodes = new Set([
                        ...currentScheduled.map(c => c.code),
                        ...currentUnscheduled.map(c => c.code)
                    ]);
                    const missingUnscheduled = assignedCourses.filter(c => !existingCodes.has(c.code));

                    if (missingUnscheduled.length > 0) {
                        currentUnscheduled = [
                            ...currentUnscheduled,
                            ...missingUnscheduled.map(c => ({...c, day: undefined, time: undefined}))
                        ];
                    }
                }

                const nextSignature = JSON.stringify({
                    updated_at: data.data.updated_at,
                    scheduled: currentScheduled,
                    unscheduled: currentUnscheduled
                });

                if (!silent && previousSignatureRef.current && previousSignatureRef.current !== nextSignature) {
                    // Store incoming data without applying it — let the user decide via the toast.
                    pendingDataRef.current = {
                        timetable: data.data,
                        scheduled: currentScheduled,
                        unscheduled: currentUnscheduled,
                        signature: nextSignature,
                    };
                    const noticeMsg = isDirtyRef.current
                        ? 'New changes are available — Refresh now or keep editing?'
                        : 'Timetable updated with new changes.';
                    setChangeNotice(noticeMsg);
                    // Do not overwrite grid state here; Refresh button will apply pendingDataRef.
                    setLoading(false);
                    return;
                }

                previousSignatureRef.current = nextSignature;
                setTimetable(data.data);
                setScheduled(currentScheduled);
                setUnscheduled(currentUnscheduled);
                setLastCheckedAt(new Date());
                hasInitiallyLoadedRef.current = true;
            }
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch timetable', err);
            setLoading(false);
        }
    };

    const applyPendingData = () => {
        const pending = pendingDataRef.current;
        if (pending) {
            previousSignatureRef.current = pending.signature;
            setTimetable(pending.timetable);
            setScheduled(pending.scheduled);
            setUnscheduled(pending.unscheduled);
            setLastCheckedAt(new Date());
            pendingDataRef.current = null;
        }
        isDirtyRef.current = false;
        setChangeNotice('');
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

    // dataTransfer may hold arbitrary content (e.g. text or files dragged from
    // outside the app) — never let a malformed payload throw inside a drop handler.
    const parseDraggedCourse = (e) => {
        try {
            const raw = e.dataTransfer.getData('course');
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    };

    const handleDropToUnscheduled = async (e) => {
        e.preventDefault();
        const course = parseDraggedCourse(e);
        if (!course) return;
        const source = e.dataTransfer.getData('source');
        if (source !== 'scheduled') return; // Already unscheduled, nothing to do

        const newScheduled = scheduled.filter(c => c.code !== course.code || c.day !== course.day || c.time !== course.time);
        const newUnscheduled = [...unscheduled, { ...course, day: undefined, time: undefined }];
        setScheduled(newScheduled);
        setUnscheduled(newUnscheduled);
        isDirtyRef.current = true;
        try {
            await fetch(`${API_BASE_URL}/timetables/${timetableId}/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({ scheduled: newScheduled, unscheduled: newUnscheduled })
            });
            isDirtyRef.current = false;
            pendingDataRef.current = null;
            setActionNotice({ message: 'Course moved to unscheduled.', type: 'success' });
        } catch (err) {
            console.error('Error saving move to unscheduled:', err);
        }
    };

    const handleDrop = async (e, day, time) => {
        e.preventDefault();
        const course = parseDraggedCourse(e);
        if (!course) return;
        const source = e.dataTransfer.getData('source');

        // Optimistic update? No, let's validate first.
        try {
            const response = await fetch(`${API_BASE_URL}/timetables/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({ schedule: scheduled, course, day, time })
            });
            const result = await response.json();

            if (result.valid) {
                // Build the new state with the locked course in its new position
                let newScheduled = [...scheduled];
                let newUnscheduled = [...unscheduled];

                if (source === 'scheduled') {
                    newScheduled = newScheduled.filter(c => c.code !== course.code || c.day !== course.day || c.time !== course.time);
                } else {
                    newUnscheduled = newUnscheduled.filter(c => c.code !== course.code);
                }
                const lockedCourse = { ...course, day, time, venue: course.venue || 'Unassigned' };
                newScheduled.push(lockedCourse);

                // Optimistic UI update
                setScheduled(newScheduled);
                setUnscheduled(newUnscheduled);
                isDirtyRef.current = true;

                // Re-run ALNS on the affected subset to fix any new conflicts
                setReoptimizing(true);
                try {
                    const reoptRes = await fetch(`${API_BASE_URL}/timetables/${timetableId}/reoptimize`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                        body: JSON.stringify({ lockedCourse, scheduled: newScheduled, unscheduled: newUnscheduled })
                    });
                    if (reoptRes.ok) {
                        const reoptData = await reoptRes.json();
                        setScheduled(reoptData.data.scheduled);
                        setUnscheduled(reoptData.data.unscheduled);
                        if (reoptData.report) setQualityReport(reoptData.report);
                        setActionNotice({ message: 'Course moved and schedule re-optimised.', type: 'success' });
                    } else {
                        // Reoptimize failed — fall back to plain save
                        await fetch(`${API_BASE_URL}/timetables/${timetableId}/save`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                            body: JSON.stringify({ scheduled: newScheduled, unscheduled: newUnscheduled })
                        });
                        setActionNotice({ message: 'Course moved successfully.', type: 'success' });
                    }
                } finally {
                    setReoptimizing(false);
                    isDirtyRef.current = false;
                    pendingDataRef.current = null;
                }
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
            const res = await fetch(`${API_BASE_URL}/timetables/${timetableId}/clear-unscheduled`, {
                method: 'POST',
                headers: adminHeaders()
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Server error');
            }
            setActionNotice({ message: 'Unscheduled list cleared.', type: 'success' });
        } catch (err) {
            console.error('Error clearing unscheduled:', err);
            setActionNotice({ message: 'Failed to save changes.', type: 'error' });
        }
    };



    // Course Pool Assignment Functions
    const fetchPoolData = async () => {
        setPoolLoading(true);
        try {
            const [masterRes, timetableRes] = await Promise.all([
                fetch(`${API_BASE_URL}/courses/master`, { headers: adminHeaders() }),
                fetch(`${API_BASE_URL}/timetables/${timetableId}/courses`, { headers: adminHeaders() })
            ]);
            const masterData = await masterRes.json();
            const timetableData = await timetableRes.json();

            const allCourses = masterData.data || [];
            const assignedCourses = timetableData.data || [];

            setMasterCourses(allCourses);
            const assignedIds = new Set(assignedCourses.map(c => c.id));
            setAssignedCourseIds(assignedIds);
        } catch (err) {
            console.error('Failed to fetch pool data:', err);
            setActionNotice({ message: 'Failed to load course pool.', type: 'error' });
        } finally {
            setPoolLoading(false);
        }
    };

    useEffect(() => {
        if (viewMode === 'assign') {
            fetchPoolData();
        }
    }, [viewMode, timetableId]);

    // Fetch assigned course count on mount so the Generate button state is correct
    // even before the user visits the Assign Courses tab.
    useEffect(() => {
        if (!timetableId) return;
        fetch(`${API_BASE_URL}/timetables/${timetableId}/courses`, { headers: adminHeaders() })
            .then(res => res.json())
            .then(data => {
                const assignedCourses = data.data || [];
                setAssignedCourseIds(new Set(assignedCourses.map(c => c.id)));
            })
            .catch(err => console.error('Failed to fetch assigned courses count:', err));
    }, [timetableId]);

    const handleAssignCourse = async (courseId) => {
        try {
            const response = await fetch(`${API_BASE_URL}/timetables/${timetableId}/courses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({ course_id: courseId })
            });
            if (!response.ok) throw new Error('Assignment failed');

            setAssignedCourseIds(prev => new Set([...prev, courseId]));
            setActionNotice({ message: 'Course assigned to timetable.', type: 'success' });
        } catch (err) {
            setActionNotice({ message: err.message, type: 'error' });
        }
    };

    const handleRemoveCourse = async (courseId) => {
        if (!window.confirm('Remove this course from the timetable?')) return;
        try {
            const response = await fetch(`${API_BASE_URL}/timetables/${timetableId}/courses/${courseId}`, {
                method: 'DELETE',
                headers: adminHeaders()
            });
            if (!response.ok) throw new Error('Removal failed');

            setAssignedCourseIds(prev => {
                const next = new Set(prev);
                next.delete(courseId);
                return next;
            });
            setActionNotice({ message: 'Course removed from timetable.', type: 'success' });
        } catch (err) {
            setActionNotice({ message: err.message, type: 'error' });
        }
    };

    const handleCheckConflicts = async () => {
        setConflictsLoading(true);
        setShowConflicts(true);
        try {
            const res = await fetch(`${API_BASE_URL}/timetables/${timetableId}/conflicts`, {
                headers: adminHeaders()
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to check conflicts');
            setConflicts(json.data || []);
        } catch (err) {
            setConflicts(null);
            setActionNotice({ message: err.message, type: 'error' });
        } finally {
            setConflictsLoading(false);
        }
    };

    const handleGenerate = async () => {
        if (scheduled.length > 0) {
            const confirmed = window.confirm(
                'This will overwrite the current schedule, including any manual adjustments you have made. Continue?'
            );
            if (!confirmed) return;
        }
        try {
            setPoolLoading(true);
            const typeEndpoint = timetable?.type ? timetable.type.toLowerCase() + 's' : 'lectures';
            const response = await fetch(`${API_BASE_URL}/generate/${typeEndpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({
                    timetable_id: timetableId,
                    scope: 'college' // Default to college scope from TimetableView
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Generation failed');
            }

            const result = await response.json();
            if (result.report) {
                setQualityReport(result.report);
                setShowReport(true);
            }
            setActionNotice({ message: 'Timetable generated successfully!', type: 'success' });
            setViewMode('timetable');
            fetchTimetable();
        } catch (err) {
            setActionNotice({ message: err.message, type: 'error' });
        } finally {
            setPoolLoading(false);
        }
    };

    const handleExport = () => {
        try {
            const query = new URLSearchParams({ format: exportFormat });
            if (exportDepartment) query.append('department', exportDepartment);
            if (exportLevel) query.append('level', exportLevel);

            // Use a direct anchor-tag navigation instead of fetch() to avoid
            // IDM (Internet Download Manager) and other download-manager extensions
            // intercepting the fetch call, which strips CORS headers and causes
            // ERR_FAILED responses even when the server is configured correctly.
            const exportUrl = `${API_BASE_URL}/timetables/${timetableId}/export?${query.toString()}`;
            const ext = exportFormat === 'word' ? 'docx' : exportFormat === 'pdf' ? 'pdf' : 'xlsx';
            const link = document.createElement('a');
            link.href = exportUrl;
            link.setAttribute('download', `${timetable.name || 'timetable'}_${exportDepartment || 'all'}_${exportLevel || 'all'}.${ext}`);
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setActionNotice({ message: 'Export started — your download should begin shortly.', type: 'success' });
        } catch (error) {
            setActionNotice({ message: error.message || 'Export failed', type: 'error' });
        }
    };

    const departments = Array.from(new Set(scheduled.map(item => item.department).filter(Boolean)));

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-pulse text-slate-500">Loading timetable...</div>
            </div>
        );
    }

    if (!timetable) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl">
                    Error: Timetable not found.
                </div>
            </div>
        );
    }

    const isTimetableEmpty = !scheduled || (scheduled.length === 0 && unscheduled.length === 0);

    return (
        <div className="space-y-6">
            <FloatingNotice
                message={changeNotice}
                type="info"
                actionLabel="Refresh"
                onAction={applyPendingData}
                onDismiss={() => setChangeNotice('')}
                stackIndex={1}
            />
            <FloatingNotice
                message={actionNotice.message}
                type={actionNotice.type}
                onDismiss={() => setActionNotice({ message: '', type: 'info' })}
                stackIndex={0}
            />

            {/* Header Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                        <Link to="/" className="inline-flex items-center text-sm text-slate-500 hover:text-[#4c1d95] mb-2 transition-colors">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                            </svg>
                            Timetables
                        </Link>
                        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">{timetable.name}</h1>
                        <p className="text-slate-500 mt-1">
                            {timetable.academic_session} • {timetable.semester} Semester • 
                            <span className={`ml-1 px-2 py-0.5 rounded text-xs font-medium ${
                                timetable.type === 'Lecture' ? 'bg-emerald-100 text-emerald-700' :
                                timetable.type === 'Exam' ? 'bg-purple-100 text-purple-700' :
                                'bg-amber-100 text-amber-700'
                            }`}>
                                {timetable.type}
                            </span>
                        </p>
                        {lastCheckedAt && (
                            <p className="text-xs text-slate-400 mt-2">
                                Last updated: {lastCheckedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        {/* View tabs */}
                        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode('assign')}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                    viewMode === 'assign'
                                        ? 'bg-white text-[#4c1d95] shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <span className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                    Assign Courses
                                </span>
                            </button>
                            <button
                                onClick={() => { setViewMode('timetable'); fetchTimetable(); }}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                    viewMode === 'timetable'
                                        ? 'bg-white text-[#4c1d95] shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <span className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    View Timetable
                                </span>
                            </button>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 sm:ml-2">
                            <Link
                                to={`/timetable/${timetableId}/courses`}
                                title="Add courses manually, import from the course catalogue, or manage custom fields"
                                className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 shadow-sm bg-[#4c1d95] text-white hover:bg-[#5b21b6] hover:shadow-md"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                                Add Courses
                            </Link>
                            <button
                                onClick={handleGenerate}
                                disabled={poolLoading || assignedCourseIds.size === 0}
                                title={assignedCourseIds.size === 0 ? 'Assign at least one course before generating' : 'Generate the timetable schedule'}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 shadow-sm ${
                                    poolLoading || assignedCourseIds.size === 0
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                        : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-md'
                                }`}
                            >
                                {poolLoading ? (
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                    </svg>
                                ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
                                    </svg>
                                )}
                                Generate
                            </button>
                            {!isTimetableEmpty && (
                                <button
                                    onClick={handleCheckConflicts}
                                    disabled={conflictsLoading}
                                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 shadow-sm bg-orange-500 text-white hover:bg-orange-600 hover:shadow-md disabled:opacity-50"
                                >
                                    {conflictsLoading ? (
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    )}
                                    Conflicts
                                    {conflicts !== null && (
                                        <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${conflicts.length > 0 ? 'bg-red-200 text-red-800' : 'bg-green-200 text-green-800'}`}>
                                            {conflicts.length}
                                        </span>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Conflicts Panel */}
                {showConflicts && conflicts !== null && (
                    <div className={`mt-4 p-4 rounded-xl border ${conflicts.length === 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className={`font-semibold text-sm ${conflicts.length === 0 ? 'text-green-800' : 'text-red-800'}`}>
                                {conflicts.length === 0 ? '✓ No conflicts detected' : `${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''} detected`}
                            </h3>
                            <button onClick={() => setShowConflicts(false)} className="text-slate-400 hover:text-slate-600 text-xs">
                                Dismiss
                            </button>
                        </div>
                        {conflicts.length > 0 && (
                            <ul className="space-y-1 max-h-48 overflow-y-auto">
                                {conflicts.map((c, i) => (
                                    <li key={i} className="flex items-start gap-2 text-xs text-red-700">
                                        <span className="mt-0.5 shrink-0 px-1.5 py-0.5 rounded bg-red-100 font-semibold uppercase">{c.type}</span>
                                        <span>{c.message}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {/* Re-optimising indicator */}
                {reoptimizing && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3 text-sm text-blue-700">
                        <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                        </svg>
                        Re-optimising affected courses…
                    </div>
                )}

                {/* Quality Report Panel */}
                {qualityReport && showReport && (
                    <div className="mt-4 p-4 rounded-xl border bg-slate-50 border-slate-200">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
                                Schedule Quality Report
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                    qualityReport.score.conflicts === 0
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-red-100 text-red-700'
                                }`}>
                                    {qualityReport.score.conflicts === 0 ? 'No conflicts' : `${qualityReport.score.conflicts} conflict${qualityReport.score.conflicts !== 1 ? 's' : ''}`}
                                </span>
                            </h3>
                            <button onClick={() => setShowReport(false)} className="text-slate-400 hover:text-slate-600 text-xs">Dismiss</button>
                        </div>

                        {/* Summary row */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                            {[
                                { label: 'Scheduled',    value: qualityReport.totalScheduled,          color: 'text-emerald-700', bg: 'bg-emerald-50' },
                                { label: 'Unscheduled',  value: qualityReport.totalUnscheduled,         color: 'text-amber-700',   bg: 'bg-amber-50'   },
                                { label: 'Overloaded days', value: qualityReport.score.overloaded,      color: qualityReport.score.overloaded > 0 ? 'text-red-700' : 'text-slate-500', bg: qualityReport.score.overloaded > 0 ? 'bg-red-50' : 'bg-slate-100' },
                                { label: 'Back-to-back', value: qualityReport.score.backToBack,         color: qualityReport.score.backToBack > 0 ? 'text-orange-700' : 'text-slate-500', bg: qualityReport.score.backToBack > 0 ? 'bg-orange-50' : 'bg-slate-100' },
                            ].map(({ label, value, color, bg }) => (
                                <div key={label} className={`${bg} rounded-lg p-3 text-center`}>
                                    <div className={`text-2xl font-bold ${color}`}>{value}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Hard conflicts */}
                        {qualityReport.hardConflicts.length > 0 && (
                            <div className="mb-3">
                                <p className="text-xs font-semibold text-red-700 mb-1">Hard Conflicts</p>
                                <ul className="space-y-1 max-h-32 overflow-y-auto">
                                    {qualityReport.hardConflicts.map((c, i) => (
                                        <li key={i} className="text-xs text-red-600 flex items-center gap-2">
                                            <span className="px-1.5 py-0.5 bg-red-100 rounded font-mono">{c.courseA} ↔ {c.courseB}</span>
                                            <span className="text-slate-500">{c.day} {c.time} — {c.types.join(', ')}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Overloaded days */}
                        {qualityReport.overloadedDays.length > 0 && (
                            <div className="mb-3">
                                <p className="text-xs font-semibold text-orange-700 mb-1">Overloaded Days</p>
                                <ul className="space-y-1 max-h-24 overflow-y-auto">
                                    {qualityReport.overloadedDays.map((d, i) => (
                                        <li key={i} className="text-xs text-orange-600">
                                            {d.department} L{d.level} — {d.day}: {d.hours}h (max {d.maxHours}h)
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Back-to-back */}
                        {qualityReport.backToBack.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-slate-600 mb-1">Back-to-back Sessions</p>
                                <ul className="space-y-1 max-h-24 overflow-y-auto">
                                    {qualityReport.backToBack.map((b, i) => (
                                        <li key={i} className="text-xs text-slate-500">
                                            {b.lecturer} — {b.day}: {b.sessions.map(s => s.code).join(' → ')} ({b.totalHours}h continuous)
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* Show report button if report exists but was dismissed */}
                {qualityReport && !showReport && (
                    <div className="mt-3">
                        <button
                            onClick={() => setShowReport(true)}
                            className="text-xs text-slate-500 hover:text-slate-700 underline"
                        >
                            Show quality report
                        </button>
                    </div>
                )}

                {/* Export Controls — only shown when the timetable has been generated */}
                {!isTimetableEmpty && <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-slate-600">Export:</span>
                    <select 
                        value={exportFormat} 
                        onChange={(e) => setExportFormat(e.target.value)} 
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                    >
                        <option value="excel">Excel (.xlsx)</option>
                        <option value="pdf">PDF Document</option>
                        <option value="word">Word Document</option>
                    </select>
                    <select 
                        value={exportDepartment} 
                        onChange={(e) => setExportDepartment(e.target.value)} 
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                    >
                        <option value="">All Departments</option>
                        {departments.map(dep => <option key={dep} value={dep}>{dep}</option>)}
                    </select>
                    <select 
                        value={exportLevel} 
                        onChange={(e) => setExportLevel(e.target.value)} 
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                    >
                        <option value="">All Levels</option>
                        <option value="100">100 Level</option>
                        <option value="200">200 Level</option>
                        <option value="300">300 Level</option>
                        <option value="400">400 Level</option>
                        <option value="500">500 Level</option>
                    </select>
                    <button 
                        onClick={handleExport} 
                        className="flex items-center gap-2 px-4 py-2 bg-[#059669] text-white rounded-lg hover:bg-[#047857] text-sm font-medium transition-colors shadow-sm"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Export
                    </button>
                </div>}
            </div>

            {
                viewMode === 'assign' ? (
                    <CourseAssignmentPanel
                        timetableId={timetableId}
                        masterCourses={masterCourses}
                        assignedCourseIds={assignedCourseIds}
                        onAssign={handleAssignCourse}
                        onRemove={handleRemoveCourse}
                        onGenerate={handleGenerate}
                        loading={poolLoading}
                        onCourseAdded={fetchPoolData}
                    />
                ) : (
                    <>
                        {isTimetableEmpty ? (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-semibold text-slate-700 mb-2">No Timetable Generated Yet</h3>
                                <p className="text-slate-500 text-sm mb-4">
                                    Click <strong>Assign Courses</strong> to add courses from the pool, then generate your schedule.
                                </p>
                                {unscheduled.length > 0 && (
                                    <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 max-w-md mx-auto">
                                        <h4 className="font-semibold text-red-700 flex items-center gap-2 mb-2">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                            Unscheduled Courses ({unscheduled.length})
                                        </h4>
                                        <ul className="text-left text-sm text-red-600 space-y-1">
                                            {unscheduled.slice(0, 5).map((course, idx) => (
                                                <li key={idx} className="flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                                                    {course.code} - {course.title}
                                                </li>
                                            ))}
                                            {unscheduled.length > 5 && (
                                                <li className="text-red-400 italic">+ {unscheduled.length - 5} more</li>
                                            )}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col lg:flex-row gap-6">
                                {/* Unscheduled Courses Sidebar */}
                                <div className="lg:w-72 flex-shrink-0">
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                        <div className="bg-amber-50 border-b border-amber-100 px-4 py-3 flex justify-between items-center">
                                            <h3 className="font-semibold text-amber-900 flex items-center gap-2">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                Unscheduled ({unscheduled.length})
                                            </h3>
                                            {unscheduled.length > 0 && (
                                                <button
                                                    onClick={handleClearUnscheduled}
                                                    className="text-xs text-amber-700 hover:text-amber-900 hover:underline"
                                                    title="Clear all unscheduled courses"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                        <div
                                            onDragOver={handleDragOver}
                                            onDrop={handleDropToUnscheduled}
                                            className="p-3 space-y-2 min-h-[200px] max-h-[calc(100vh-300px)] overflow-y-auto"
                                        >
                                            {unscheduled.length === 0 ? (
                                                <div className="text-center py-8 text-slate-400 text-sm">
                                                    <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    All courses scheduled!
                                                </div>
                                            ) : (
                                                unscheduled.map((course, index) => (
                                                    <div
                                                        key={course.id || index}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, course, 'unscheduled')}
                                                        className="bg-white border border-amber-200 p-3 rounded-lg cursor-move hover:shadow-md hover:border-amber-300 transition-all group"
                                                    >
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="font-semibold text-slate-800">{course.code}</span>
                                                            {course.is_compulsory && (
                                                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded">
                                                                    COMP
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-slate-600 break-words">{course.title}</div>
                                                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                                                            <span>{course.duration / 60}h</span>
                                                        </div>
                                                        {course.unscheduledReason && (
                                                            <div className="text-[10px] text-amber-600 mt-1 leading-tight" title={course.unscheduledReason}>
                                                                ⚠ {course.unscheduledReason}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                        <p className="text-xs text-slate-500">
                                            <strong>Tip:</strong> Drag and drop courses from here onto the timetable grid to schedule them.
                                        </p>
                                    </div>
                                </div>

                                {/* Timetable Grid */}
                                <div className="flex-1 min-w-0">
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                        <div className="p-4 border-b border-slate-200">
                                            <Legend />
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full border-collapse">
                                                <thead>
                                                    <tr>
                                                        <th className="border-r border-b border-slate-200 p-3 bg-slate-50 text-xs font-semibold text-slate-600 w-24 text-center sticky left-0 z-10">Day</th>
                                                        {TIMES.map(time => (
                                                            <th key={time} className="border-r border-b border-slate-200 p-3 bg-slate-50 text-xs font-semibold text-slate-700 min-w-[120px] text-center">
                                                                {time}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(() => {
                                                        // Pre-compute which (day, timeIndex) cells are consumed
                                                        // by a multi-hour course starting in an earlier column.
                                                        const spannedCells = new Set(); // keys: "day::timeIndex"
                                                        DAYS.forEach(day => {
                                                            TIMES.forEach((time, tIdx) => {
                                                                const slotCourses = scheduled.filter(c => c.day === day && to12Hour(c.time) === time);
                                                                slotCourses.forEach(course => {
                                                                    const colSpan = Math.max(1, Math.round((course.duration || 60) / 60));
                                                                    for (let c = 1; c < colSpan; c++) {
                                                                        if (tIdx + c < TIMES.length) {
                                                                            spannedCells.add(`${day}::${tIdx + c}`);
                                                                        }
                                                                    }
                                                                });
                                                            });
                                                        });

                                                        return DAYS.map(day => (
                                                            <tr key={day}>
                                                                <td className="border-r border-b border-slate-200 p-2 font-semibold text-xs text-slate-700 text-center bg-slate-50 sticky left-0 z-10 whitespace-nowrap">
                                                                    {day}
                                                                </td>
                                                                {TIMES.map((time, tIdx) => {
                                                                    // Skip cells consumed by a colSpan from the left
                                                                    if (spannedCells.has(`${day}::${tIdx}`)) return null;

                                                                    const slotCourses = scheduled.filter(c => c.day === day && to12Hour(c.time) === time);
                                                                    const hasConflict = slotCourses.some(c => c.clash_warning);

                                                                    // colSpan = widest course duration in this slot
                                                                    const maxColSpan = slotCourses.reduce((max, c) => {
                                                                        const span = Math.max(1, Math.round((c.duration || 60) / 60));
                                                                        return Math.max(max, span);
                                                                    }, 1);

                                                                    return (
                                                                        <td
                                                                            key={`${day}-${time}`}
                                                                            colSpan={maxColSpan > 1 ? maxColSpan : undefined}
                                                                            className={`border-r border-b border-slate-200 p-1.5 align-top relative transition-colors h-24 ${
                                                                                hasConflict ? 'bg-red-50/50' : 'hover:bg-slate-50'
                                                                            }`}
                                                                            onDragOver={handleDragOver}
                                                                            onDrop={(e) => handleDrop(e, day, to24Hour(time))}
                                                                        >
                                                                            {slotCourses.length === 0 ? null : (
                                                                                <div className="flex flex-row gap-0 h-full">
                                                                                    {slotCourses.map((course, idx) => {
                                                                                        const styles = courseTypeStyles[course.type] || courseTypeStyles.Lecture;
                                                                                        const hasClash = course.clash_warning;
                                                                                        return (
                                                                                            <React.Fragment key={`${course.code}-${idx}`}>
                                                                                                {/* Vertical dashed divider between concurrent courses */}
                                                                                                {idx > 0 && (
                                                                                                    <div className="border-l-2 border-dashed border-slate-300 mx-1 opacity-70 self-stretch" />
                                                                                                )}
                                                                                                <div
                                                                                                    draggable
                                                                                                    onDragStart={(e) => handleDragStart(e, course, 'scheduled')}
                                                                                                    className={`p-2 rounded-lg text-xs border-t-4 cursor-move relative group shadow-sm transition-all flex-1 ${
                                                                                                        hasClash
                                                                                                            ? 'bg-red-50 border-red-400 hover:bg-red-100'
                                                                                                            : `${styles.bg} ${styles.border} ${styles.hover}`
                                                                                                    }`}
                                                                                                    title={`${course.title}\nLecturer: ${course.lecturers}\nVenue: ${course.venue}`}
                                                                                                >
                                                                                                    {/* Clash Warning Badge */}
                                                                                                    {hasClash && (
                                                                                                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm animate-pulse">
                                                                                                            !
                                                                                                        </div>
                                                                                                    )}

                                                                                                    {/* Duration badge */}
                                                                                                    {course.duration > 60 && (
                                                                                                        <div className={`absolute bottom-1 right-1 px-1 py-0.5 text-[9px] font-bold rounded ${hasClash ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'}`}>
                                                                                                            {course.duration / 60}h
                                                                                                        </div>
                                                                                                    )}

                                                                                                    <div className="flex items-start justify-between gap-1 mb-1">
                                                                                                        <span className={`font-bold leading-tight ${hasClash ? 'text-red-900' : styles.text}`}>
                                                                                                            {course.code}
                                                                                                        </span>
                                                                                                        {course.is_compulsory && (
                                                                                                            <span className="px-1 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-bold rounded flex-shrink-0">
                                                                                                                COMP
                                                                                                            </span>
                                                                                                        )}
                                                                                                    </div>

                                                                                                    <div className={`text-[10px] mt-1 flex items-center gap-1 ${hasClash ? 'text-red-600' : 'text-slate-500'}`}>
                                                                                                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                                                        </svg>
                                                                                                        <span className="truncate">{course.venue || 'Unassigned'}</span>
                                                                                                    </div>

                                                                                                    {/* Remove Button */}
                                                                                                    <button
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            const newScheduled = scheduled.filter(c => c !== course);
                                                                                                            const newUnscheduled = [...unscheduled, course];
                                                                                                            setScheduled(newScheduled);
                                                                                                            setUnscheduled(newUnscheduled);
                                                                                                            isDirtyRef.current = true;
                                                                                                            fetch(`${API_BASE_URL}/timetables/${timetableId}/save`, {
                                                                                                                method: 'POST',
                                                                                                                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                                                                                                                body: JSON.stringify({ scheduled: newScheduled, unscheduled: newUnscheduled })
                                                                                                            }).then(() => {
                                                                                                                isDirtyRef.current = false;
                                                                                                                pendingDataRef.current = null;
                                                                                                            });
                                                                                                        }}
                                                                                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-600"
                                                                                                        title="Remove from slot"
                                                                                                    >
                                                                                                        ×
                                                                                                    </button>
                                                                                                </div>
                                                                                            </React.Fragment>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        ));
                                                    })()}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )
            }
        </div>
    );
};

const emptyNewCourse = {
    code: '', title: '', department: '', level: '', units: '', semester: 'First',
    type: 'Lecture', duration: 1, is_compulsory: false, preferred_day: 'AUTO',
    preferred_time: 'AUTO', venue: '', lecturers: []
};

// Course Assignment Panel Component
const CourseAssignmentPanel = ({ timetableId, masterCourses, assignedCourseIds, onAssign, onRemove, loading, onCourseAdded }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDept, setFilterDept] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [newCourse, setNewCourse] = useState(emptyNewCourse);
    const [addLoading, setAddLoading] = useState(false);
    const [options, setOptions] = useState({ departments: [], venues: [], lecturers: [] });
    const [assignAfterAdd, setAssignAfterAdd] = useState(true);

    useEffect(() => {
        if (!showAddForm || options.departments.length > 0) return;
        fetch(`${API_BASE_URL}/options`)
            .then(r => r.json())
            .then(d => setOptions(d.data || { departments: [], venues: [], lecturers: [] }))
            .catch(() => {});
    }, [showAddForm]);

    const handleAddToCourse = async (e) => {
        e.preventDefault();
        if (!newCourse.code || !newCourse.title || !newCourse.department || !newCourse.level) return;
        setAddLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/courses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify({
                    ...newCourse,
                    level: parseInt(newCourse.level),
                    units: parseInt(newCourse.units) || null,
                    duration: parseFloat(newCourse.duration),
                    // no timetable_id → goes to master pool
                })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Failed');
            const created = await res.json();

            if (assignAfterAdd && created.id) {
                await fetch(`${API_BASE_URL}/timetables/${timetableId}/courses`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                    body: JSON.stringify({ course_id: created.id })
                });
            }

            setNewCourse(emptyNewCourse);
            setShowAddForm(false);
            onCourseAdded();
        } catch (err) {
            alert(err.message);
        } finally {
            setAddLoading(false);
        }
    };

    const departments = [...new Set(masterCourses.map(c => c.department))].sort();

    const filteredMasterCourses = masterCourses.filter(course => {
        const matchesSearch = !searchTerm ||
            course.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            course.title?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDept = !filterDept || course.department === filterDept;
        return matchesSearch && matchesDept;
    });

    const availableCourses = filteredMasterCourses.filter(c => !assignedCourseIds.has(c.id));
    const assignedCourses = filteredMasterCourses.filter(c => assignedCourseIds.has(c.id));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-800">Assign Courses from Pool</h2>
                        <p className="text-slate-500 text-sm mt-1">
                            Add courses from the master pool to this timetable, then generate the schedule.
                        </p>
                    </div>
                    <button
                        onClick={() => setShowAddForm(v => !v)}
                        className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            showAddForm ? 'bg-slate-200 text-slate-700' : 'bg-[#4c1d95] text-white hover:bg-[#3b0764]'
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={showAddForm ? 'M6 18L18 6M6 6l12 12' : 'M12 4v16m8-8H4'} />
                        </svg>
                        {showAddForm ? 'Cancel' : 'Add to Pool'}
                    </button>
                </div>

                {/* Quick-add form */}
                {showAddForm && (
                    <form onSubmit={handleAddToCourse} className="mt-6 pt-6 border-t border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">New Course — adds to pool{assignAfterAdd ? ' and assigns here' : ''}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Code *</label>
                                <input required value={newCourse.code} onChange={e => setNewCourse(p => ({ ...p, code: e.target.value }))}
                                    placeholder="e.g. CSC 101"
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent" />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-medium text-slate-600 mb-1">Title *</label>
                                <input required value={newCourse.title} onChange={e => setNewCourse(p => ({ ...p, title: e.target.value }))}
                                    placeholder="e.g. Introduction to Computer Science"
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Department *</label>
                                <select required value={newCourse.department} onChange={e => setNewCourse(p => ({ ...p, department: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent">
                                    <option value="">Select…</option>
                                    {options.departments.map(d => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Level *</label>
                                <select required value={newCourse.level} onChange={e => setNewCourse(p => ({ ...p, level: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent">
                                    <option value="">Select…</option>
                                    {['100','200','300','400','500'].map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Units</label>
                                <input type="number" value={newCourse.units} onChange={e => setNewCourse(p => ({ ...p, units: e.target.value }))}
                                    placeholder="e.g. 3"
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Semester</label>
                                <select value={newCourse.semester} onChange={e => setNewCourse(p => ({ ...p, semester: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent">
                                    <option value="First">First</option>
                                    <option value="Second">Second</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                                <select value={newCourse.type} onChange={e => setNewCourse(p => ({ ...p, type: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent">
                                    <option value="Lecture">Lecture</option>
                                    <option value="Exam">Exam</option>
                                    <option value="Test">Test</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Duration (hours)</label>
                                <input type="number" step="0.5" min="0.5" value={newCourse.duration} onChange={e => setNewCourse(p => ({ ...p, duration: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Venue (optional)</label>
                                <select value={newCourse.venue} onChange={e => setNewCourse(p => ({ ...p, venue: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent">
                                    <option value="">Unassigned</option>
                                    {options.venues.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                                <input type="checkbox" checked={assignAfterAdd} onChange={e => setAssignAfterAdd(e.target.checked)}
                                    className="w-4 h-4 text-[#4c1d95] border-slate-300 rounded" />
                                Also assign to this timetable immediately
                            </label>
                            <button type="submit" disabled={addLoading}
                                className="ml-auto px-5 py-2 bg-[#4c1d95] text-white rounded-lg text-sm font-medium hover:bg-[#3b0764] transition-colors disabled:opacity-50">
                                {addLoading ? 'Adding…' : 'Add Course'}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by code or title..."
                        className="px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent"
                    />
                    <select
                        value={filterDept}
                        onChange={(e) => setFilterDept(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent"
                    >
                        <option value="">All Departments</option>
                        {departments.map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Available Courses */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200">
                        <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                            Available from Pool
                            <span className="text-sm font-normal text-slate-500">({availableCourses.length})</span>
                        </h3>
                    </div>
                    <div className="p-4 max-h-[500px] overflow-y-auto space-y-2">
                        {loading ? (
                            <div className="text-center py-8 text-slate-400">
                                <svg className="animate-spin h-6 w-6 mx-auto mb-2" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                </svg>
                                Loading...
                            </div>
                        ) : availableCourses.length === 0 ? (
                            <div className="text-center py-8 text-slate-400">
                                <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                                <p>All courses assigned!</p>
                                <p className="text-xs mt-1">Add more courses to the pool from Admin Setup</p>
                            </div>
                        ) : (
                            availableCourses.map(course => (
                                <div key={course.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-emerald-300 transition-colors">
                                    <div className="min-w-0 flex-1 pr-3">
                                        <div className="flex flex-col items-start gap-1 mb-1.5">
                                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[11px] font-bold rounded">
                                                {course.code}
                                            </span>
                                            <span className="text-sm font-medium text-slate-800 whitespace-normal break-words leading-snug">
                                                {course.title}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                            <span className="px-1.5 py-0.5 bg-slate-200 rounded">{course.department}</span>
                                            <span>Level {course.level}</span>
                                            <span>{course.duration / 60}h</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onAssign(course.id)}
                                        className="flex-shrink-0 ml-2 p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                        title="Assign to timetable"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                                        </svg>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Assigned Courses */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div className="p-4 bg-emerald-50 border-b border-emerald-200">
                        <h3 className="font-semibold text-emerald-800 flex items-center gap-2">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                            Assigned to This Timetable
                            <span className="text-sm font-normal text-emerald-600">({assignedCourses.length})</span>
                        </h3>
                    </div>
                    <div className="p-4 max-h-[500px] overflow-y-auto space-y-2 flex-1">
                        {assignedCourses.length === 0 ? (
                            <div className="text-center py-8 text-slate-400">
                                <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                </svg>
                                <p>No courses assigned yet</p>
                                <p className="text-xs mt-1">Select courses from the left to add them</p>
                            </div>
                        ) : (
                            assignedCourses.map(course => (
                                <div key={course.id} className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                                    <div className="min-w-0 flex-1 pr-3">
                                        <div className="flex flex-col items-start gap-1 mb-1.5">
                                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded">
                                                {course.code}
                                            </span>
                                            <span className="text-sm font-medium text-slate-800 whitespace-normal break-words leading-snug">
                                                {course.title}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                            <span className="px-1.5 py-0.5 bg-emerald-200 rounded">{course.department}</span>
                                            <span>Level {course.level}</span>
                                            <span>{course.duration / 60}h</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onRemove(course.id)}
                                        className="flex-shrink-0 ml-2 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Remove from timetable"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                                        </svg>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TimetableView;
