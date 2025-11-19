// tenant-manager.js - VERSIÓN AGRESIVA (DEBUG & FORCE)

const TENANT_DEFAULTS = {
  companyName: "Aula Corporativa",
  colors: { primary: "#234B95", secondary: "#1F3F7A" },
  bgPage: "#141E30",
  textPage: "#ffffff",
  bgBrand: "#ffffff",
  textBrand: "#33374d",
  bgForm: "rgba(0, 0, 0, 0.3)",
  textForm: "#ffffff"
};

class TenantManager {
  constructor() {
    this.currentConfig = null;
    this.tenantSlug = null;
  }

  detectTenant() {
    const host = location.hostname;
    console.log(`🕵️‍♂️ Host detectado: "${host}"`);

    // 1. FORZAR SIRESI EN LOCALHOST
    if (host === 'localhost' || host === '127.0.0.1') {
       console.warn('🔧 MODO LOCAL: Forzando tenant "siresi"');
       return 'siresi'; 
    }

    // 2. PRODUCCIÓN (Subdominios)
    const parts = host.split('.');
    // Ej: siresi.aulacorporativa.com -> parts[0] = 'siresi'
    if (parts.length > 2 && parts[0] !== 'www') {
        console.log(`🌍 Subdominio detectado: "${parts[0]}"`);
        return parts[0];
    }
    
    console.warn('⚠️ No se detectó subdominio, usando "default"');
    return 'default';
  }

  async loadFromJson() {
    try {
      this.tenantSlug = this.detectTenant();
      
      // RUTA ABSOLUTA CONFIRMADA
      const jsonPath = `${window.location.origin}/tenants/tenants.json`;
      console.log(`📥 Descargando configuración de: ${jsonPath}`);

      const response = await fetch(jsonPath, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      
      // Verificar si existe el tenant
      if (!data[this.tenantSlug]) {
          console.error(`❌ EL TENANT "${this.tenantSlug}" NO EXISTE EN EL JSON. Usando default.`);
          this.tenantSlug = 'default';
      } else {
          console.log(`✅ CONFIGURACIÓN ENCONTRADA para: "${this.tenantSlug}"`);
      }

      const tenantConfig = data[this.tenantSlug] || data['default'];

      this.currentConfig = {
        ...TENANT_DEFAULTS,
        ...tenantConfig,
        colors: { ...TENANT_DEFAULTS.colors, ...(tenantConfig.colors || {}) },
        // Compatibilidad si los colores vienen sueltos
        ...(tenantConfig.primaryColor ? { 
            colors: { 
                primary: tenantConfig.primaryColor, 
                secondary: tenantConfig.secondaryColor || tenantConfig.primaryColor 
            } 
        } : {})
      };
      
      return this.currentConfig;
    } catch (error) {
      console.error('💀 ERROR FATAL CARGANDO TENANT:', error);
      this.currentConfig = { ...TENANT_DEFAULTS, tenantSlug: 'default' };
      return this.currentConfig;
    }
  }

  applyStyles() {
    const cfg = this.currentConfig || TENANT_DEFAULTS;
    const root = document.documentElement;

    console.group("🎨 APLICANDO ESTILOS (Modo Agresivo)");
    console.log("Primary Color:", cfg.colors.primary);
    console.log("Background:", cfg.bgPage);
    
    // 1. INYECTAR VARIABLES (Con !important por si acaso)
    root.style.setProperty('--primaryColor', cfg.colors.primary);
    root.style.setProperty('--secondaryColor', cfg.colors.secondary);
    root.style.setProperty('--bgPage', cfg.bgPage);
    root.style.setProperty('--textPage', cfg.textPage);
    
    // 2. FUERZA BRUTA: Sobreescribir estilos directos al body
    // Esto vence a cualquier archivo CSS que tenga estilos "duros"
    document.body.style.background = cfg.bgPage;
    document.body.style.color = cfg.textPage;
    document.body.style.fontFamily = "'Segoe UI', sans-serif";

    // 3. Aplicar Logo y Textos
    this.applyBrandingUI(cfg);
    
    console.log("✨ Estilos aplicados forzosamente.");
    console.groupEnd();
  }

  applyBrandingUI(cfg) {
    const logoIcon = document.getElementById('logoIcon');
    const logoText = document.getElementById('logoText');
    
    if (logoIcon) {
      if (cfg.logoUrl) {
           logoIcon.innerHTML = `<img src="${cfg.logoUrl}" alt="Logo" style="max-width:100%; height: auto;" />`;
           logoIcon.style.background = "transparent"; 
           logoIcon.style.border = "none";
      } else {
           logoIcon.textContent = cfg.logoText || 'AC';
      }
    }
    if (logoText) logoText.textContent = cfg.companyName;
    document.title = `${cfg.companyName} - Curso`;
  }
}

const tenantManager = new TenantManager();
window.tenantManager = tenantManager;