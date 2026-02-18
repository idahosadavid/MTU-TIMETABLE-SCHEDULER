import React from 'react';
import NoticeBanner from './NoticeBanner';

const FloatingNotice = ({
    message,
    type = 'info',
    onDismiss,
    actionLabel,
    onAction,
    stackIndex = 0
}) => {
    if (!message) {
        return null;
    }

    return (
        <div
            className="fixed right-4 z-50 w-[min(90vw,28rem)]"
            style={{ bottom: `${16 + (stackIndex * 80)}px` }}
        >
            <NoticeBanner
                message={message}
                type={type}
                onDismiss={onDismiss}
                actionLabel={actionLabel}
                onAction={onAction}
            />
        </div>
    );
};

export default FloatingNotice;
