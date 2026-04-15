import React from 'react';
import { Routes, Route, Link, NavLink, Navigate, useNavigate } from 'react-router-dom';
import TimetableList from './components/TimetableList';
import TimetableView from './components/TimetableView';
import StudentPortal from './components/StudentPortal';
import AdminManager from './components/AdminManager';
import AdminLogin from './components/AdminLogin';
import { isAdminAuthenticated, clearAdminKey } from './adminAuth';

/** Redirects to /admin-login if the admin key is not stored. */
const AdminRoute = ({ children }) => {
  if (!isAdminAuthenticated()) {
    return <Navigate to="/admin-login" replace />;
  }
  return children;
};

const AdminNav = () => {
  const navigate = useNavigate();
  const handleLogout = () => {
    clearAdminKey();
    navigate('/admin-login', { replace: true });
  };

  if (!isAdminAuthenticated()) return null;

  return (
    <button
      id="admin-logout-btn"
      onClick={handleLogout}
      title="Sign out of admin"
      style={{
        background: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: '6px',
        color: '#fff',
        padding: '6px 14px',
        fontSize: '13px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'background 0.2s',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      Logout
    </button>
  );
};

function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-blue-800 text-white p-4 shadow-lg">
        <div className="container mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold">MTU Timetable Generator</Link>
          <div className="flex items-center space-x-4">
            {isAdminAuthenticated() && (
              <>
                <NavLink
                  to="/"
                  className={({ isActive }) => `px-3 py-1 rounded ${isActive ? 'bg-blue-900 border border-white' : 'hover:bg-blue-700'}`}
                  end
                >
                  Admin Portal
                </NavLink>
                <NavLink
                  to="/admin"
                  className={({ isActive }) => `px-3 py-1 rounded ${isActive ? 'bg-blue-900 border border-white' : 'hover:bg-blue-700'}`}
                >
                  Admin Setup
                </NavLink>
              </>
            )}
            <NavLink
              to="/student"
              className={({ isActive }) => `px-3 py-1 rounded ${isActive ? 'bg-blue-900 border border-white' : 'hover:bg-blue-700'}`}
            >
              Student Portal
            </NavLink>
            <AdminNav />
          </div>
        </div>
      </nav>

      <main className="container mx-auto p-6">
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
