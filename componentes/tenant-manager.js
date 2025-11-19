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
      const response = await fetch('./tenants/tenants.json', {
        cache: 'no-store'
      });
      
      if (!response.ok) throw new Error('Tenant config not found');

      const data = await response.json();
      const tenantConfig = data[this.tenantSlug] || data['default'] || {};

      this.currentConfig = {
        ...TENANT_DEFAULTS,
        ...tenantConfig,
        colors: {
          ...TENANT_DEFAULTS.colors,
          ...(tenantConfig.colors || {})
        }
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

  // Carga configuración del tenant desde Supabase (metadata de BD)
  async loadFromDatabase(tenantId) {
    try {
      if (!window.supabase) {
        throw new Error('Supabase client no disponible');
      }

      const { data, error } = await window.supabase
        .from('tenants')
        .select('metadata, slug, name')
        .eq('id', tenantId)
        .single();

      if (error) throw error;

      if (data && data.metadata) {
        // Combinar con defaults
        this.currentConfig = {
          ...TENANT_DEFAULTS,
          ...data.metadata,
          companyName: data.name || data.metadata.companyName || TENANT_DEFAULTS.companyName,
          tenantSlug: data.slug || this.tenantSlug,
          colors: {
            ...TENANT_DEFAULTS.colors,
            ...(data.metadata.colors || {})
          }
        };
        
        console.log(`✅ Tenant Configurado (DB): ${this.currentConfig.companyName}`);
        return this.currentConfig;
      }

      return this.currentConfig || TENANT_DEFAULTS;
    } catch (error) {
      console.warn('⚠️ Error al cargar tenant desde DB:', error);
      return this.currentConfig || TENANT_DEFAULTS;
    }
  }

  // Aplica los estilos CSS del tenant
  applyStyles(config = null) {
    const cfg = config || this.currentConfig || TENANT_DEFAULTS;
    
    this.setStyle('--primaryColor', cfg.colors?.primary || cfg.primaryColor);
    this.setStyle('--secondaryColor', cfg.colors?.secondary || cfg.secondaryColor);
    this.setStyle('--bgPage', cfg.bgPage);
    this.setStyle('--textPage', cfg.textPage);
    this.setStyle('--bgBrand', cfg.bgBrand);
    this.setStyle('--textBrand', cfg.textBrand);
    this.setStyle('--bgForm', cfg.bgForm);
    this.setStyle('--textForm', cfg.textForm);
    this.setStyle('--bgSuccess', cfg.bgSuccess);
    this.setStyle('--bgError', cfg.bgError);
    this.setStyle('--bgOverlay', cfg.bgOverlay);

    // Aplicar fondo animado si existe
    if (cfg.backgroundImage) {
      const platformEl = document.querySelector('.course-platform') || 
                         document.querySelector('.bg-animated') ||
                         document.body;
      if (platformEl) {
        platformEl.style.background = cfg.backgroundImage;
      }
    }

    console.log('🎨 Estilos del tenant aplicados');
  }

  // Utilidad para establecer variables CSS
  setStyle(prop, value) {
    if (value) {
      document.documentElement.style.setProperty(prop, value);
    }
  }

  // Obtiene la configuración actual
  getConfig() {
    return this.currentConfig || TENANT_DEFAULTS;
  }

  // Obtiene el slug del tenant actual
  getTenantSlug() {
    return this.tenantSlug || this.detectTenant();
  }
}

// Exportar instancia singleton
const tenantManager = new TenantManager();
window.tenantManager = tenantManager;

// Para módulos ES6
if (typeof module !== 'undefined' && module.exports) {
  module.exports = tenantManager;
}