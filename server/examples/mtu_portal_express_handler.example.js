const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// MTU portal domain and timetable service config
const PORTAL_BASE_URL = process.env.PORTAL_BASE_URL || 'https://studentportal.mtu.edu.ng';
const TIMETABLE_API_BASE_URL = process.env.TIMETABLE_API_BASE_URL || 'https://studentportal.mtu.edu.ng/timetable-api/api';
const MTU_PORTAL_SHARED_SECRET = process.env.MTU_PORTAL_SHARED_SECRET;

// Replace with your real MTU auth/session middleware
const requirePortalLogin = (req, res, next) => {
    if (!req.user || !req.user.matricNumber) {
        return res.status(401).json({ error: 'Not logged in' });
    }
    return next();
};

// Route on MTU portal backend triggered by "View Timetable" button
app.get('/portal/timetable/launch', requirePortalLogin, async (req, res) => {
    if (!MTU_PORTAL_SHARED_SECRET) {
        return res.status(500).json({ error: 'Missing MTU_PORTAL_SHARED_SECRET' });
    }

    const matricNumber = req.user.matricNumber;

    try {
        const response = await fetch(`${TIMETABLE_API_BASE_URL}/student/portal/authorize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-mtu-portal-secret': MTU_PORTAL_SHARED_SECRET
            },
            body: JSON.stringify({ matric_number: matricNumber })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: 'Failed to authorize timetable launch',
                details: data
            });
        }

        const portalCode = data?.data?.portal_code;
        if (!portalCode) {
            return res.status(502).json({ error: 'No portal_code returned by timetable API' });
        }

        // Hardened redirect: one-time code only
        const redirectUrl = `${PORTAL_BASE_URL}/timetable/student?portal_code=${encodeURIComponent(portalCode)}`;
        return res.redirect(302, redirectUrl);
    } catch (error) {
        return res.status(500).json({
            error: 'Unexpected launch failure',
            message: error.message
        });
    }
});

module.exports = app;
