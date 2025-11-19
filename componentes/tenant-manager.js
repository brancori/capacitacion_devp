// tenant-manager.js - VERSIÓN FUERZA BRUTA

const TENANT_DEFAULTS = {
  companyName: "Aula Corporativa",
  colors: { primary: "#234B95", secondary: "#1F3F7A" }, // Azul default
  bgPage: "#141E30",
  textPage: "#ffffff"
};

class TenantManager {
  constructor() {
    this.currentConfig = null;
    this.tenantSlug = null;
  }

  detectTenant() {
    const host = location.hostname;
    // Forzar siresi en local
    if (host === 'localhost' || host === '127.0.0.1') return 'siresi';
    
    // Producción
    const parts = host.split('.');
    if (parts.length > 2 && parts[0] !== 'www') return parts[0];
    
    return 'default';
  }

  async loadFromJson() {
    try {
      this.tenantSlug = this.detectTenant();
      
      // RUTA ABSOLUTA
      const jsonPath = `${window.location.origin}/tenants/tenants.json`;
      console.log(`🔥 [TenantManager] Descargando: ${jsonPath}`);

      const response = await fetch(jsonPath, { cache: 'reload' });
      if (!response.ok) throw new Error('Error HTTP ' + response.status);

      const data = await response.json();
      
      // Si no encuentra el tenant, usa default
      const config = data[this.tenantSlug] || data['default'];
      
      console.log(`✅ [TenantManager] Config cargada para: ${this.tenantSlug}`, config);

      // Unificar estructura
      this.currentConfig = {
        ...TENANT_DEFAULTS,
        ...config,
        colors: { ...TENANT_DEFAULTS.colors, ...(config.colors || {}) },
        // Soporte para JSON plano (sin objeto colors)
        ...(config.primaryColor ? { 
             colors: { primary: config.primaryColor, secondary: config.secondaryColor } 
        } : {})
      };
      
      return this.currentConfig;
    } catch (e) {
      console.error('❌ [TenantManager] Error fatal:', e);
      this.currentConfig = { ...TENANT_DEFAULTS };
      return this.currentConfig;
    }
  }

  applyStyles() {
    const cfg = this.currentConfig;
    if (!cfg) return;

    console.log("🎨 [TenantManager] Inyectando estilos FUERZA BRUTA...");
    
    // 1. Aplicar textos y logo
    const logoText = document.getElementById('logoText');
    const logoIcon = document.getElementById('logoIcon');
    if (logoText) logoText.textContent = cfg.companyName;
    if (logoIcon && cfg.logoUrl) {
        logoIcon.innerHTML = `<img src="${cfg.logoUrl}" style="max-width:100%">`;
        logoIcon.style.background = 'transparent';
        logoIcon.style.border = 'none';
    }

    // 2. INYECCIÓN CSS AGRESIVA (Overrides)
    // Creamos un <style> dinámico para ganar la guerra de especificidad
    const styleId = 'tenant-styles-override';
    let styleTag = document.getElementById(styleId);
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = styleId;
        document.head.appendChild(styleTag);
    }

    // Definimos las variables con !important
    const cssRules = `
        :root {
            --primaryColor: ${cfg.colors.primary} !important;
            --secondaryColor: ${cfg.colors.secondary} !important;
            --bgPage: ${cfg.bgPage} !important;
            --textPage: ${cfg.textPage} !important;
            --bgBrand: ${cfg.bgBrand || '#fff'} !important;
            --textBrand: ${cfg.textBrand || '#333'} !important;
        }
        /* Forzar fondo del body */
        body {
            background: ${cfg.bgPage} !important;
            color: ${cfg.textPage} !important;
        }
        /* Borde de depuración para confirmar que cargó (opcional) */
        body::before {
            content: 'Tenant: ${this.tenantSlug}';
            position: fixed; top: 0; left: 0; 
            background: red; color: white; z-index: 99999; padding: 5px;
            font-size: 10px; opacity: 0.7;
        }
    `;
    
    styleTag.innerHTML = cssRules;
    console.log("✨ Estilos inyectados con éxito.");
  }
}

// Inicializar
window.tenantManager = new TenantManager();f