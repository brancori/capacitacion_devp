// componentes/supabase-client.js
// VERSIÓN 5.0.0: PROXY OBLIGATORIO PARA ENTORNOS CORPORATIVOS

// ✅ SIEMPRE usar proxy relativo
const SUPABASE_URL = '/api';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2d3lncG51dW51dXlsem9uZHh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NDUzMTEsImV4cCI6MjA3NjEyMTMxMX0.FxjCX9epT_6LgWGdzdPhRUTP2vn4CLdixRqpFMRZK70';

// ============================================
// SAFE STORAGE (Fix Tracking Prevention)
// ============================================
window.safeStorage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('⚠️ localStorage bloqueado, usando memoria');
      return window.__memStorage?.[key] || null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      if (!window.__memStorage) window.__memStorage = {};
      window.__memStorage[key] = value;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      if (window.__memStorage) delete window.__memStorage[key];
    }
  }
};

// ============================================
// DETECCIÓN DE TENANT
// ============================================
function detectTenant() {
  const host = location.hostname || 'localhost';
  if (host === 'localhost' || host === '127.0.0.1') return 'demo';
  const parts = host.split('.');
  return (parts.length > 2 && parts[0] !== 'www') ? parts[0] : 'default';
}

// ============================================
// LIMPIEZA DE DATOS
// ============================================
function clearAllAuthData() {
  const keysToRemove = ['tenantTheme', 'tenantSlug', 'current_tenant', 'app_version'];
  keysToRemove.forEach(key => window.safeStorage.remove(key));

  try {
    document.cookie = 'sb-hvwygpnuunuuylzondxt-auth-token=;path=/;max-age=0';
  } catch (e) {
    console.warn('No se pudo limpiar cookie');
  }
}

// ============================================
// INICIALIZACIÓN CON ESPERA
// ============================================
async function initSupabaseClient() {
  let attempts = 0;
  const maxAttempts = 30; // 3 segundos

  while (attempts < maxAttempts) {
    if (typeof window.supabase?.createClient === 'function') {
      console.log('✅ Supabase detectado del CDN');
      setupClient();
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }

  console.error('❌ Supabase no se cargó. Verifica tu conexión o firewall.');
}

// ============================================
// CONFIGURACIÓN DEL CLIENTE
// ============================================
function setupClient() {
  const clientOptions = {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: {
        getItem: (key) => window.safeStorage.get(key),
        setItem: (key, value) => window.safeStorage.set(key, value),
        removeItem: (key) => window.safeStorage.remove(key)
      }
    },
    global: {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
      }
    }
  };

  window.supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    clientOptions
  );

  console.log('✅ Cliente Supabase inicializado (Storage seguro + Proxy compatible)');

  recoverSessionFromUrl();
}

// ============================================
// RECUPERACIÓN DE SESIÓN
// ============================================
async function recoverSessionFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || params.get('access_token');

    if (token) {
      console.log('🔄 Token detectado, restaurando sesión...');

      const { error } = await window.supabase.auth.setSession({
        access_token: token,
        refresh_token: 'dummy-refresh-token'
      });

      if (!error) {
        console.log('✅ Sesión restaurada');

        // Limpiar URL (mantener hash si existe)
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      } else {
        console.error('❌ Error restaurando sesión:', error);
      }
    }
  } catch (err) {
    console.warn('⚠️ Error en recuperación:', err);
  }
}

// ============================================
// LOGOUT GLOBAL
// ============================================
function setupLogoutButton() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await window.supabase.auth.signOut();
      } catch (err) {
        console.warn('Error en signOut:', err);
      }
      clearAllAuthData();

      // Detectar ruta para redirección
      const isInSubfolder = window.location.pathname.includes('/profile') ||
                           window.location.pathname.includes('/dashboard');
      window.location.href = isInSubfolder ? '../index.html' : './index.html';
    });
  }
}

// ============================================
// INICIALIZACIÓN
// ============================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initSupabaseClient();
    setupLogoutButton();
  });
} else {
  initSupabaseClient();
  setupLogoutButton();
}