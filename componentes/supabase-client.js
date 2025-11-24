// componentes/supabase-client.js
// VERSIÓN AUDITADA: Fix WebSockets + Tracking Prevention

const SUPABASE_URL = 'https://hvwygpnuunuuylzondxt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2d3lncG51dW51dXlsem9uZHh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NDUzMTEsImV4cCI6MjA3NjEyMTMxMX0.FxjCX9epT_6LgWGdzdPhRUTP2vn4CLdixRqpFMRZK70';

const APP_VERSION = '3.0.5';

function detectTenant() {
  const host = location.hostname || 'localhost';
  if (host === 'localhost' || host === '127.0.0.1') return 'demo';
  const parts = host.split('.');
  return (parts.length > 2 && parts[0] !== 'www') ? parts[0] : 'default';
}

function clearAllAuthData() {
  const keysToRemove = ['tenantTheme', 'tenantSlug', 'current_tenant', 'app_version'];
  // Fix: Try/Catch para evitar crash por Tracking Prevention
  keysToRemove.forEach(key => {
    try { localStorage.removeItem(key); } catch (e) { console.warn('Storage bloqueado (limpieza):', e); }
  });
}

// Inicialización del Cliente
if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
  console.error('❌ La librería de Supabase no está cargada.');
} else {
  
  // Configuración explícita de opciones
const clientOptions = {
    auth: {
      persistSession: false,      // Importante: No guardar en disco
      autoRefreshToken: false,    // No intentar refrescar token guardado
      detectSessionInUrl: false,  // Manejo manual de URL
      storage: undefined          // Elimina el adaptador de cookies
    },
    realtime: {
        params: {
            eventsPerSecond: 10,
        },
        headers: {
            'x-client-info': 'supa-ehs-v3'
        }
    }
  };
  window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
  console.log('✅ Cliente Supabase (Fix WSS + Privacy)');

  // Autorecuperación de sesión
  (async function recoverSessionFromUrl() {
      try {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token') || params.get('access_token');
        const refreshToken = params.get('refresh_token') || 'dummy-refresh-token';

        if (token) {
            console.log('🔄 [Global] Detectado token en URL. Restaurando sesión...');
            const { error } = await window.supabase.auth.setSession({
                access_token: token,
                refresh_token: refreshToken
            });

            if (!error) {
                console.log('✅ [Global] Sesión restaurada.');
                const newUrl = window.location.pathname; 
                window.history.replaceState({}, document.title, newUrl);
            } else {
                console.error('❌ [Global] Error restaurando sesión:', error);
            }
        }
      } catch (err) {
          console.warn('⚠️ Error en recuperación de sesión:', err);
      }
  })();
}

function setupLogoutButton() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await window.supabase.auth.signOut();
            clearAllAuthData();
            window.location.href = window.location.pathname.includes('/') ? '../index.html' : './index.html';
        });
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupLogoutButton);
else setupLogoutButton();