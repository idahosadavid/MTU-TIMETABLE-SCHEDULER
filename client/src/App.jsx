import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, NavLink, Navigate, useNavigate } from 'react-router-dom';
import TimetableList from './components/TimetableList';
import TimetableView from './components/TimetableView';
import StudentPortal from './components/StudentPortal';
import AdminManager from './components/AdminManager';
import AdminLogin from './components/AdminLogin';
import AuditLog from './components/AuditLog';
import { isAdminAuthenticated, clearAdminKey, subscribeToAuthChanges } from './adminAuth';
import mtuLogo from "../../mtulogo.jpg";

/** Redirects to /admin-login if the admin key is not stored. */
const AdminRoute = ({ children }) => {
  if (!isAdminAuthenticated()) {
    return <Navigate to="/admin-login" replace />;
  }
  return children;
};

const AdminNav = ({ isAdmin }) => {
  const navigate = useNavigate();
  const handleLogout = () => {
    clearAdminKey();
    navigate('/admin-login', { replace: true });
  };

  if (!isAdmin) return null;

  return (
    <button
      id="admin-logout-btn"
      onClick={handleLogout}
      title="Sign out of admin"
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/90 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 transition-all duration-200"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      Logout
    </button>
  );
};

function App() {
  const [, setAuthTick] = useState(0);

  useEffect(() => {
    return subscribeToAuthChanges(() => {
      setAuthTick(t => t + 1);
    });
  }, []);

  const isAdmin = isAdminAuthenticated();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Branded Navigation */}
      <nav className="bg-[#4c1d95] text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and Brand */}
            <Link to="/" className="flex items-center gap-3 group">
              <div className="relative w-10 h-10 rounded-full overflow-hidden bg-white p-1 shadow-md group-hover:shadow-lg transition-shadow">
                <img
                  src={mtuLogo}
                  alt="MTU Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <div className="text-base font-bold tracking-tight leading-none">MTU Timetable</div>
                <div className="text-emerald-400 text-[11px] font-medium leading-tight tracking-wide hidden sm:block">Scheduler</div>
              </div>
            </Link>

            {/* Navigation Links */}
            <div className="flex items-center gap-1 sm:gap-2">
              {isAdmin && (
                <>
                  <NavLink
                    to="/"
                    className={({ isActive }) =>
                      `px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-white/15 text-white'
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`
                    }
                    end
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    <span className="hidden sm:inline">Dashboard</span>
                  </NavLink>
                  <NavLink
                    to="/admin"
                    className={({ isActive }) =>
                      `px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-white/15 text-white'
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`
                    }
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="hidden sm:inline">Setup</span>
                  </NavLink>
                  <NavLink
                    to="/audit-log"
                    className={({ isActive }) =>
                      `px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-white/15 text-white'
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`
                    }
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span className="hidden sm:inline">Audit</span>
                  </NavLink>
                  <div className="w-px h-5 bg-white/20 mx-1 hidden sm:block" />
                </>
              )}
              <NavLink
                to="/student"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-white/15 text-white'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`
                }
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422A12.083 12.083 0 0121 21H3a12.083 12.083 0 012.84-10.422L12 14z" />
                </svg>
                <span className="hidden sm:inline">Students</span>
              </NavLink>
              <AdminNav isAdmin={isAdmin} />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Routes>
          {/* Public — student portal (no login needed) */}
          <Route path="/student" element={<StudentPortal />} />

          {/* Auth gate */}
          <Route path="/admin-login" element={<AdminLogin />} />

          {/* Protected admin routes */}
          <Route path="/" element={<AdminRoute><TimetableList /></AdminRoute>} />
          <Route path="/timetable/:id" element={<AdminRoute><TimetableView /></AdminRoute>} />
          <Route path="/admin" element={<AdminRoute><AdminManager /></AdminRoute>} />
          <Route path="/audit-log" element={<AdminRoute><AuditLog /></AdminRoute>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} Mountain Top University · Timetable Scheduler</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
            AI-Powered Conflict-Free Scheduling
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
