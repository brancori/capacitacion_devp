// ═══════════════════════════════════════════════════════════
// SUPABASE CLIENT v6.0 - PROXY + SAFE STORAGE
// ═══════════════════════════════════════════════════════════

console.log('🔄 Inicializando supabase-client.js...');

const SUPABASE_URL = '/api';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2d3lncG51dW51dXlsem9uZHh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NDUzMTEsImV4cCI6MjA3NjEyMTMxMX0.FxjCX9epT_6LgWGdzdPhRUTP2vn4CLdixRqpFMRZK70';

// ═══════════════════════════════════════════════════════════
// SAFE STORAGE - CRÍTICO: Debe existir ANTES de cualquier uso
// ═══════════════════════════════════════════════════════════
window.__memStorage = window.__memStorage || {};

window.safeStorage = {
  get(key) {
    try {
      const val = localStorage.getItem(key);
      if (val !== null) return val;
    } catch (e) {
      console.warn(`⚠️ localStorage bloqueado para ${key}`);
    }
    return window.__memStorage[key] || null;
  },
  
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`⚠️ localStorage bloqueado para ${key}`);
    }
    window.__memStorage[key] = value;
  },
  
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
    delete window.__memStorage[key];
  }
};

console.log('✅ Safe Storage inicializado');

// ═══════════════════════════════════════════════════════════
// INICIALIZAR SUPABASE
// ═══════════════════════════════════════════════════════════
function initSupabaseClient() {
  let attempts = 0;
  const maxAttempts = 30;

  const tryInit = () => {
    if (typeof window.supabase?.createClient === 'function') {
      console.log('✅ Supabase CDN detectado');
      
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

      console.log('✅ Cliente de Supabase inicializado');
      setupLogoutButton();
      return;
    }

    attempts++;
    if (attempts < maxAttempts) {
      setTimeout(tryInit, 100);
    } else {
      console.error('❌ Supabase CDN no se cargó');
    }
  };

  tryInit();
}

// ═══════════════════════════════════════════════════════════
// LOGOUT GLOBAL
// ═══════════════════════════════════════════════════════════
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
      
      // Limpiar storage
      ['role', 'tenant', 'full_name', 'current_tenant', 'tenantTheme', 'tenantSlug'].forEach(key => {
        window.safeStorage.remove(key);
      });

      // Limpiar cookie
      try {
        document.cookie = 'sb-hvwygpnuunuuylzondxt-auth-token=;path=/;max-age=0';
      } catch(e) {}

      const isInSubfolder = window.location.pathname.includes('/profile') ||
                           window.location.pathname.includes('/dashboard');
      window.location.href = isInSubfolder ? '../index.html' : './index.html';
    });
  }
}

// ═══════════════════════════════════════════════════════════
// AUTO-INIT
// ═══════════════════════════════════════════════════════════
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupabaseClient);
} else {
  initSupabaseClient();
}

console.log('✅ supabase-client.js cargado');