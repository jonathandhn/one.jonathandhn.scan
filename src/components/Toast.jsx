import React, { createContext, useContext, useState, useCallback } from 'react';
import { X } from 'lucide-react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'info', duration = 3000) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type, duration }]);

        if (duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div className="toast toast-end toast-bottom z-50 flex flex-col gap-2">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`alert shadow-lg text-white animate-in slide-in-from-bottom-2 fade-in duration-300 ${toast.type === 'success' ? 'alert-success' :
                                toast.type === 'error' ? 'alert-error' :
                                    toast.type === 'warning' ? 'alert-warning' : 'alert-info'
                            }`}
                    >
                        <span>{toast.message}</span>
                        <button onClick={() => removeToast(toast.id)} className="btn btn-ghost btn-xs btn-circle">
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
