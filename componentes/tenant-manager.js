// tenant-manager.js
// Sistema centralizado de gestión de tenants y estilos

const TENANT_DEFAULTS = {
  companyName: "Aula Corporativa",
  logoText: "AC",
  logoUrl: null,
  tagline: "¡Bienvenido!",
  description: "Accede a tu plataforma de capacitación corporativa.",
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
  inputTheme: "dark",
  bgSuccess: "linear-gradient(135deg, #06d6a0, #1b9aaa)",
  bgError: "linear-gradient(135deg, #ef476f, #b30f20)",
  bgOverlay: "rgba(0, 0, 0, 0.7)",
  backgroundImage: `linear-gradient(to bottom, #141E30, #243B55)`,
  animatedBackground: false
};

class TenantManager {
  constructor() {
    this.currentConfig = null;
    this.tenantSlug = null;
  }

  // Detecta el tenant desde el hostname o parámetros
  detectTenant() {
    const host = location.hostname || 'localhost';
    if (host === 'localhost') return 'demo';
    if (host === '127.0.0.1') return 'default';
    const parts = host.split('.');
    if (parts.length > 2 && parts[0] !== 'www') return parts[0];
    return 'default';
  }

  // Carga configuración del tenant desde tenants.json (para estilos)
  async loadFromJson() {
    try {
      this.tenantSlug = this.detectTenant();
      
      // ✅ CORRECCIÓN CRÍTICA: Ruta Absoluta
      // Esto asegura que funcione tanto en /index.html como en /pages/curso/curso.html
      const jsonPath = `${window.location.origin}/componentes/tenants.json`;
      console.log(`🔍 Buscando config de tenant en: ${jsonPath}`); // Log para depurar

      const response = await fetch(jsonPath, {
        cache: 'no-store'
      });
      
      if (!response.ok) throw new Error('Tenant config not found');

      const data = await response.json();
      const tenantConfig = data[this.tenantSlug] || data['default'] || {};

      // Merge inteligente de configuración
      this.currentConfig = {
        ...TENANT_DEFAULTS,
        ...tenantConfig,
        colors: {
          ...TENANT_DEFAULTS.colors,
          ...(tenantConfig.colors || {})
        },
        // Soporte retrocompatible para cuando el JSON no usa objeto 'colors'
        ...(tenantConfig.primaryColor ? { 
            colors: { 
                primary: tenantConfig.primaryColor, 
                secondary: tenantConfig.secondaryColor || tenantConfig.primaryColor 
            } 
        } : {})
      };

      this.currentConfig.tenantSlug = this.tenantSlug;
      console.log(`✅ Tenant Configurado (JSON): ${this.currentConfig.companyName}`);
      
      return this.currentConfig;
    } catch (error) {
      console.warn('⚠️ Error al cargar tenant config:', error);
      this.currentConfig = { ...TENANT_DEFAULTS, tenantSlug: 'default' };
      return this.currentConfig;
    }
  }

  // Aplica los estilos CSS del tenant
  applyStyles(config = null) {
    const cfg = config || this.currentConfig || TENANT_DEFAULTS;
    
    // Normalización de colores
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

    // Aplicar fondo animado o imagen si existe
    if (cfg.backgroundImage) {
      // Intenta aplicarlo al body para asegurar cobertura total
      document.body.style.background = cfg.backgroundImage;
      
      // También a elementos específicos si existen
      const platformEl = document.querySelector('.course-platform');
      if (platformEl) platformEl.style.background = cfg.backgroundImage;
    }

    console.log('🎨 Estilos del tenant aplicados correctamente');
  }

  // ✅ NUEVA FUNCIÓN: Aplica Logo y Textos automáticamente en el HTML
  applyBrandingUI() {
    const cfg = this.currentConfig || TENANT_DEFAULTS;
    
    // Buscar elementos comunes de logo (IDs usados en index.html y curso.html)
    const logoIcon = document.getElementById('logoIcon');
    const logoText = document.getElementById('logoText');
    const courseTitle = document.getElementById('courseTitle'); // Para el header del curso
    
    // Lógica de Logo
    if (logoIcon) {
      if (cfg.logoUrl) {
           logoIcon.innerHTML = `<img src="${cfg.logoUrl}" alt="Logo" style="max-width:100%; height: auto;" />`;
      } else {
           logoIcon.textContent = cfg.logoText || 'AC';
      }
    }

    if (logoText) logoText.textContent = cfg.companyName;
    
    // Ajustar título de la pestaña del navegador
    document.title = `${cfg.companyName} - Plataforma`;
  }

  // Utilidad para establecer variables CSS
  setStyle(prop, value) {
    if (value) {
      document.documentElement.style.setProperty(prop, value);
    }
  }

  getConfig() {
    return this.currentConfig || TENANT_DEFAULTS;
  }
}

// Exportar instancia singleton
const tenantManager = new TenantManager();
window.tenantManager = tenantManager;