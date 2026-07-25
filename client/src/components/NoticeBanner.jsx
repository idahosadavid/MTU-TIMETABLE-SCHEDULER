import React from 'react';

const styleByType = {
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    success: 'border-green-200 bg-green-50 text-green-800',
    error: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800'
};

const NoticeBanner = ({ message, type = 'info', onDismiss, actionLabel, onAction }) => {
    if (!message) {
        return null;
    }

    return (
        <div className={`rounded border px-3 py-2 text-sm ${styleByType[type] || styleByType.info}`}>
            <div className="flex items-center justify-between gap-2">
                <span>{message}</span>
                <div className="flex items-center gap-3">
                    {actionLabel && onAction && (
                        <button
                            type="button"
                            onClick={onAction}
                            className="font-semibold hover:underline"
                        >
                            {actionLabel}
                        </button>
                    )}
                    {onDismiss && (
                        <button
                            type="button"
                            onClick={onDismiss}
                            className="font-semibold hover:underline"
                        >
                            Dismiss
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NoticeBanner;
