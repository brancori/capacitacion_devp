/* componentes/supabase-client.js - VERSIÓN FINAL CORREGIDA */
console.log('🔄 Inicializando Core Client (DB + Branding)...');

// ═══════════════════════════════════════════════════════════
// 1. CONFIGURACIÓN POR DEFECTO (COMPLETA)
// ═══════════════════════════════════════════════════════════
const DEFAULTS = {
    companyName: "Aula Corporativa",
    logoText: "AC",
    logoUrl: null,
    tagline: "¡Bienvenido!",
    description: "Accede a tu plataforma de capacitación corporativa.",
    
    // Colores
    bgPage: "#141E30",
    textPage: "#ffffff",
    primaryColor: "#234B95",
    secondaryColor: "#1F3F7A",
    bgBrand: "#ffffff",
    textBrand: "#33374d",
    bgForm: "rgba(0, 0, 0, 0.3)",
    textForm: "#ffffff",
    
    // Variables extra que faltaban
    bgSuccess: "linear-gradient(135deg, #06d6a0, #1b9aaa)",
    bgError: "linear-gradient(135deg, #ef476f, #b30f20)",
    bgOverlay: "rgba(0, 0, 0, 0.7)",
    
    // Configuración UI
    inputTheme: "dark",
    backgroundImage: "linear-gradient(to bottom, #141E30, #243B55)",
    animatedBackground: true,
    
    // Labels del Login
    labels: {
      empUser: "Usuario",
      empPass: "Contraseña",
      conUser: "ID Contratista",
      conPass: "Contraseña"
    },
    successRedirect: "profile/profile.html"
};

// ═══════════════════════════════════════════════════════════
// 2. DETECCIÓN DE TENANT (Global)
// ═══════════════════════════════════════════════════════════
(function detectGlobalTenant() {
    const params = new URLSearchParams(window.location.search);
    const host = window.location.hostname;
    
    // 1. URL (?tenant=x)
    if (params.has('tenant')) window.CURRENT_TENANT = params.get('tenant');
    // 2. Localhost -> FORZAR SIRESI (Dev Environment)
    else if (host === 'localhost' || host === '127.0.0.1') window.CURRENT_TENANT = 'siresi';
    // 3. Subdominio
    else window.CURRENT_TENANT = host.split('.')[0];
    
    console.log(`🎯 Tenant Detectado: ${window.CURRENT_TENANT}`);
})();

