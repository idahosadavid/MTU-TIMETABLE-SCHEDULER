import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../apiBase';
import { adminHeaders } from '../adminAuth';
import FloatingNotice from './FloatingNotice';
import getNoticeTimeoutMs from '../noticeTimeout';

const CustomFieldsManager = ({ onFieldsChange }) => {
    const [fields, setFields] = useState([]);
    const [newField, setNewField] = useState({ name: '', label: '', type: 'text', required: false });
    const [notice, setNotice] = useState({ message: '', type: 'info' });

    const fetchFields = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/custom-fields`);
            const data = await response.json();
            if (data.data) {
                setFields(data.data);
                if (onFieldsChange) onFieldsChange(data.data);
            }
        } catch (error) {
            console.error('Error fetching custom fields:', error);
        }
    };

    useEffect(() => {
        fetchFields();
    }, []);

    useEffect(() => {
        if (!notice.message) {
            return;
        }

        const timeoutId = setTimeout(() => setNotice({ message: '', type: 'info' }), getNoticeTimeoutMs(notice.type));
        return () => clearTimeout(timeoutId);
    }, [notice]);

    const handleAddField = async () => {
        if (!newField.name || !newField.label) {
            setNotice({ message: 'Name and label are required.', type: 'error' });
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/custom-fields`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...adminHeaders() },
                body: JSON.stringify(newField)
            });
            if (response.ok) {
                setNewField({ name: '', label: '', type: 'text', required: false });
                setNotice({ message: 'Custom field added.', type: 'success' });
                fetchFields();
            } else {
                setNotice({ message: 'Failed to add field.', type: 'error' });
            }
        } catch (error) {
            console.error('Error adding field:', error);
            setNotice({ message: 'Failed to add field.', type: 'error' });
        }
    };

    const handleDeleteField = async (id) => {
        if (!window.confirm('Are you sure? This will not delete data from existing courses but will remove the field definition.')) return;

        try {
            const response = await fetch(`${API_BASE_URL}/custom-fields/${id}`, {
                method: 'DELETE',
                headers: adminHeaders()
            });
            if (response.ok) {
                setNotice({ message: 'Custom field deleted.', type: 'success' });
                fetchFields();
            } else {
                setNotice({ message: 'Failed to delete field.', type: 'error' });
            }
        } catch (error) {
            console.error('Error deleting field:', error);
            setNotice({ message: 'Failed to delete field.', type: 'error' });
        }
    };

    return (
        <div className="mb-6 p-4 border border-gray-300 rounded bg-gray-50">
            <FloatingNotice
                message={notice.message}
                type={notice.type}
                onDismiss={() => setNotice({ message: '', type: 'info' })}
                stackIndex={1}
            />
            <h3 className="font-semibold mb-2">Manage Custom Fields</h3>
            <div className="flex gap-2 mb-4">
                <input
                    placeholder="Field Name (e.g. lecturer_email)"
                    value={newField.name}
                    onChange={e => setNewField({ ...newField, name: e.target.value })}
                    className="border p-2 rounded text-sm flex-1"
                />
                <input
                    placeholder="Label (e.g. Lecturer Email)"
                    value={newField.label}
                    onChange={e => setNewField({ ...newField, label: e.target.value })}
                    className="border p-2 rounded text-sm flex-1"
                />
                <select
                    value={newField.type}
                    onChange={e => setNewField({ ...newField, type: e.target.value })}
                    className="border p-2 rounded text-sm"
                >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Checkbox</option>
                </select>
                <button onClick={handleAddField} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm">Add</button>
            </div>

            <ul className="space-y-2">
                {fields.map(field => (
                    <li key={field.id} className="flex justify-between items-center bg-white p-2 rounded shadow-sm">
                        <span className="text-sm"><strong>{field.label}</strong> ({field.name}) - {field.type}</span>
                        <button onClick={() => handleDeleteField(field.id)} className="text-red-600 hover:text-red-800 text-sm">Delete</button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default CustomFieldsManager;
