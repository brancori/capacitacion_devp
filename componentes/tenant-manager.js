// tenant-manager.js
// Sistema centralizado de gestión de tenants y estilos

const TENANT_DEFAULTS = {
  companyName: "Aula Corporativa",
  logoText: "AC",
  logoUrl: null,
  tagline: "¡Bienvenido!",
  colors: {
    primary: "#234B95",
    secondary: "#1F3F7A"
  },
  bgPage: "#141E30",
  textPage: "#ffffff",
  bgBrand: "#ffffff",
  textBrand: "#33374d",
  bgForm: "rgba(0, 0, 0, 0.3)",
  textForm: "#ffffff",
  bgSuccess: "linear-gradient(135deg, #06d6a0, #1b9aaa)",
  bgError: "linear-gradient(135deg, #ef476f, #b30f20)",
  bgOverlay: "rgba(0, 0, 0, 0.7)",
  backgroundImage: `linear-gradient(to bottom, #141E30, #243B55)`
};

class TenantManager {
  constructor() {
    this.currentConfig = null;
    this.tenantSlug = null;
  }

  detectTenant() {
    const host = location.hostname || 'localhost';
    if (host === 'localhost') return 'demo';
    if (host === '127.0.0.1') return 'default';
    const parts = host.split('.');
    if (parts.length > 2 && parts[0] !== 'www') return parts[0];
    return 'default';
  }

  async loadFromJson() {
    try {
      this.tenantSlug = this.detectTenant();
      
      // CORRECCIÓN 1: Ruta absoluta usando window.location.origin
      // Esto asegura que encuentre el archivo sin importar en qué subcarpeta estés.
      const jsonPath = `${window.location.origin}/tenants/tenants.json`;
      
      console.log(`🔍 Buscando config de tenant en: ${jsonPath}`);
      
      const response = await fetch(jsonPath, { cache: 'no-store' });
      
      if (!response.ok) throw new Error('Tenant config not found');

      const data = await response.json();
      const tenantConfig = data[this.tenantSlug] || data['default'] || {};

      // Merge recursivo simple para colores y defaults
      this.currentConfig = {
        ...TENANT_DEFAULTS,
        ...tenantConfig,
        colors: {
          ...TENANT_DEFAULTS.colors,
          ...(tenantConfig.colors || {}) // Prioridad al JSON
        },
        // Si el JSON plano tiene primaryColor fuera de 'colors', lo mapeamos también
        ...(tenantConfig.primaryColor ? { 
            colors: { 
                primary: tenantConfig.primaryColor, 
                secondary: tenantConfig.secondaryColor || tenantConfig.primaryColor 
            } 
        } : {})
      };

      this.currentConfig.tenantSlug = this.tenantSlug;
      return this.currentConfig;
    } catch (error) {
      console.warn('⚠️ Error cargando tenant config (usando defaults):', error);
      this.currentConfig = { ...TENANT_DEFAULTS, tenantSlug: 'default' };
      return this.currentConfig;
    }
  }

  // Aplica variables CSS
  applyStyles(config = null) {
    const cfg = config || this.currentConfig || TENANT_DEFAULTS;
    
    // Normalizar obtención de colores (por si vienen del JSON plano o del objeto colors)
    const primary = cfg.colors?.primary || cfg.primaryColor || TENANT_DEFAULTS.colors.primary;
    const secondary = cfg.colors?.secondary || cfg.secondaryColor || TENANT_DEFAULTS.colors.secondary;

    this.setStyle('--primaryColor', primary);
    this.setStyle('--secondaryColor', secondary);
    this.setStyle('--bgPage', cfg.bgPage);
    this.setStyle('--textPage', cfg.textPage);
    this.setStyle('--bgBrand', cfg.bgBrand);
    this.setStyle('--textBrand', cfg.textBrand);
    this.setStyle('--bgForm', cfg.bgForm);
    this.setStyle('--textForm', cfg.textForm);
    this.setStyle('--bgSuccess', cfg.bgSuccess);
    this.setStyle('--bgError', cfg.bgError);
    this.setStyle('--bgOverlay', cfg.bgOverlay);

    if (cfg.backgroundImage) {
        // Intentar aplicar al body o contenedor principal
        document.body.style.background = cfg.backgroundImage;
        const platformEl = document.querySelector('.course-platform');
        if(platformEl) platformEl.style.background = cfg.backgroundImage;
    }
  }

  // NUEVA FUNCIÓN: Aplica Logo y Textos (Igual que index.js)
  applyBrandingUI() {
      const cfg = this.currentConfig || TENANT_DEFAULTS;
      
      // Buscar elementos comunes de logo
      const logoIcon = document.getElementById('logoIcon'); // Si existe en curso.html
      const logoText = document.getElementById('logoText'); // Si existe en curso.html
      
      // Lógica de Logo
      if (logoIcon) {
        if (cfg.logoUrl) {
             logoIcon.innerHTML = `<img src="${cfg.logoUrl}" alt="Logo" style="max-width:100%; height: auto;" />`;
        } else {
             logoIcon.textContent = cfg.logoText || cfg.logoText || 'AC';
        }
      }

      if (logoText) logoText.textContent = cfg.companyName;
      
      // Ajustar Favicon dinámicamente si fuera necesario
      // document.title = `${cfg.companyName} - Curso`;
  }

  setStyle(prop, value) {
    if (value) document.documentElement.style.setProperty(prop, value);
  }
}

const tenantManager = new TenantManager();
window.tenantManager = tenantManager;