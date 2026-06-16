const { allAsync, runAsync } = require('./helpers');

const write = async ({ action, entity_type, entity_id, detail, ip_address }) => {
    try {
        await runAsync(
            `INSERT INTO audit_log (action, entity_type, entity_id, detail, ip_address) VALUES (?, ?, ?, ?, ?)`,
            [action, entity_type, String(entity_id ?? ''), detail ?? null, ip_address ?? null]
        );
    } catch (err) {
        console.error('[AuditLog] write error:', err.message);
    }
};

const list = async ({ limit = 100, offset = 0 } = {}) => {
    const safeLimit = Math.min(limit, 500);
    return allAsync(
        `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [safeLimit, offset]
    );
};

module.exports = { write, list };
