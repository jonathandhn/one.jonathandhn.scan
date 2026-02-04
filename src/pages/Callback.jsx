import React, { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { useNavigate } from 'react-router-dom';

const Callback = () => {
    const auth = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (auth.isAuthenticated) {
            navigate('/');
        }
        if (auth.error) {
            console.error("Auth Error:", auth.error);
        }
    }, [auth.isAuthenticated, auth.error, navigate]);

    if (auth.error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen p-4 text-center">
                <h2 className="text-xl font-bold text-error">Authentication Failed</h2>
                <p>{auth.error.message}</p>
                <button className="btn btn-primary mt-4" onClick={() => navigate('/settings')}>
                    Back to Settings
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-screen">
            <span className="loading loading-spinner loading-lg text-primary"></span>
            <p className="mt-4 text-base-content/60">Completing login...</p>
        </div>
    );
};

export default Callback;
