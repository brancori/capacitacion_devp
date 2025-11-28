/* componentes/supabase-client.js */
console.log('🔄 Inicializando supabase-client.js...');

// DETECCIÓN DE ENTORNO
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// URL REAL DE SUPABASE (Extraída de tu diagnostic.html)
const REAL_URL = 'https://hvwygpnuunuuylzondxt.supabase.co';

// EN LOCAL: Conexión directa. EN PROD: Usar Proxy /api
const SUPABASE_URL = IS_LOCAL ? REAL_URL : (window.location.origin + '/api');
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2d3lncG51dW51dXlsem9uZHh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NDUzMTEsImV4cCI6MjA3NjEyMTMxMX0.FxjCX9epT_6LgWGdzdPhRUTP2vn4CLdixRqpFMRZK70';

// ═══════════════════════════════════════════════════════════
// SAFE STORAGE
// ═══════════════════════════════════════════════════════════
window.__memStorage = window.__memStorage || {};

window.safeStorage = {
  get(key) {
    try { return localStorage.getItem(key); } catch (e) { return window.__memStorage[key] || null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { }
    window.__memStorage[key] = value;
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
    delete window.__memStorage[key];
  }
};

// ═══════════════════════════════════════════════════════════
// INICIALIZAR SUPABASE
// ═══════════════════════════════════════════════════════════
function initSupabaseClient() {
  if (window.supabase && typeof window.supabase.functions?.invoke === 'function') {
      console.log('⚡ Cliente Supabase ya estaba activo.');
      return; 
  }

  const tryInit = () => {
    if (typeof window.supabase?.createClient === 'function') {
      
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
            "x-application-name": "siresi-client"
          }
        }
      };

      // Configuración de Edge Functions
      if (!IS_LOCAL) {
          // Solo usar proxy para funciones si NO estamos en local
          clientOptions.functions = { url: SUPABASE_URL + '/functions/v1' };
      }

      console.log('🌐 Conectando Supabase a:', SUPABASE_URL);

      window.supabase = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        clientOptions
      );

      console.log(`✅ Cliente Supabase inicializado (${IS_LOCAL ? 'Directo/Local' : 'Proxy/Prod'})`);
      setupLogoutButton();
    } else {
      console.log('⏳ Esperando librería Supabase...');
      setTimeout(tryInit, 100);
    }
  };
  tryInit();
}


function setupLogoutButton() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    const newBtn = logoutBtn.cloneNode(true);
    logoutBtn.parentNode.replaceChild(newBtn, logoutBtn);
    
    newBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await window.supabase.auth.signOut(); } catch (err) {}
      ['role', 'tenant', 'full_name', 'current_tenant', 'tenantTheme'].forEach(k => window.safeStorage.remove(k));
      document.cookie = 'sb-hvwygpnuunuuylzondxt-auth-token=;path=/;max-age=0';
      window.location.href = window.location.pathname.includes('/profile') ? '../index.html' : './index.html';
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupabaseClient);
} else {
  initSupabaseClient();
}