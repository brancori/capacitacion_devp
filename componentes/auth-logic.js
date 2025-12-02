const AuthLogic = {
    config: {
        apiUrl: window.location.origin + '/api/functions/v1', 
        redirects: {
            'user': '/profile/profile.html',
            'admin': '/dashboard.html',
            'master': '/dashboard.html',
            'supervisor': '/dashboard.html',
            'auditor': '/dashboard.html'
        }
    },

    async login(email, password) {
        const tenantSlug = window.CURRENT_TENANT || 'siresi';
        
        try {
            const response = await fetch(`${this.config.apiUrl}/custom-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, tenant_slug: tenantSlug })
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Error en login');

            if (data.action === 'FORCE_RESET') {
                return { action: 'FORCE_RESET', userId: data.user_id };
            }

            await this.setSession(data);
            return { action: 'SUCCESS', role: data.role };

        } catch (error) {
            console.error('Login error:', error);
            return { action: 'ERROR', message: error.message };
        }
    },

    async register(email, password, fullName, userType = 'employee') {
        const tenantSlug = window.CURRENT_TENANT || 'siresi';

        try {
            const response = await fetch(`${this.config.apiUrl}/register-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email, 
                    password, 
                    full_name: fullName, 
                    tenant_slug: tenantSlug,
                    user_type: userType
                })
            });

            const data = await response.json();

            if (response.status === 429) {
                return { success: false, message: 'Demasiados intentos. Espera 10 minutos.' };
            }

            if (!response.ok) throw new Error(data.error || 'Error en registro');

            return { success: true };

        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    async completeForceReset(userId, newPassword) {
        try {
            const response = await fetch(`${this.config.apiUrl}/reset-password-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, newPassword })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            
            return { success: true };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    async setSession(data) {
        localStorage.setItem('sb-role', data.role);
        
        if (window.supabase && data.session) {
            const { error } = await window.supabase.auth.setSession(data.session);
            if (error) console.error("Error sync session:", error);
        } else {
            console.warn("Supabase Client no listo o session vacía");
        }
    },

    redirectUser(role) {
        const target = this.config.redirects[role] || '/index.html';
        window.location.href = target;
    }
};

window.AuthLogic = AuthLogic;