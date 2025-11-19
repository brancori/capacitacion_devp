
(function (global) {
  'use strict';

  // Evitar redefinir si ya existe y es igual
  if (global.tenantManager && global.tenantManager._isTrusted) {
    console.log('tenantManager: ya cargado (trusted).');
    return;
  }

  const tm = {
    _isTrusted: true,
    tenantSlug: 'default',
    config: null,

    // Detecta tenant por subdominio o por host
    detectTenant() {
      try {
        const host = location.hostname || 'localhost';
        if (host === 'localhost') return 'demo';
        if (host === '127.0.0.1') return 'default';
        const parts = host.split('.');
        if (parts.length > 2 && parts[0] !== 'www') return parts[0];
        return 'default';
      } catch (e) {
        console.warn('tenantManager.detectTenant error', e);
        return 'default';
      }
    },

    // Aplica estilos CSS usando variables CSS
    applyStyles(cfg = null) {
      try {
        const config = cfg || this.config;
        if (!config) return;
        const root = document.documentElement;
        const set = (k, v) => { if (v !== undefined && v !== null) root.style.setProperty(k, v); };

        set('--primaryColor', config.primaryColor);
        set('--secondaryColor', config.secondaryColor);
        set('--bgPage', config.bgPage);
        set('--textPage', config.textPage);
        set('--bgBrand', config.bgBrand);
        set('--textBrand', config.textBrand);
        set('--bgForm', config.bgForm);
        set('--textForm', config.textForm);

        // Si hay backgroundImage (puede ser linear-gradient o URL)
        if (config.backgroundImage) set('--backgroundImage', config.backgroundImage);

        // Nombre de compañía si existe en DOM (opcional)
        try {
          const companyNameEl = document.getElementById('companyName');
          if (companyNameEl && config.companyName) {
            // preservar iconos dentro del element
            const icon = companyNameEl.querySelector('i');
            companyNameEl.innerHTML = '';
            if (icon) companyNameEl.appendChild(icon);
            companyNameEl.appendChild(document.createTextNode(` ${config.companyName}`));
          }
        } catch (e) {
          // no crítico
        }

        console.log('tenantManager: estilos aplicados para', config.companyName || this.tenantSlug);
      } catch (e) {
        console.error('tenantManager.applyStyles error', e);
      }
    },

    // Carga desde tenants.json (ruta absoluta y con cache-bust)
    async loadFromJson(opts = {}) {
      const origin = window.location.origin;
      // permite sobrescribir path si te interesa
      const path = opts.path || `${origin}/tenants/tenants.json?v=final`;
      try {
        this.tenantSlug = this.detectTenant();
        console.log('tenantManager: intentando cargar tenants.json desde', path, '-> tenantSlug=', this.tenantSlug);

        const resp = await fetch(path, {
          cache: 'no-store',
          headers: { 'Accept': 'application/json' }
        });

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
        }

        const all = await resp.json();
        const cfg = all[this.tenantSlug] || all['default'] || null;
        if (!cfg) {
          console.warn('tenantManager: no se encontró configuración para', this.tenantSlug);
        }
        this.config = cfg || {};
        // Guardar copia en localStorage (opcional)
        try {
          localStorage.setItem('tenantTheme', JSON.stringify(this.config));
          localStorage.setItem('tenantSlug', this.tenantSlug);
        } catch (e) { /* noop */ }

        return this.config;
      } catch (err) {
        console.warn('tenantManager.loadFromJson fallo:', err);
        // intento fallback: si existiera un tenants.json en /tenants/tenants.json sin origin
        if (path.startsWith(window.location.origin)) {
          try {
            const fallback = await fetch('/tenants/tenants.json?v=final', { cache: 'no-store' });
            if (fallback.ok) {
              const all = await fallback.json();
              this.config = all[this.tenantSlug] || all['default'] || {};
              return this.config;
            }
          } catch (_) { /* noop */ }
        }
        // devolver objeto vacío para que la app no rompa
        this.config = {};
        return this.config;
      }
    },

    // Intento de cargar desde DB (Supabase). Si no hay Supabase, redirige a loadFromJson
    // Mantener firma para compatibilidad
    async loadFromDatabase(opts = {}) {
      try {
        if (window.supabase && typeof window.supabase.from === 'function') {
          console.log('tenantManager: intentando cargar tenant desde Supabase (tabla tenants)');
          // Suponemos tabla 'tenants' con columna 'slug'
          const slug = opts.slug || this.detectTenant();
          const { data, error } = await window.supabase
            .from('tenants')
            .select('*')
            .eq('slug', slug)
            .limit(1)
            .single();

          if (error) {
            console.warn('tenantManager: Supabase error, fallback a JSON', error);
            return await this.loadFromJson(opts);
          }
          // mapear columnas si hace falta
          this.tenantSlug = slug;
          this.config = data || {};
          localStorage.setItem('tenantTheme', JSON.stringify(this.config));
          return this.config;
        } else {
          console.log('tenantManager: supabase no disponible — usando tenants.json');
          return await this.loadFromJson(opts);
        }
      } catch (e) {
        console.warn('tenantManager.loadFromDatabase fallo, fallback a JSON', e);
        return await this.loadFromJson(opts);
      }
    },

    // utilidad para forzar recarga (útil en debugging)
    async reload(forceJson = false) {
      try {
        if (forceJson) {
          const cfg = await this.loadFromJson({ path: `${window.location.origin}/tenants/tenants.json?v=${Date.now()}` });
          this.applyStyles(cfg);
          return cfg;
        } else {
          const cfg = await this.loadFromJson();
          this.applyStyles(cfg);
          return cfg;
        }
      } catch (e) {
        console.error('tenantManager.reload error', e);
        return null;
      }
    }
  };

  // Exponer en global
  global.tenantManager = tm;
  console.log('tenantManager inicializado');

})(window);