// ═══════════════════════════════════════════════════════════
// 3. SISTEMA DE BRANDING (TenantSystem)
// ═══════════════════════════════════════════════════════════
const TenantSystem = {
    async loadAndApply() {
        try {
            const resp = await fetch(window.location.origin + '/tenants/tenants.json');
            const data = await resp.json();
            
            // Mezclar: Defaults <- JSON Default <- JSON Tenant Específico
            const jsonDefault = data['default'] || {};
            const jsonTenant = data[window.CURRENT_TENANT] || {};
            
            // Merge profundo para 'labels'
            const config = { 
                ...DEFAULTS, 
                ...jsonDefault, 
                ...jsonTenant,
                labels: { ...DEFAULTS.labels, ...(jsonDefault.labels || {}), ...(jsonTenant.labels || {}) }
            };
            config.tenantSlug = window.CURRENT_TENANT;

            console.log(`🎨 Aplicando estilos completos de: ${window.CURRENT_TENANT}`);
            this.applyVariables(config);
            this.updateDOM(config);
            
            // Exponemos la config final a la ventana (importante para index.js)
            window.APP_CONFIG = config;
            window.__loginRedirect = config.successRedirect;

        } catch (e) { 
            console.error('⚠️ Error cargando branding (usando defaults):', e);
            this.applyVariables(DEFAULTS);
            this.updateDOM(DEFAULTS);
            window.APP_CONFIG = DEFAULTS;
        }
    },
    
    applyVariables(cfg) {
        const root = document.documentElement.style;
        const set = (k, v) => { if(v) root.setProperty(k, v); };

        set('--primaryColor', cfg.primaryColor);
        set('--secondaryColor', cfg.secondaryColor);
        set('--bgPage', cfg.bgPage);
        set('--textPage', cfg.textPage);
        set('--bgBrand', cfg.bgBrand);
        set('--textBrand', cfg.textBrand);
        set('--bgForm', cfg.bgForm);
        set('--textForm', cfg.textForm);
        
        // Variables extra
        set('--bgSuccess', cfg.bgSuccess);
        set('--bgError', cfg.bgError);
        set('--bgOverlay', cfg.bgOverlay);
        
        if (cfg.backgroundImage) set('--backgroundImage', cfg.backgroundImage);

        // Tema de Inputs (Dark/Light)
        document.body.dataset.inputTheme = cfg.inputTheme || 'dark';
    },

    updateDOM(cfg) {
        const getEl = (id) => document.getElementById(id);
        const setTxt = (id, txt) => { const el = getEl(id); if(el) el.textContent = txt; };

        // 1. Logo (Texto o Imagen)
        const logoIcon = getEl('logoIcon');
        if(logoIcon) {
            if (cfg.logoUrl) {
                logoIcon.innerHTML = `<img src="${cfg.logoUrl}" alt="Logo" style="max-width:100%; height: auto; object-fit:contain;" />`;
                logoIcon.style.background = 'transparent';
                logoIcon.style.border = 'none';
            } else {
                logoIcon.textContent = cfg.logoText || 'AC';
                logoIcon.style.removeProperty('background'); // Reset por si acaso
                logoIcon.style.removeProperty('border');
            }
        }

        // 2. Textos de Marca
        setTxt('logoText', cfg.logoText);
        setTxt('brandTitle', cfg.tagline);
        setTxt('brandDescription', cfg.description);

        // 3. Header de Profile (Caso especial)
        const compName = getEl('companyName');
        if(compName) compName.innerHTML = `<i class="fas fa-graduation-cap"></i> ${cfg.companyName}`;

        // 4. Labels de Login (Solo existen en index.html)
        if (cfg.labels) {
            setTxt('labelEmpUser', cfg.labels.empUser);
            setTxt('labelEmpPass', cfg.labels.empPass);
            setTxt('labelConUser', cfg.labels.conUser);
            setTxt('labelConPass', cfg.labels.conPass);
        }

        // 5. Footer Año
        setTxt('currentYear', new Date().getFullYear());

        // 6. Fondos Animados
        const bgAnim = document.querySelector('.bg-animated');
        if (bgAnim && cfg.backgroundImage) {
            bgAnim.style.background = cfg.backgroundImage;
        }
        
        const orbs = document.querySelector('.bg-orbs');
        if (orbs) {
            orbs.style.display = cfg.animatedBackground === false ? 'none' : 'block';
        }
    }
};

// ═══════════════════════════════════════════════════════════
// 4. INICIALIZACIÓN SUPABASE
// ═══════════════════════════════════════════════════════════
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const REAL_URL = 'https://hvwygpnuunuuylzondxt.supabase.co';
const SUPABASE_URL = IS_LOCAL ? REAL_URL : (window.location.origin + '/api');
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2d3lncG51dW51dXlsem9uZHh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NDUzMTEsImV4cCI6MjA3NjEyMTMxMX0.FxjCX9epT_6LgWGdzdPhRUTP2vn4CLdixRqpFMRZK70';

window.__memStorage = window.__memStorage || {};
window.safeStorage = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return window.__memStorage[key] || null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch (e) { } window.__memStorage[key] = value; },
  remove(key) { try { localStorage.removeItem(key); } catch (e) {} delete window.__memStorage[key]; }
};

function initSupabaseClient() {
  if (window.supabase && typeof window.supabase.functions?.invoke === 'function') {
      console.log('⚡ Cliente Supabase ya estaba activo.');
      TenantSystem.loadAndApply(); // Asegurar carga de estilos aunque ya exista supabase
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
        global: { headers: { "apikey": SUPABASE_ANON_KEY } }
      };

      if (!IS_LOCAL) clientOptions.functions = { url: SUPABASE_URL + '/functions/v1' };

      window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions);
      console.log(`✅ Cliente Supabase inicializado.`);
      
      // 🔥 CARGA DE ESTILOS AUTOMÁTICA
      TenantSystem.loadAndApply();
      
      setupLogoutButton();
    } else {
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