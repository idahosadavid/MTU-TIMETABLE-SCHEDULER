const crypto = require('crypto');

const DEFAULT_TTL_SECONDS = 60 * 30;

const getSessionSecret = () => process.env.MTU_PORTAL_SESSION_SECRET || '';

const base64UrlEncode = (value) => Buffer.from(value).toString('base64url');

const base64UrlDecode = (value) => Buffer.from(value, 'base64url').toString('utf8');

const sign = (payloadEncoded, secret) =>
    crypto.createHmac('sha256', secret).update(payloadEncoded).digest('base64url');

const createStudentSessionToken = (matricNumber, ttlSeconds = DEFAULT_TTL_SECONDS) => {
    const secret = getSessionSecret();
    if (!secret) {
        throw new Error('MTU_PORTAL_SESSION_SECRET is not configured');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload = {
        sub: matricNumber,
        iat: nowSeconds,
        exp: nowSeconds + ttlSeconds
    };

    const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
    const signature = sign(payloadEncoded, secret);
    return `${payloadEncoded}.${signature}`;
};

const timingSafeEqual = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }
    const aHash = crypto.createHash('sha256').update(a).digest();
    const bHash = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(aHash, bHash);
};

const verifyStudentSessionToken = (token) => {
    const secret = getSessionSecret();
    if (!secret) {
        throw new Error('MTU_PORTAL_SESSION_SECRET is not configured');
    }

    if (!token || typeof token !== 'string' || !token.includes('.')) {
        return null;
    }

    const [payloadEncoded, signature] = token.split('.');
    if (!payloadEncoded || !signature) {
        return null;
    }

    const expected = sign(payloadEncoded, secret);
    if (!timingSafeEqual(signature, expected)) {
        return null;
    }

    let payload;
    try {
        payload = JSON.parse(base64UrlDecode(payloadEncoded));
    } catch {
        return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!payload.sub || !payload.exp || nowSeconds >= Number(payload.exp)) {
        return null;
    }

    return payload;
};

module.exports = {
    createStudentSessionToken,
    verifyStudentSessionToken,
    DEFAULT_TTL_SECONDS
};
