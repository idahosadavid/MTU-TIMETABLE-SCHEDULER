const crypto = require('crypto');

const codes = new Map();

const nowSeconds = () => Math.floor(Date.now() / 1000);

const cleanupExpired = () => {
    const now = nowSeconds();
    for (const [code, payload] of codes.entries()) {
        if (!payload || Number(payload.exp) <= now) {
            codes.delete(code);
        }
    }
};

const issuePortalAuthCode = (matricNumber, ttlSeconds = 120) => {
    cleanupExpired();
    const code = crypto.randomBytes(32).toString('base64url');
    const exp = nowSeconds() + Number(ttlSeconds);

    codes.set(code, {
        matric_number: matricNumber,
        exp
    });

    return { code, exp };
};

const consumePortalAuthCode = (code) => {
    cleanupExpired();

    if (!code || typeof code !== 'string') {
        return null;
    }

    const payload = codes.get(code);
    if (!payload) {
        return null;
    }

    codes.delete(code);

    const now = nowSeconds();
    if (Number(payload.exp) <= now) {
        return null;
    }

    return payload;
};

module.exports = {
    issuePortalAuthCode,
    consumePortalAuthCode
};
