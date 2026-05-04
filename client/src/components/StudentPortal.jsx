import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import API_BASE_URL from '../apiBase';
import mtuLogo from "../../../mtulogo.jpg";

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TIMES = ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'];

// Convert stored 24-hour time to 12-hour AM/PM for display
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

// Course type color schemes
const courseTypeStyles = {
    Lecture: {
        bg: 'bg-emerald-50',
        border: 'border-emerald-400',
        text: 'text-emerald-900'
    },
    Exam: {
        bg: 'bg-purple-50',
        border: 'border-purple-400',
        text: 'text-purple-900'
    },
    Test: {
        bg: 'bg-amber-50',
        border: 'border-amber-400',
        text: 'text-amber-900'
    }
};

const StudentPortal = () => {
    const apiBaseUrl = API_BASE_URL;
    const [matricNumber, setMatricNumber] = useState('');
    const [student, setStudent] = useState(null);
    const [timetable, setTimetable] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sessionToken, setSessionToken] = useState('');
    const [exportFormat, setExportFormat] = useState('pdf');
    const [exportLoading, setExportLoading] = useState(false);
    const [portalRedirectAttempted, setPortalRedirectAttempted] = useState(false);

    const clearPortalQueryParams = () => {
        const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
        window.history.replaceState({}, document.title, cleanUrl);
    };

    const exchangePortalCode = async (portalCode) => {
        const exchangeRes = await fetch(`${apiBaseUrl}/student/portal/exchange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ portal_code: portalCode })
        });

        const contentType = exchangeRes.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Failed to establish portal session');
        }

        const exchangeData = await exchangeRes.json();
        if (!exchangeRes.ok) {
            throw new Error(exchangeData.error || 'Portal code exchange failed');
        }

        const matric = exchangeData?.data?.matric_number;
        const token = exchangeData?.data?.token;

        if (!matric || !token) {
            throw new Error('Portal session exchange returned incomplete response');
        }

        return { matric, token };
    };

    const loadPortalSession = async (matric, token) => {
        setLoading(true);
        setError('');
        setSessionToken(token);

        try {
            const timetableRes = await fetch(`${apiBaseUrl}/student/${encodeURIComponent(matric)}/timetable`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            const contentType = timetableRes.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Failed to fetch portal session data');
            }

            const timetableData = await timetableRes.json();
            if (!timetableRes.ok) {
                throw new Error(timetableData.error || 'Failed to fetch timetable');
            }

            setMatricNumber(matric);
            setStudent(timetableData.student);
            setTimetable(timetableData.timetable);
        } catch (err) {
            setError(err.message);
            setStudent(null);
            setTimetable(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const matricFromPortal = params.get('matric');
        const tokenFromPortal = params.get('mtu_token');
        const portalCode = params.get('portal_code');

        if (portalCode) {
            exchangePortalCode(portalCode)
                .then(({ matric, token }) => {
                    clearPortalQueryParams();
                    return loadPortalSession(matric, token);
                })
                .catch((err) => {
                    setError(err.message);
                    setStudent(null);
                    setTimetable(null);
                });
            return;
        }

        if (matricFromPortal && tokenFromPortal) {
            clearPortalQueryParams();
            loadPortalSession(matricFromPortal, tokenFromPortal);
            return;
        }

        // No portal redirect parameters — mark that we've checked
        setPortalRedirectAttempted(true);
    }, [apiBaseUrl]);



    const handleLogout = () => {
        setStudent(null);
        setTimetable(null);
        setMatricNumber('');
        setSessionToken('');
    };

    const handleExport = async () => {
        if (!matricNumber) return;
        setExportLoading(true);
        try {
            const response = await fetch(`${apiBaseUrl}/student/${encodeURIComponent(matricNumber)}/timetable/export?format=${exportFormat}`, {
                headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Export failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            const ext = exportFormat === 'word' ? 'docx' : exportFormat === 'pdf' ? 'pdf' : 'xlsx';
            link.href = url;
            const safeMatric = matricNumber.replace(/[\/\\]/g, '_');
            link.download = `Timetable_${safeMatric}.${ext}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export error:', err);
            alert(err.message);
        } finally {
            setExportLoading(false);
        }
    };

    if (!student) {
        // Still waiting for the useEffect portal-redirect check to complete
        if (!portalRedirectAttempted && !error) {
            return (
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="text-center">
                        <div className="w-12 h-12 border-4 border-purple-200 border-t-[#4c1d95] rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-slate-500">Connecting to MTU Portal...</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
                <div className="bg-white p-8 md:p-12 rounded-2xl shadow-xl w-full max-w-md text-center border border-slate-100">
                    {/* MTU Logo */}
                    <div className="flex justify-center mb-6">
                        <div className="w-20 h-20 rounded-full bg-white shadow-lg p-2 border-2 border-slate-100">
                            <img src={mtuLogo} alt="MTU Logo" className="w-full h-full object-contain rounded-full" />
                        </div>
                    </div>

                    <h1 className="text-2xl font-bold text-slate-900 mb-2">MTU Timetable</h1>
                    <p className="text-slate-500 text-sm mb-6">
                        Access your personalized class schedule securely through the MTU Student Portal.
                    </p>

                    {error && (
                        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 text-sm rounded-r-lg px-4 py-3 mb-5 text-left">
                            <div className="flex items-start gap-2">
                                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>{error}</span>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center gap-2 text-[#4c1d95] font-medium">
                            <div className="w-4 h-4 border-2 border-purple-200 border-t-[#4c1d95] rounded-full animate-spin"></div>
                            Loading your timetable...
                        </div>
                    ) : (
                        <div className="bg-purple-50 border border-purple-100 rounded-xl p-5 text-sm">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-[#4c1d95] rounded-lg flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div className="text-left">
                                    <p className="font-semibold text-slate-800">How to Access</p>
                                    <p className="text-slate-500">Two simple steps</p>
                                </div>
                            </div>
                            <ol className="text-left text-slate-600 space-y-2 ml-2">
                                <li className="flex items-start gap-2">
                                    <span className="w-5 h-5 bg-[#4c1d95] text-white rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                                    <span>Log in to the <strong>MTU Student Portal</strong></span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-5 h-5 bg-[#4c1d95] text-white rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                                    <span>Click <strong>"View My Timetable"</strong> to access your schedule</span>
                                </li>
                            </ol>
                        </div>
                    )}

                    <div className="mt-6 pt-6 border-t border-slate-100">
                        <Link to="/" className="text-sm text-slate-400 hover:text-[#4c1d95] transition-colors inline-flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back to Main Menu
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (loading || !timetable) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-purple-200 border-t-[#4c1d95] rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-500">Loading your timetable...</p>
                </div>
            </div>
        );
    }

    const { scheduled } = timetable.data;

    return (
        <div className="space-y-6">
            {/* Student Header Card */}
            <div className="bg-gradient-to-r from-[#4c1d95] to-[#6d28d9] rounded-xl shadow-lg p-6 text-white">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center border-2 border-white/30">
                            <span className="text-2xl font-bold">{student.name?.charAt(0) || 'S'}</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">Welcome, {student.name}</h1>
                            <p className="text-purple-200 text-sm flex items-center gap-2 flex-wrap">
                                <span className="bg-white/20 px-2 py-0.5 rounded text-xs">{student.department}</span>
                                <span>•</span>
                                <span className="bg-emerald-500/30 px-2 py-0.5 rounded text-xs">{student.level} Level</span>
                                <span>•</span>
                                <span className="text-purple-200/80">{student.matric_number}</span>
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={handleLogout} 
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/20 text-sm font-medium"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Logout
                    </button>
                </div>
            </div>

            {/* Timetable Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Header with Branded Export */}
                <div className="p-6 border-b border-slate-200 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">My Personal Timetable</h2>
                        <p className="text-slate-500 text-sm mt-1">
                            {timetable.name} • {timetable.academic_session}
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-500 hidden sm:inline">Export your schedule:</span>
                        <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                            <select 
                                value={exportFormat} 
                                onChange={(e) => setExportFormat(e.target.value)} 
                                className="px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent"
                                disabled={exportLoading}
                            >
                                <option value="pdf">PDF Document</option>
                                <option value="excel">Excel Spreadsheet</option>
                                <option value="word">Word Document</option>
                            </select>
                            <button 
                                onClick={handleExport} 
                                disabled={exportLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-[#059669] hover:bg-[#047857] text-white rounded-md text-sm font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {exportLoading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Exporting...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                        Download
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Timetable Grid */}
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr>
                                <th className="border-r border-b border-slate-200 p-3 bg-slate-50 text-xs font-semibold text-slate-600 w-20 text-center sticky left-0 z-10">Time</th>
                                {DAYS.map(day => (
                                    <th key={day} className="border-r border-b border-slate-200 p-3 bg-slate-50 text-sm font-semibold text-slate-700 min-w-[140px]">
                                        {day}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {TIMES.map(time => (
                                <tr key={time}>
                                    <td className="border-r border-b border-slate-200 p-2 font-semibold text-xs text-slate-600 text-center bg-slate-50 sticky left-0 z-10">
                                        {time}
                                    </td>
                                    {DAYS.map(day => {
                                        const slotCourses = scheduled.filter(c => c.day === day && to12Hour(c.time) === time);
                                        return (
                                            <td key={`${day}-${time}`} className="border-r border-b border-slate-200 p-2 h-28 align-top">
                                                {slotCourses.map((course, idx) => {
                                                    const styles = courseTypeStyles[course.type] || courseTypeStyles.Lecture;
                                                    const hasClash = course.clash_warning;
                                                    const isCarryover = course.is_carryover;
                                                    
                                                    return (
                                                        <div
                                                            key={`${course.code}-${idx}`}
                                                            className={`p-3 rounded-lg text-xs mb-2 border-l-4 shadow-sm relative ${
                                                                hasClash 
                                                                    ? 'bg-red-50 border-red-500' 
                                                                    : isCarryover
                                                                        ? 'bg-amber-50 border-amber-400'
                                                                        : `${styles.bg} ${styles.border}`
                                                            }`}
                                                        >
                                                            {/* Warning Badge */}
                                                            {hasClash && (
                                                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold animate-pulse" title="Schedule Conflict!">
                                                                    !
                                                                </div>
                                                            )}
                                                            
                                                            <div className="flex items-center justify-between gap-1 mb-1">
                                                                <span className={`font-bold ${hasClash ? 'text-red-900' : isCarryover ? 'text-amber-900' : styles.text}`}>
                                                                    {course.code}
                                                                </span>
                                                                <div className="flex items-center gap-1">
                                                                    {course.is_compulsory && (
                                                                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-bold rounded">
                                                                            COMP
                                                                        </span>
                                                                    )}
                                                                    {isCarryover && (
                                                                        <span className="px-1.5 py-0.5 bg-amber-200 text-amber-800 text-[9px] font-bold rounded">
                                                                            CO
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            
                                                            <div className={`text-[11px] line-clamp-2 ${hasClash ? 'text-red-700' : 'text-slate-600'}`}>
                                                                {course.title}
                                                            </div>
                                                            
                                                            <div className={`text-[10px] mt-1.5 flex items-center gap-1 ${hasClash ? 'text-red-600' : 'text-slate-500'}`}>
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                </svg>
                                                                {course.venue || 'TBA'}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Legend */}
                <div className="p-4 bg-slate-50 border-t border-slate-200">
                    <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-emerald-50 border-2 border-emerald-400"></div>
                            <span className="text-slate-600">Lecture</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-purple-50 border-2 border-purple-400"></div>
                            <span className="text-slate-600">Exam</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-amber-50 border-2 border-amber-400"></div>
                            <span className="text-slate-600">Test</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded">COMP</span>
                            <span className="text-slate-600">Compulsory</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 bg-amber-200 text-amber-800 text-xs font-bold rounded">CO</span>
                            <span className="text-slate-600">Carryover</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-4 h-4 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">!</span>
                            <span className="text-slate-600">Schedule Conflict</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentPortal;
