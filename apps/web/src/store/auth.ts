import { create } from 'zustand';

export interface AuthSession {
    accessToken: string;
    csrfToken: string;
    user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        roles: string[];
        departmentId?: string | null;
        department?: { id: string; name: string } | null;
        mustChangePassword?: boolean;
    };
}

interface AuthStore {
    session: AuthSession | null;
    isAuthenticated: boolean;
    isHydrated: boolean;
    setSession: (session: AuthSession | null) => void;
    logout: () => void;
    hasRole: (role: string) => boolean;
    hydrate: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
    session: null,
    isAuthenticated: false,
    isHydrated: false,

    setSession: (session) => {
        if (session) {
            localStorage.setItem('accessToken', session.accessToken);
            localStorage.setItem('csrfToken', session.csrfToken);
            localStorage.setItem('user', JSON.stringify(session.user));
        }
        set({
            session,
            isAuthenticated: !!session
        });
    },

    logout: () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('csrfToken');
        localStorage.removeItem('user');
        set({
            session: null,
            isAuthenticated: false
        });
    },

    hasRole: (role: string) => {
        const { session } = get();
        return session?.user.roles.includes(role) ?? false;
    },

    hydrate: () => {
        const accessToken = localStorage.getItem('accessToken');
        const csrfToken = localStorage.getItem('csrfToken');
        const userStr = localStorage.getItem('user');

        if (accessToken && csrfToken && userStr) {
            try {
                const user = JSON.parse(userStr);
                set({
                    session: { accessToken, csrfToken, user },
                    isAuthenticated: true,
                    isHydrated: true
                });
                return;
            } catch (e) {
                console.error('Failed to restore auth session:', e);
            }
        }
        set({ isHydrated: true });
    }
}));

// Hydrate auth store from localStorage on client
if (typeof window !== 'undefined') {
    useAuthStore.getState().hydrate();
}
