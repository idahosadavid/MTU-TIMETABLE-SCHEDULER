import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, NavLink, Navigate, useNavigate } from 'react-router-dom';
import TimetableList from './components/TimetableList';
import TimetableView from './components/TimetableView';
import StudentPortal from './components/StudentPortal';
import AdminManager from './components/AdminManager';
import AdminLogin from './components/AdminLogin';
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
    <div className="min-h-screen bg-slate-50">
      {/* Branded Navigation */}
      <nav className="bg-[#4c1d95] text-white shadow-lg">
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
              <div className="hidden sm:block">
                <span className="text-lg font-bold tracking-tight">MTU Timetable</span>
                <span className="hidden md:inline text-emerald-400 ml-2 text-sm font-medium">Scheduler</span>
              </div>
            </Link>

            {/* Navigation Links */}
            <div className="flex items-center gap-1 sm:gap-2">
              {isAdmin && (
                <>
                  <NavLink
                    to="/"
                    className={({ isActive }) => 
                      `px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActive 
                          ? 'bg-[#3b0764] text-white shadow-inner' 
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`
                    }
                    end
                  >
                    <span className="hidden sm:inline">Admin Portal</span>
                    <span className="sm:hidden">Dashboard</span>
                  </NavLink>
                  <NavLink
                    to="/admin"
                    className={({ isActive }) => 
                      `px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActive 
                          ? 'bg-[#3b0764] text-white shadow-inner' 
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`
                    }
                  >
                    <span className="hidden sm:inline">Admin Setup</span>
                    <span className="sm:hidden">Setup</span>
                  </NavLink>
                </>
              )}
              <NavLink
                to="/student"
                className={({ isActive }) => 
                  `px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1 ${
                    isActive 
                      ? 'bg-[#3b0764] text-white shadow-inner' 
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`
                }
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422A12.083 12.083 0 0121 21H3a12.083 12.083 0 012.84-10.422L12 14z" />
                </svg>
                <span className="hidden sm:inline">Student Portal</span>
                <span className="sm:hidden">Student</span>
              </NavLink>
              <AdminNav isAdmin={isAdmin} />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Routes>
          {/* Public — student portal (no login needed) */}
          <Route path="/student" element={<StudentPortal />} />

          {/* Auth gate */}
          <Route path="/admin-login" element={<AdminLogin />} />

          {/* Protected admin routes */}
          <Route path="/" element={<AdminRoute><TimetableList /></AdminRoute>} />
          <Route path="/timetable/:id" element={<AdminRoute><TimetableView /></AdminRoute>} />
          <Route path="/admin" element={<AdminRoute><AdminManager /></AdminRoute>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
