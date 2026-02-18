import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import API_BASE_URL from '../apiBase';
import FloatingNotice from './FloatingNotice';
import getNoticeTimeoutMs from '../noticeTimeout';

const emptyForms = {
    college: { code: '', name: '' },
    department: { code: '', name: '', college_code: '' },
    lecturer: { name: '', department_code: '', email: '' },
    venue: { name: '', college_code: '', capacity: '' }
};

const AdminManager = () => {
    const [colleges, setColleges] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [lecturers, setLecturers] = useState([]);
    const [venues, setVenues] = useState([]);
    const [rules, setRules] = useState([]);
    const [forms, setForms] = useState(emptyForms);
    const [notice, setNotice] = useState({ message: '', type: 'info' });

    const fetchAll = async () => {
        const [cRes, dRes, lRes, vRes, rRes] = await Promise.all([
            fetch(`${API_BASE_URL}/admin/colleges`),
            fetch(`${API_BASE_URL}/admin/departments`),
            fetch(`${API_BASE_URL}/admin/lecturers`),
            fetch(`${API_BASE_URL}/admin/venues`),
            fetch(`${API_BASE_URL}/admin/rules`)
        ]);

        const [cData, dData, lData, vData, rData] = await Promise.all([
            cRes.json(), dRes.json(), lRes.json(), vRes.json(), rRes.json()
        ]);

        setColleges(cData.data || []);
        setDepartments(dData.data || []);
        setLecturers(lData.data || []);
        setVenues(vData.data || []);
        setRules(rData.data || []);
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
        const response = await fetch(`${API_BASE_URL}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        const response = await fetch(`${API_BASE_URL}${path}`, { method: 'DELETE' });
        if (!response.ok) {
            const error = await response.json();
            setNotice({ message: error.error || 'Delete failed', type: 'error' });
            return;
        }
        setNotice({ message: 'Deleted successfully.', type: 'success' });
        fetchAll();
    };

    const updateRule = async (rule) => {
        const response = await fetch(`${API_BASE_URL}/admin/rules/${rule.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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

    return (
        <div className="p-6 space-y-8">
            <FloatingNotice
                message={notice.message}
                type={notice.type}
                onDismiss={() => setNotice({ message: '', type: 'info' })}
            />
            <div>
                <Link to="/" className="text-blue-600 hover:underline">&larr; Back to Timetables</Link>
                <h2 className="text-2xl font-bold text-blue-900 mt-2">Admin Data Management</h2>
                <p className="text-sm text-gray-600">Manage colleges, departments, lecturers, venues, and scheduling rules.</p>
            </div>

            <section className="bg-white p-4 rounded shadow space-y-3">
                <h3 className="text-lg font-bold">Colleges</h3>
                <div className="grid md:grid-cols-3 gap-2">
                    <input className="border p-2 rounded" placeholder="Code (e.g. CBAS)" value={forms.college.code} onChange={(e) => updateForm('college', 'code', e.target.value)} />
                    <input className="border p-2 rounded" placeholder="College Name" value={forms.college.name} onChange={(e) => updateForm('college', 'name', e.target.value)} />
                    <button className="bg-blue-600 text-white rounded px-3" onClick={() => postEntity('/admin/colleges', forms.college, 'college')}>Add College</button>
                </div>
                <div className="space-y-2">
                    {colleges.map(c => (
                        <div key={c.id} className="flex justify-between items-center border p-2 rounded">
                            <span>{c.code} - {c.name}</span>
                            <button className="text-red-600" onClick={() => deleteEntity(`/admin/colleges/${c.id}`)}>Delete</button>
                        </div>
                    ))}
                </div>
            </section>

            <section className="bg-white p-4 rounded shadow space-y-3">
                <h3 className="text-lg font-bold">Departments</h3>
                <div className="grid md:grid-cols-4 gap-2">
                    <input className="border p-2 rounded" placeholder="Code (e.g. CSC)" value={forms.department.code} onChange={(e) => updateForm('department', 'code', e.target.value)} />
                    <input className="border p-2 rounded" placeholder="Department Name" value={forms.department.name} onChange={(e) => updateForm('department', 'name', e.target.value)} />
                    <select className="border p-2 rounded" value={forms.department.college_code} onChange={(e) => updateForm('department', 'college_code', e.target.value)}>
                        <option value="">Select College</option>
                        {colleges.map(c => <option key={c.id} value={c.code}>{c.code}</option>)}
                    </select>
                    <button className="bg-blue-600 text-white rounded px-3" onClick={() => postEntity('/admin/departments', forms.department, 'department')}>Add Department</button>
                </div>
                <div className="space-y-2">
                    {departments.map(d => (
                        <div key={d.id} className="flex justify-between items-center border p-2 rounded">
                            <span>{d.code} - {d.name} ({d.college_code})</span>
                            <button className="text-red-600" onClick={() => deleteEntity(`/admin/departments/${d.id}`)}>Delete</button>
                        </div>
                    ))}
                </div>
            </section>

            <section className="bg-white p-4 rounded shadow space-y-3">
                <h3 className="text-lg font-bold">Lecturers</h3>
                <div className="grid md:grid-cols-4 gap-2">
                    <input className="border p-2 rounded" placeholder="Name" value={forms.lecturer.name} onChange={(e) => updateForm('lecturer', 'name', e.target.value)} />
                    <select className="border p-2 rounded" value={forms.lecturer.department_code} onChange={(e) => updateForm('lecturer', 'department_code', e.target.value)}>
                        <option value="">Department</option>
                        {departments.map(d => <option key={d.id} value={d.code}>{d.name}</option>)}
                    </select>
                    <input className="border p-2 rounded" placeholder="Email" value={forms.lecturer.email} onChange={(e) => updateForm('lecturer', 'email', e.target.value)} />
                    <button className="bg-blue-600 text-white rounded px-3" onClick={() => postEntity('/admin/lecturers', forms.lecturer, 'lecturer')}>Add Lecturer</button>
                </div>
                <div className="space-y-2">
                    {lecturers.map(l => (
                        <div key={l.id} className="flex justify-between items-center border p-2 rounded">
                            <span>{l.name} {l.department_code ? `(${l.department_code})` : ''}</span>
                            <button className="text-red-600" onClick={() => deleteEntity(`/admin/lecturers/${l.id}`)}>Delete</button>
                        </div>
                    ))}
                </div>
            </section>

            <section className="bg-white p-4 rounded shadow space-y-3">
                <h3 className="text-lg font-bold">Venues</h3>
                <div className="grid md:grid-cols-4 gap-2">
                    <input className="border p-2 rounded" placeholder="Venue Name" value={forms.venue.name} onChange={(e) => updateForm('venue', 'name', e.target.value)} />
                    <select className="border p-2 rounded" value={forms.venue.college_code} onChange={(e) => updateForm('venue', 'college_code', e.target.value)}>
                        <option value="">College</option>
                        {colleges.map(c => <option key={c.id} value={c.code}>{c.code}</option>)}
                    </select>
                    <input className="border p-2 rounded" type="number" min="0" placeholder="Capacity (number of seats)" value={forms.venue.capacity} onChange={(e) => updateForm('venue', 'capacity', e.target.value)} />
                    <button className="bg-blue-600 text-white rounded px-3" onClick={() => postEntity('/admin/venues', forms.venue, 'venue')}>Add Venue</button>
                </div>
                <div className="space-y-2">
                    {venues.map(v => (
                        <div key={v.id} className="flex justify-between items-center border p-2 rounded">
                            <span>{v.name} ({collegeMap[v.college_code] || v.college_code || 'General'}) • Seats: {v.capacity}</span>
                            <button className="text-red-600" onClick={() => deleteEntity(`/admin/venues/${v.id}`)}>Delete</button>
                        </div>
                    ))}
                </div>
            </section>

            <section className="bg-white p-4 rounded shadow space-y-3">
                <h3 className="text-lg font-bold">Scheduling Rules</h3>
                <div className="space-y-2">
                    {rules.map(rule => (
                        <div key={rule.id} className="grid md:grid-cols-5 gap-2 items-center border p-2 rounded">
                            <input className="border p-2 rounded" value={rule.name} onChange={(e) => setRules(prev => prev.map(r => r.id === rule.id ? { ...r, name: e.target.value } : r))} />
                            <input className="border p-2 rounded" value={rule.rule_key} onChange={(e) => setRules(prev => prev.map(r => r.id === rule.id ? { ...r, rule_key: e.target.value } : r))} />
                            <input className="border p-2 rounded" value={rule.rule_value} onChange={(e) => setRules(prev => prev.map(r => r.id === rule.id ? { ...r, rule_value: e.target.value } : r))} />
                            <select className="border p-2 rounded" value={rule.is_active} onChange={(e) => setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: Number(e.target.value) } : r))}>
                                <option value={1}>Active</option>
                                <option value={0}>Inactive</option>
                            </select>
                            <button className="bg-green-600 text-white rounded px-3 py-2" onClick={() => updateRule(rule)}>Save</button>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
};

export default AdminManager;
