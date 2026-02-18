const getNoticeTimeoutMs = (type = 'info') => {
    if (type === 'success') return 2500;
    if (type === 'error') return 6000;
    return 4000;
};

export default getNoticeTimeoutMs;
