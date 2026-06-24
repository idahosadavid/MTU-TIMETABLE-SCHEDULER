import React, { useState, useEffect, useCallback } from 'react';
import { getAdminKey } from '../adminAuth';
import API_BASE_URL from '../apiBase';

const ACTION_COLORS = {
    CREATE: 'bg-emerald-100 text-emerald-800',
    UPDATE: 'bg-blue-100 text-blue-800',
    DELETE: 'bg-red-100 text-red-800',
    GENERATE: 'bg-purple-100 text-purple-800',
};

// apiBase.js already includes /api — strip it so we can append our own path segments
const API_BASE = API_BASE_URL.replace(/\/api\/?$/, '');

export default function AuditLog() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('');

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // 70 s timeout to survive Render free-tier cold starts (spin-up can take ~50 s)
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 70_000);
            let res;
            try {
                res = await fetch(`${API_BASE}/api/admin/audit-log?limit=200`, {
                    headers: { 'x-admin-key': getAdminKey() },
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timer);
            }
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
            setLogs(json.data || []);
        } catch (err) {
            if (err.name === 'AbortError') {
                setError('Request timed out — the server may be waking up. Please try again in a moment.');
            } else {
                setError(err.message || 'Network error — could not reach the server.');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const filtered = filter
        ? logs.filter(l =>
            l.action?.toLowerCase().includes(filter.toLowerCase()) ||
            l.entity_type?.toLowerCase().includes(filter.toLowerCase()) ||
            l.detail?.toLowerCase().includes(filter.toLowerCase())
        )
        : logs;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Admin Audit Log</h1>
                    <p className="text-sm text-slate-500 mt-1">Recent administrative actions</p>
                </div>
                <button
                    onClick={fetchLogs}
                    className="flex items-center gap-2 px-4 py-2 bg-[#4c1d95] text-white text-sm rounded-lg hover:bg-[#3b0764] transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                    <input
                        type="text"
                        placeholder="Filter by action, entity, or detail…"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/30"
                    />
                </div>

                {loading && (
                    <div className="flex items-center justify-center py-16 text-slate-400">
                        <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Loading…
                    </div>
                )}

                {error && (
                    <div className="p-6 text-center text-red-600 text-sm">{error}</div>
                )}

                {!loading && !error && filtered.length === 0 && (
                    <div className="p-12 text-center text-slate-400">
                        <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                        </svg>
                        {filter ? 'No entries match your filter.' : 'No audit entries yet. Actions you take will appear here.'}
                    </div>
                )}

                {!loading && !error && filtered.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-500 uppercase text-xs tracking-wider">
                                <tr>
                                    <th className="text-left px-4 py-3">Timestamp</th>
                                    <th className="text-left px-4 py-3">Action</th>
                                    <th className="text-left px-4 py-3">Entity</th>
                                    <th className="text-left px-4 py-3">ID</th>
                                    <th className="text-left px-4 py-3">Detail</th>
                                    <th className="text-left px-4 py-3">IP</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.map(log => (
                                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap font-mono text-xs">
                                            {new Date(log.created_at).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-700'}`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700 capitalize">{log.entity_type}</td>
                                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{log.entity_id || '—'}</td>
                                        <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={log.detail}>{log.detail || '—'}</td>
                                        <td className="px-4 py-3 text-slate-400 font-mono text-xs">{log.ip_address || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-400">
                            Showing {filtered.length} of {logs.length} entries
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
