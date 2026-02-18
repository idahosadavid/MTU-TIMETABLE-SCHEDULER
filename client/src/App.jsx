import React from 'react';
import { Routes, Route, Link, NavLink } from 'react-router-dom';
import TimetableList from './components/TimetableList';
import TimetableView from './components/TimetableView';
import StudentPortal from './components/StudentPortal';
import AdminManager from './components/AdminManager';

function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-blue-800 text-white p-4 shadow-lg">
        <div className="container mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold">MTU Timetable Generator</Link>
          <div className="space-x-4">
            <NavLink
              to="/"
              className={({ isActive }) => `px-3 py-1 rounded ${isActive ? 'bg-blue-900 border border-white' : 'hover:bg-blue-700'}`}
              end
            >
              Admin Portal
            </NavLink>
            <NavLink
              to="/student"
              className={({ isActive }) => `px-3 py-1 rounded ${isActive ? 'bg-blue-900 border border-white' : 'hover:bg-blue-700'}`}
            >
              Student Portal
            </NavLink>
            <NavLink
              to="/admin"
              className={({ isActive }) => `px-3 py-1 rounded ${isActive ? 'bg-blue-900 border border-white' : 'hover:bg-blue-700'}`}
            >
              Admin Setup
            </NavLink>
          </div>
        </div>
      </nav>

      <main className="container mx-auto p-6">
        <Routes>
          <Route path="/" element={<TimetableList />} />
          <Route path="/timetable/:id" element={<TimetableView />} />
          <Route path="/student" element={<StudentPortal />} />
          <Route path="/admin" element={<AdminManager />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
