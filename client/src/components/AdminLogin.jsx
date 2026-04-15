import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL from '../apiBase';
import { setAdminKey } from '../adminAuth';

const AdminLogin = () => {
    const [key, setKey] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!key.trim()) {
            setError('Please enter the admin key.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE_URL}/admin/ping`, {
                headers: { 'x-admin-key': key.trim() }
            });
            if (res.ok) {
                setAdminKey(key.trim());
                navigate('/', { replace: true });
            } else {
                setError('Incorrect admin key. Please try again.');
            }
        } catch {
            setError('Could not reach the server. Is it running?');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.page}>
            {/* Background blobs */}
            <div style={styles.blob1} />
            <div style={styles.blob2} />

            <div style={styles.card}>
                {/* Logo / brand */}
                <div style={styles.brand}>
                    <div style={styles.logoRing}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                    </div>
                    <h1 style={styles.title}>MTU Scheduler</h1>
                    <p style={styles.subtitle}>Admin Access</p>
                </div>

                {/* Divider */}
                <div style={styles.divider} />

                <p style={styles.hint}>
                    Enter your admin key to unlock the scheduling dashboard.
                </p>

                <form onSubmit={handleSubmit} style={styles.form}>
                    <div style={styles.inputWrapper}>
                        <svg style={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <input
                            id="admin-key-input"
                            type="password"
                            value={key}
                            onChange={e => { setKey(e.target.value); setError(''); }}
                            placeholder="Admin key"
                            style={styles.input}
                            autoFocus
                            autoComplete="current-password"
                        />
                    </div>

                    {error && (
                        <div style={styles.errorBox}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, flexShrink: 0 }}>
                                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <button
                        id="admin-login-submit"
                        type="submit"
                        disabled={loading}
                        style={{ ...styles.button, ...(loading ? styles.buttonDisabled : {}) }}
                    >
                        {loading ? (
                            <span style={styles.spinner} />
                        ) : (
                            <>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
                                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                    <polyline points="10 17 15 12 10 7" />
                                    <line x1="15" y1="12" x2="3" y2="12" />
                                </svg>
                                Unlock Dashboard
                            </>
                        )}
                    </button>
                </form>

                <div style={styles.footer}>
                    <a href="/student" style={styles.footerLink}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                            <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" />
                        </svg>
                        Go to Student Portal
                    </a>
                </div>
            </div>
        </div>
    );
};

/* ── Inline styles ── */
const styles = {
    page: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1a1a2e 100%)',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
    },
    blob1: {
        position: 'absolute',
        top: '-120px',
        right: '-120px',
        width: '420px',
        height: '420px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)',
        pointerEvents: 'none',
    },
    blob2: {
        position: 'absolute',
        bottom: '-140px',
        left: '-100px',
        width: '380px',
        height: '380px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)',
        pointerEvents: 'none',
    },
    card: {
        position: 'relative',
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '20px',
        padding: '44px 40px',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
    },
    brand: {
        textAlign: 'center',
        marginBottom: '24px',
    },
    logoRing: {
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 16px',
        boxShadow: '0 8px 20px rgba(59,130,246,0.4)',
    },
    title: {
        color: '#fff',
        fontSize: '24px',
        fontWeight: '700',
        margin: '0 0 4px',
        letterSpacing: '-0.5px',
    },
    subtitle: {
        color: 'rgba(148,163,184,0.9)',
        fontSize: '13px',
        fontWeight: '500',
        textTransform: 'uppercase',
        letterSpacing: '2px',
        margin: 0,
    },
    divider: {
        height: '1px',
        background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)',
        margin: '0 0 24px',
    },
    hint: {
        color: 'rgba(148,163,184,0.85)',
        fontSize: '14px',
        textAlign: 'center',
        margin: '0 0 24px',
        lineHeight: '1.5',
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
    },
    inputWrapper: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
    },
    inputIcon: {
        position: 'absolute',
        left: '14px',
        color: 'rgba(148,163,184,0.7)',
        pointerEvents: 'none',
    },
    input: {
        width: '100%',
        padding: '13px 14px 13px 44px',
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '10px',
        color: '#fff',
        fontSize: '15px',
        outline: 'none',
        transition: 'border-color 0.2s',
        boxSizing: 'border-box',
    },
    errorBox: {
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(239,68,68,0.15)',
        border: '1px solid rgba(239,68,68,0.35)',
        borderRadius: '8px',
        color: '#fca5a5',
        fontSize: '13px',
        padding: '10px 12px',
    },
    button: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '13px',
        background: 'linear-gradient(135deg, #3b82f6, #6d28d9)',
        border: 'none',
        borderRadius: '10px',
        color: '#fff',
        fontSize: '15px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'opacity 0.2s, transform 0.15s',
        boxShadow: '0 4px 14px rgba(59,130,246,0.4)',
        marginTop: '4px',
    },
    buttonDisabled: {
        opacity: 0.6,
        cursor: 'not-allowed',
    },
    spinner: {
        width: '18px',
        height: '18px',
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        display: 'inline-block',
    },
    footer: {
        marginTop: '28px',
        textAlign: 'center',
    },
    footerLink: {
        display: 'inline-flex',
        alignItems: 'center',
        color: 'rgba(148,163,184,0.75)',
        fontSize: '13px',
        textDecoration: 'none',
        transition: 'color 0.2s',
    },
};

/* Add spin keyframe once */
if (typeof document !== 'undefined' && !document.getElementById('mtu-spin-style')) {
    const s = document.createElement('style');
    s.id = 'mtu-spin-style';
    s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(s);
}

export default AdminLogin;
