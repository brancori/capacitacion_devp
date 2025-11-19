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

    // 1. FORZAR SIRESI EN LOCALHOST PARA PRUEBAS
    if (host === 'localhost' || host === '127.0.0.1') {
       console.log('🔧 Modo Desarrollo: Forzando tenant "siresi"');
       return 'siresi'; // <--- AQUÍ ESTA EL CAMBIO. Antes decía 'demo' o 'default'
    }

    // 2. Lógica normal para Producción (subdominios)
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
      const jsonPath = `${window.location.origin}/tenants/tenants.json`;
      console.log(`🔍 Buscando config de tenant en: ${jsonPath}`); // Log para depurar

      const response = await fetch(jsonPath, {
        cache: 'no-store'
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      const tenantConfig = data[this.tenantSlug] || data['default'] || {};
      console.log(`🎯 Tenant cargado: ${this.tenantSlug} | Config encontrada: ${!!data[this.tenantSlug]}`);

      // Merge inteligente de configuración
this.currentConfig = {
        ...TENANT_DEFAULTS,
        ...tenantConfig,
        colors: {
          ...TENANT_DEFAULTS.colors,
          ...(tenantConfig.colors || {})
        }
      };

      this.currentConfig.tenantSlug = this.tenantSlug;
      
      return this.currentConfig;
    } catch (error) {
      console.error('❌ Error CRÍTICO cargando tenant:', error);
      this.currentConfig = { ...TENANT_DEFAULTS, tenantSlug: 'default' };
      return this.currentConfig;
    }
  }

  // Aplica los estilos CSS del tenant
async loadFromJson() {
    try {
      this.tenantSlug = this.detectTenant();
      
      // ✅ USAR RUTA ABSOLUTA: Esto busca siempre desde la raíz del dominio
      const jsonPath = `${window.location.origin}/tenants/tenants.json`;
      
      console.log(`🔍 Buscando config en: ${jsonPath}`);

      const response = await fetch(jsonPath, {
        cache: 'no-store'
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

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
      
      return this.currentConfig;
    } catch (error) {
      console.warn('⚠️ Error al cargar tenant config:', error);
      this.currentConfig = { ...TENANT_DEFAULTS, tenantSlug: 'default' };
      return this.currentConfig;
    }
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