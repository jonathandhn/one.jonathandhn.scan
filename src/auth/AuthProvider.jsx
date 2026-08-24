import { createContext, useContext } from 'react';
import { AuthProvider as OidcProvider, useAuth as useOidcAuth } from 'react-oidc-context';
import { WebStorageStateStore } from 'oidc-client-ts';
import { isSessionMode, runtime } from '../runtime';

const DummyAuthContext = createContext({
    isAuthenticated: false,
    user: null,
    signinRedirect: () => Promise.resolve(),
    removeUser: () => Promise.resolve(),
});

const isOauthConfigured = () => {
    if (isSessionMode) return false;
    const featureEnabled = (window.CIVI_CONFIG?.featureOauth || import.meta.env.VITE_FEATURE_OAUTH) === 'true';
    const authority = window.CIVI_CONFIG?.oauthAuthority || import.meta.env.VITE_OAUTH_AUTHORITY;
    const clientId = window.CIVI_CONFIG?.oauthClientId || import.meta.env.VITE_OAUTH_CLIENT_ID;
    return Boolean(featureEnabled && authority && clientId);
};

export const useSafeAuth = () => {
    const dummyAuth = useContext(DummyAuthContext);
    let oidcAuth = null;
    try {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        oidcAuth = useOidcAuth();
    } catch {
        // Fallback when outside OidcProvider
    }
    return isOauthConfigured() && oidcAuth ? oidcAuth : dummyAuth;
};

export const AuthProvider = ({ children }) => {
    if (isSessionMode) {
        return <>{children}</>;
    }

    // 1. Feature Flag Check
    const featureEnabled = (window.CIVI_CONFIG?.featureOauth || import.meta.env.VITE_FEATURE_OAUTH) === 'true';

    // 2. Runtime Configuration (Priority: Window Object > Env Var)
    const authority = window.CIVI_CONFIG?.oauthAuthority || import.meta.env.VITE_OAUTH_AUTHORITY;
    const clientId = window.CIVI_CONFIG?.oauthClientId || import.meta.env.VITE_OAUTH_CLIENT_ID;

    // If disabled or missing config, render children directly (API Key mode)
    if (!featureEnabled || !authority || !clientId) {
        return <>{children}</>;
    }

    const oidcConfig = {
        authority,
        client_id: clientId,
        redirect_uri: `${window.location.origin}${runtime.basename}/callback`,
        scope: 'openid profile email civicrm:api4',
        userStore: new WebStorageStateStore({ store: window.localStorage }),
    };

    return (
        <OidcProvider {...oidcConfig}>
            {children}
        </OidcProvider>
    );
};
