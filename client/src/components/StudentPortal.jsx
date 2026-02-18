import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import API_BASE_URL from '../apiBase';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TIMES = ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

const StudentPortal = () => {
    const apiBaseUrl = API_BASE_URL;
    const [matricNumber, setMatricNumber] = useState('');
    const [student, setStudent] = useState(null);
    const [timetable, setTimetable] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

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
        }
    }, [apiBaseUrl]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // 1. Verify Login
            const loginRes = await fetch(`${apiBaseUrl}/student/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ matric_number: matricNumber })
            });

            const contentType = loginRes.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await loginRes.text();
                console.error("Non-JSON response:", text);
                throw new Error("Server returned an invalid response (not JSON). Please check if the backend is running.");
            }

            const loginData = await loginRes.json();

            if (!loginRes.ok) {
                throw new Error(loginData.error || 'Login failed');
            }

            setStudent(loginData.data);

            // 2. Fetch Timetable
            const timetableRes = await fetch(`${apiBaseUrl}/student/${encodeURIComponent(matricNumber)}/timetable`);

            const ttContentType = timetableRes.headers.get("content-type");
            if (!ttContentType || !ttContentType.includes("application/json")) {
                console.error("Non-JSON response for timetable");
                throw new Error("Failed to fetch timetable: Server returned invalid response.");
            }

            const timetableData = await timetableRes.json();

            if (!timetableRes.ok) {
                throw new Error(timetableData.error || 'Failed to fetch timetable');
            }

            setTimetable(timetableData.timetable);
        } catch (err) {
            console.error(err);
            setError(err.message);
            setStudent(null);
            setTimetable(null);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        setStudent(null);
        setTimetable(null);
        setMatricNumber('');
    };

    if (!student) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh]">
                <div className="bg-white p-8 rounded shadow-md w-full max-w-md">
                    <h2 className="text-2xl font-bold mb-6 text-center text-blue-900">Student Portal Login</h2>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-gray-700 mb-2">Matric Number</label>
                            <input
                                type="text"
                                value={matricNumber}
                                onChange={(e) => setMatricNumber(e.target.value)}
                                className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g. MTU/2023/001"
                                required
                            />
                        </div>
                        {error && <div className="text-red-500 text-sm">{error}</div>}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:bg-blue-300"
                        >
                            {loading ? 'Verifying...' : 'View Timetable'}
                        </button>
                    </form>
                    <div className="mt-4 text-center">
                        <Link to="/" className="text-sm text-gray-500 hover:underline">Back to Main Menu</Link>
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
                <h3 className="text-xl font-bold mb-4 text-gray-800">My Personal Timetable</h3>
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
                                    const slotCourses = scheduled.filter(c => c.day === day && c.time === time);
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
