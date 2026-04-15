import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import API_BASE_URL from '../apiBase';

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
                <div className="flex items-center justify-center min-h-[50vh]">
                    <div className="text-center text-gray-500">Checking portal session...</div>
                </div>
            );
        }

        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
                <div className="bg-white p-10 rounded-2xl shadow-lg w-full max-w-md text-center">
                    {/* MTU crest / icon */}
                    <div className="flex justify-center mb-6">
                        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                            <svg className="w-8 h-8 text-blue-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422A12.083 12.083 0 0121 21H3a12.083 12.083 0 012.84-10.422L12 14z" />
                            </svg>
                        </div>
                    </div>

                    <h2 className="text-2xl font-bold text-blue-900 mb-2">MTU Student Timetable</h2>
                    <p className="text-gray-500 text-sm mb-6">
                        Your personalised timetable is accessed securely through the MTU Student Portal.
                    </p>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="text-blue-700 font-medium animate-pulse">Loading your timetable...</div>
                    ) : (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                            <p className="font-semibold mb-1">How to access your timetable</p>
                            <p>Log in to the <strong>MTU Student Portal</strong> and click <strong>"View My Timetable"</strong>. You will be redirected here automatically.</p>
                        </div>
                    )}

                    <div className="mt-6">
                        <Link to="/" className="text-sm text-gray-400 hover:text-gray-600 underline">Back to Main Menu</Link>
                    </div>
                </div>
            </div>
        );
    }

    if (loading || !timetable) {
        return <div className="p-6 text-center">Loading student data...</div>;
    }

    const { scheduled } = timetable.data;

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6 bg-white p-4 rounded shadow">
                <div>
                    <h2 className="text-2xl font-bold text-blue-900">Welcome, {student.name}</h2>
                    <p className="text-gray-600">{student.department} - {student.level}L</p>
                </div>
                <button onClick={handleLogout} className="text-red-600 hover:text-red-800 border border-red-200 px-3 py-1 rounded">
                    Logout
                </button>
            </div>

            <div className="bg-white p-4 rounded shadow overflow-x-auto">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">My Personal Timetable</h3>
                    
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-700">Download:</span>
                        <select 
                            value={exportFormat} 
                            onChange={(e) => setExportFormat(e.target.value)} 
                            className="border p-2 rounded text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={exportLoading}
                        >
                            <option value="excel">Excel</option>
                            <option value="pdf">PDF</option>
                            <option value="word">Word</option>
                        </select>
                        <button 
                            onClick={handleExport} 
                            className="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
                            disabled={exportLoading}
                        >
                            {exportLoading ? 'Exporting...' : 'Export'}
                        </button>
                    </div>
                </div>
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
                                    const slotCourses = scheduled.filter(c => c.day === day && to12Hour(c.time) === time);
                                    return (
                                        <td key={`${day}-${time}`} className="border border-gray-300 p-1 h-24 align-top">
                                            {slotCourses.map((course, idx) => (
                                                <div
                                                    key={`${course.code}-${idx}`}
                                                    className={`p-2 rounded text-sm mb-1 border-l-4 shadow-sm ${course.clash_warning
                                                        ? 'bg-red-100 border-red-500' // Clash Warning
                                                        : course.is_carryover
                                                            ? 'bg-yellow-100 border-yellow-500' // Carryover
                                                            : 'bg-green-100 border-green-500' // Regular
                                                        }`}
                                                >
                                                    <div className="font-bold flex justify-between gap-1">
                                                        <span>{course.code}</span>
                                                        <div className="flex items-center gap-1">
                                                            {course.is_compulsory && <span className="text-[10px] bg-blue-200 px-1 rounded text-blue-800">COMP</span>}
                                                            {course.is_carryover && <span className="text-[10px] bg-yellow-200 px-1 rounded text-yellow-800">CO</span>}
                                                            {course.clash_warning && <span className="text-[10px] bg-red-200 px-1 rounded text-red-800">CLASH</span>}
                                                        </div>
                                                    </div>
                                                    <div className="text-xs">{course.title}</div>
                                                    <div className="text-xs mt-1 font-semibold text-gray-700">📍 {course.venue}</div>
                                                </div>
                                            ))}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="mt-4 flex gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-100 border border-green-500"></div> Regular Course</div>
                    <div className="flex items-center gap-1"><span className="text-[10px] bg-blue-200 px-1 rounded text-blue-800">COMP</span> Compulsory</div>
                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-yellow-100 border border-yellow-500"></div> Carryover Course</div>
                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-100 border border-red-500"></div> Clash Detected</div>
                </div>
            </div>
        </div>
    );
};

export default StudentPortal;
