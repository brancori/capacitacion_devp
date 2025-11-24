// componentes/supabase-client.js

// 1. CORRECCIÓN WEBSOCKET: Usamos la URL directa para evitar bloqueos del proxy
const SUPABASE_URL = 'https://hvwygpnuunuuylzondxt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2d3lncG51dW51dXlsem9uZHh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NDUzMTEsImV4cCI6MjA3NjEyMTMxMX0.FxjCX9epT_6LgWGdzdPhRUTP2vn4CLdixRqpFMRZK70';

// ========== SISTEMA DE LIMPIEZA DE SESIONES ==========
const APP_VERSION = '3.0.3';

function detectTenant() {
  const host = location.hostname || 'localhost';
  if (host === 'localhost' || host === '127.0.0.1') return 'demo';
  const parts = host.split('.');
  return (parts.length > 2 && parts[0] !== 'www') ? parts[0] : 'default';
}

function clearAllAuthData() {
  console.log('🧹 Limpiando datos de autenticación...');
  
  const authCookies = [
    'sb-hvwygpnuunuuylzondxt-auth-token',
    'sb-access-token', 
    'sb-refresh-token'
  ];
  
  authCookies.forEach(cookie => {
    document.cookie = `${cookie}=;path=/;max-age=0;domain=${location.hostname}`;
    document.cookie = `${cookie}=;path=/;max-age=0;domain=.${location.hostname}`;
    document.cookie = `${cookie}=;path=/;max-age=0`;
  });
  
  const keysToRemove = ['tenantTheme', 'tenantSlug', 'current_tenant', 'app_version'];
  keysToRemove.forEach(key => localStorage.removeItem(key));
  
  console.log('✅ Datos limpiados');
}

function validateSession() {
  const currentTenant = detectTenant();
  const storedTenant = localStorage.getItem('current_tenant');
  const storedVersion = localStorage.getItem('app_version');
  
  if (storedTenant && storedTenant !== currentTenant) {
    console.warn(`⚠️ Cambio de tenant detectado: ${storedTenant} → ${currentTenant}`);
    clearAllAuthData();
    return false;
  }
  
  if (storedVersion && storedVersion !== APP_VERSION) {
    console.warn(`⚠️ Nueva versión detectada: ${storedVersion} → ${APP_VERSION}`);
    clearAllAuthData();
    return false;
  }
  
  localStorage.setItem('current_tenant', currentTenant);
  localStorage.setItem('app_version', APP_VERSION);
  
  return true;
}

validateSession();

// IMPORTANTE: Inicialización del Cliente
if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
  console.error('❌ La librería de Supabase no está cargada.');
} else {
  window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // Lo manejamos manualmente abajo
      storage: {
        getItem: (key) => {
          const v = document.cookie.match('(^|;)\\s*' + key + '\\s*=\\s*([^;]+)');
          return v ? decodeURIComponent(v.pop()) : null;
        },
        setItem: (key, value) => {
          // Intentamos guardar cookie (puede fallar en Safari/Incógnito)
          document.cookie = `${key}=${encodeURIComponent(value)};path=/;max-age=31536000;SameSite=Lax`;
        },
        removeItem: (key) => {
          document.cookie = `${key}=;path=/;max-age=0`;
        }
      }
    }
  });
  console.log('✅ Cliente de Supabase inicializado (Conexión Directa)');

  // ============================================================
  // 🔥 SOLUCIÓN MÓVIL CENTRALIZADA
  // Recuperar sesión desde la URL automáticamente en TODAS las páginas
  // ============================================================
  (async function recoverSessionFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
          console.log('🔄 [Global] Recuperando sesión desde parámetros URL...');
          
          const { error } = await window.supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
          });

          if (!error) {
              console.log('✅ [Global] Sesión restaurada exitosamente.');
              // Limpiar la URL para que el usuario no vea el token gigante
              const newUrl = window.location.pathname; // Mantiene la página actual pero quita ?query
              window.history.replaceState({}, document.title, newUrl);
          } else {
              console.error('❌ [Global] Error restaurando sesión:', error);
          }
      }
  })();
}

// --- Manejo del Logout ---
function setupLogoutButton() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      console.log('🚪 Cerrando sesión...');
      
      try {
        await window.supabase.auth.signOut();
        clearAllAuthData();
        const isSubfolder = window.location.pathname.split('/').length > 2;
        window.location.href = isSubfolder ? '../index.html' : './index.html';
        
      } catch (error) {
        console.error('⚠️ Error al cerrar sesión:', error.message);
        clearAllAuthData();
        const isSubfolder = window.location.pathname.split('/').length > 2;
        window.location.href = isSubfolder ? '../index.html' : './index.html';
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupLogoutButton);
} else {
  setupLogoutButton();
}