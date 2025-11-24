// componentes/supabase-client.js - VERSIÓN FINAL COMPATIBLE CON index.js

// 1. URL Directa (Evita error de WebSocket/Proxy)
const SUPABASE_URL = 'https://hvwygpnuunuuylzondxt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2d3lncG51dW51dXlsem9uZHh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NDUzMTEsImV4cCI6MjA3NjEyMTMxMX0.FxjCX9epT_6LgWGdzdPhRUTP2vn4CLdixRqpFMRZK70';

const APP_VERSION = '3.0.4';

// ... (Funciones de limpieza y detección de tenant iguales) ...
function detectTenant() {
  const host = location.hostname || 'localhost';
  if (host === 'localhost' || host === '127.0.0.1') return 'demo';
  const parts = host.split('.');
  return (parts.length > 2 && parts[0] !== 'www') ? parts[0] : 'default';
}

function clearAllAuthData() {
  // ... (Misma lógica de limpieza que tenías) ...
  const keysToRemove = ['tenantTheme', 'tenantSlug', 'current_tenant', 'app_version'];
  keysToRemove.forEach(key => localStorage.removeItem(key));
}

// Inicialización del Cliente
if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
  console.error('❌ La librería de Supabase no está cargada.');
} else {
  window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // Lo hacemos manual abajo
      storage: {
        getItem: (key) => {
            const v = document.cookie.match('(^|;)\\s*' + key + '\\s*=\\s*([^;]+)');
            return v ? decodeURIComponent(v.pop()) : null;
        },
        setItem: (key, value) => {
            document.cookie = `${key}=${encodeURIComponent(value)};path=/;max-age=31536000;SameSite=Lax`;
        },
        removeItem: (key) => {
            document.cookie = `${key}=;path=/;max-age=0`;
        }
      }
    }
  });
  console.log('✅ Cliente Supabase (Fix Móvil + WebSocket)');

  // ============================================================
  // 🔥 AUTORECUPERACIÓN INTELIGENTE (COMPATIBLE CON index.js)
  // ============================================================
  (async function recoverSessionFromUrl() {
      const params = new URLSearchParams(window.location.search);
      
      // 1. Buscamos 'token' (lo que envía tu index.js) O 'access_token' (estándar)
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
              // Limpiar la URL visualmente
              const newUrl = window.location.pathname; 
              window.history.replaceState({}, document.title, newUrl);
          } else {
              console.error('❌ [Global] Error restaurando sesión:', error);
          }
      }
  })();
}

// ... (Código del botón Logout igual) ...
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