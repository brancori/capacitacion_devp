(function() {
  'use strict';

  // =================================================================
  // 1. DEFINICIONES DE UTILIDAD
  // =================================================================
  function detectTenant() {
    const host = location.hostname || 'localhost';
    if (host === 'localhost') return 'demo';
    if (host === '127.0.0.1') return 'default';
    const parts = host.split('.');
    if (parts.length > 2 && parts[0] !== 'www') return parts[0];
    return 'default';
  }

  function $(selector) { return document.querySelector(selector); }
  function $$(selector) { return Array.from(document.querySelectorAll(selector)); }

  const setStyle = (prop, value) => {
    if (value) document.documentElement.style.setProperty(prop, value);
  };

  // =================================================================
  // 2. CONFIGURACIÓN DE TENANT 
  // =================================================================

  const DEFAULTS = {
    companyName: "Aula Corporativa",
    logoText: "AC",
    logoUrl: null,
    tagline: "¡Bienvenido!",
    description: "Accede a tu plataforma de capacitación corporativa.",
    bgPage: "#141E30",
    textPage: "#ffffff",
    primaryColor: "#234B95",
    secondaryColor: "#1F3F7A",
    bgBrand: "#ffffff",
    textBrand: "#33374d",
    bgForm: "rgba(0, 0, 0, 0.3)",
    textForm: "#ffffff",
    inputTheme: "dark",
    bgSuccess: "linear-gradient(135deg, #06d6a0, #1b9aaa)",
    bgError: "linear-gradient(135deg, #ef476f, #b30f20)",
    bgOverlay: "rgba(0, 0, 0, 0.7)",
    backgroundImage: `linear-gradient(to bottom, #141E30, #243B55)`,
    animatedBackground: false,
    labels: {
      empUser: "Usuario",
      empPass: "Contraseña",
      conUser: "ID Contratista",
      conPass: "Contraseña"
    },
    successRedirect: "profile/profile.html",
    copyrightText: null,
    customCss: null
  };

  const tenantId = detectTenant();

  // =================================================================
  // validateLoginPage - Sin trial_expires_at
  // =================================================================
async function validateLoginPage(slug) {
    if (!slug) return false;

    try {
      // Aseguramos que window.supabase existe
      if (!window.supabase) throw new Error("Supabase no inicializado");

      const { data: tenant, error } = await window.supabase
        .from('tenants')
        .select('id, name, slug')
        .eq('slug', slug)
        .single();

      if (error || !tenant) {
        console.error('❌ Tenant no encontrado en DB:', slug, error);
        return false;
      }

      console.log('✅ Tenant validado:', tenant.name);
      return tenant;

    } catch (err) {
      console.error('❌ Error validando tenant:', err);
      return false;
    }
}


  async function loadTenantConfig() {
    try {
      const response = await fetch('./tenants/tenants.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Tenant config not found');

      const data = await response.json();
      const tenantConfig = data[tenantId] || data['default'] || {};

      const config = {
        ...DEFAULTS,
        ...tenantConfig,
        labels: { ...DEFAULTS.labels, ...(tenantConfig.labels || {}) }
      };

      config.tenantSlug = tenantId;
      
      const tenantDb = await validateLoginPage();
      if (tenantDb) {
        config.tenantUUID = tenantDb.id;
      }
      
      console.log(` Tenant Configurado: ${config.companyName} (slug: ${config.tenantSlug})`);
      return config;
    } catch (error) {
      console.warn(' Error al cargar tenant config:', error);
      return { ...DEFAULTS, tenantSlug: 'default' };
    }
  }

  function applyConfiguration(config) {
    window.__appConfig = config;

    setStyle('--bgPage', config.bgPage);
    setStyle('--textPage', config.textPage);
    setStyle('--primaryColor', config.primaryColor);
    setStyle('--secondaryColor', config.secondaryColor);
    setStyle('--bgBrand', config.bgBrand);
    setStyle('--textBrand', config.textBrand);
    setStyle('--bgForm', config.bgForm);
    setStyle('--textForm', config.textForm);
    setStyle('--bgSuccess', config.bgSuccess);
    setStyle('--bgError', config.bgError);
    setStyle('--bgOverlay', config.bgOverlay);

    document.body.dataset.inputTheme = config.inputTheme || 'dark';

    const logoIcon = $('#logoIcon');
    const logoText = $('#logoText');

    if (config.logoUrl) {
      logoIcon.innerHTML = `<img src="${config.logoUrl}" alt="Logo" style="max-width:100%; height: auto; object-fit:contain;" />`;
    } else {
      logoIcon.textContent = config.logoText;
    }

    logoText.textContent = config.companyName;
    $('#brandTitle').textContent = config.tagline;
    $('#brandDescription').textContent = config.description;

    $('#labelEmpUser').textContent = config.labels.empUser;
    $('#labelEmpPass').textContent = config.labels.empPass;
    $('#labelConUser').textContent = config.labels.conUser;
    $('#labelConPass').textContent = config.labels.conPass;

    $('#currentYear').textContent = new Date().getFullYear();

    if (config.backgroundImage) {
      $('.bg-animated').style.background = config.backgroundImage;
    }
    if (!config.animatedBackground) {
      $('.bg-orbs').style.display = 'none';
    }

    window.__loginRedirect = config.successRedirect;
    initializeInteractions();
  }

  // =================================================================
  // 3. SISTEMA DE MODALES
  // =================================================================
  function showModal(title, message, type = 'info', callback = null) {
    const modalRoot = $('#modalRoot');
    if (!modalRoot) return;

    const iconMap = { success: '✓', error: '✕', info: 'ℹ' };
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-icon ${type}">${iconMap[type] || '!'}</div>
        <h3 class="modal-title">${title}</h3>
        <p class="modal-text">${message}</p>
        <div class="modal-actions">
          <button class="btn btn-primary" id="modalOk">Aceptar</button>
        </div>
      </div>
    `;
    modalRoot.innerHTML = '';
    modalRoot.appendChild(modal);

    const okBtn = modal.querySelector('#modalOk');
    okBtn.addEventListener('click', () => {
      modal.style.animation = 'fadeOut 200ms ease-out forwards';
      setTimeout(() => {
        modalRoot.innerHTML = '';
        if (callback) callback();
      }, 200);
    });
  }

  // =================================================================
  // 4. LÓGICA DE INTERACCIÓN (LOGIN)
  // =================================================================
  function initializeInteractions() {
    const tabButtons = $$('.tab-btn');
    const forms = $$('.login-form');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetTab = button.dataset.tab;
        if (button.classList.contains('active')) return;
        tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === targetTab));
        forms.forEach(form => form.classList.toggle('active', form.id === `form${targetTab.charAt(0).toUpperCase() + targetTab.slice(1)}`));
      });
    });

    // =================================================================
    // handleLoginSubmit - Sin headers problemáticos
    // =================================================================
const handleLoginSubmit = async (e) => {
  e.preventDefault();
  const supabase = window.supabase;
  const isEmployeeForm = e.target.id === 'formEmployees';
  const email = (isEmployeeForm ? $('#empUsername') : $('#conUsername')).value.trim();
  const password = (isEmployeeForm ? $('#empPassword') : $('#conPassword')).value.trim();
  const btn = isEmployeeForm ? $('#btnLoginEmp') : $('#btnLoginCon');

  if (!email || !password) {
    showModal('Error', 'Por favor, ingresa tu usuario y contraseña.', 'error');
    return;
  }

  btn.disabled = true;
  btn.querySelector('span').textContent = 'Validando...';

try {
    const { tenantSlug } = window.__appConfig;
    
    // ---------------------------------------------------------
    // 1. LOGIN (Obtenemos los tokens)
    // ---------------------------------------------------------
    // Usamos signInWithPassword para obtener los tokens frescos
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (authError) {
      console.error('Error login:', authError);
      throw new Error('Credenciales incorrectas o error de conexión');
    }

    console.log("🔑 Login correcto. Token recibido.");

    // ---------------------------------------------------------
    // 2. FIX DE STORAGE (Inyección Manual de Sesión)
    // ---------------------------------------------------------
    // Como el navegador bloquea el storage, la sesión puede perderse.
    // FORZAMOS al cliente a usar este token para las siguientes consultas.
    if (authData.session) {
        await supabase.auth.setSession(authData.session);
        console.log("💉 Sesión inyectada manualmente en el cliente.");
    }

    // ---------------------------------------------------------
    // 3. OBTENER PERFIL (Con Select *)
    // ---------------------------------------------------------
    // Usamos select('*') para evitar errores si falta alguna columna específica
const { data: rawData, error: profileError } = await supabase
        .from('profiles')
        .select('*') 
        .eq('id', authData.user.id);
        // Quitamos .single() aquí para manejarlo manualmente abajo y evitar errores

    if (profileError) {
        console.error("❌ Error bajando perfil:", profileError);
        throw new Error("No se pudo cargar tu perfil de usuario.");
    }

    // FIX CRÍTICO: Detectar si es Array o Objeto
    // Tu proxy devuelve Array [{...}], así que tomamos el primero.
    const profile = Array.isArray(rawData) ? rawData[0] : rawData;

    console.log("📦 Perfil Procesado:", profile); // Aquí ya deberías ver el objeto sin corchetes []

    if (!profile) {
        throw new Error("El perfil existe pero llegó vacío.");
    }

    // ---------------------------------------------------------
    // 4. GUARDADO Y REDIRECCIÓN
    // ---------------------------------------------------------
    // Ahora profile.role SÍ existirá
    const userRole = profile.role || 'authenticated'; 
    const userTenant = profile.tenant_id;

    // Guardamos en safeStorage (Memoria) para que profile.js lo lea después
    window.safeStorage.set('role', userRole);
    window.safeStorage.set('tenant', userTenant);
    window.safeStorage.set('user_email', email);
    window.safeStorage.set('full_name', profile.full_name || 'Usuario');
    
    console.log('✅ Datos Finales listos para redirección:', { 
        role: userRole, 
        tenant: userTenant 
    });

showModal(
      '¡Bienvenido!',
      'Accediendo al sistema...',
      'success',
      () => {
        // --- LÓGICA DE ATERRIZAJE BLINDADA ---
        const rolesAdmin = ['master', 'admin', 'supervisor'];
        
        // 1. Limpieza: Aseguramos que sea texto y minúsculas para comparar bien
        const safeRole = String(userRole || '').toLowerCase();
        
        // 2. Diagnóstico en Consola (Míralo antes de que cambie de página)
        console.log("🚦 SEMÁFORO DE REDIRECCIÓN:");
        console.log("   - Rol crudo:", userRole);
        console.log("   - Rol limpio:", safeRole);
        console.log("   - ¿Es Admin?:", rolesAdmin.includes(safeRole));

        // 3. Decisión
        if (rolesAdmin.includes(safeRole)) {
          console.log("   -> Redirigiendo a DASHBOARD 🚀");
          window.location.href = './dashboard.html';
        } else {
          console.log("   -> Redirigiendo a PROFILE 🎓");
          window.location.href = './profile/profile.html';
        }
      }
    );

  } catch (error) {
    console.error('❌ Error en proceso de login:', error);
    await supabase.auth.signOut(); // Limpiar si falló algo
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Ingresar';
    showModal('Error de Acceso', error.message, 'error');
  }
};

    $('#formEmployees').addEventListener('submit', handleLoginSubmit);
    $('#formContractors').addEventListener('submit', handleLoginSubmit);

    // Registro
    const registerBtn = $('#registerEmp');
    if (registerBtn) {
      registerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showRegistrationModal();
      });
    }

    // Olvidar contraseña
    const forgotBtn = $('#forgotEmp');
    if (forgotBtn) {
      forgotBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showModal('Función no disponible', 'La recuperación de contraseña aún no está implementada.', 'info');
      });
    }
  }

  // =================================================================
  // 5. MODALES (REGISTRO Y RESET)
  // =================================================================
  async function showRegistrationModal() {
    const modalRoot = $('#modalRoot');
    const supabase = window.supabase;
    const config = window.__appConfig || DEFAULTS;
    const companyName = config.companyName || 'Tu Compañía';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-form">
        <h3 class="modal-title">Solicitar Registro</h3>
        <div class="modal-body">
          <form id="registrationForm">
            <div class="form-group"><label class="form-label" for="regName">Nombre Completo</label><input type="text" id="regName" class="form-input" required></div>
            <div class="form-group"><label class="form-label" for="regCompany">Compañía</label><input type="text" id="regCompany" class="form-input" value="${companyName}" readonly></div>
            <div class="form-group"><label class="form-label" for="regArea">Área o Departamento</label><input type="text" id="regArea" class="form-input" required></div>
            <div class="form-group"><label class="form-label" for="regEmail">Correo Electrónico</label><input type="email" id="regEmail" class="form-input" required></div>
            <div class="form-group">
              <label class="form-label" for="regPassword">Crear Contraseña</label><input type="password" id="regPassword" class="form-input" placeholder="••••••••" required>
              <ul class="password-rules"><li id="rule-length">8+ Caracteres</li><li id="rule-number">1 Número</li><li id="rule-letter">1 Letra</li></ul>
            </div>
            <div class="form-group">
              <label class="form-label" for="regConfirmPassword">Confirmar Contraseña</label><input type="password" id="regConfirmPassword" class="form-input" placeholder="••••••••" required>
              <ul class="password-rules"><li id="rule-match">Las contraseñas coinciden</li></ul>
            </div>
          </form>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="modalCancel">Cancelar</button>
          <button class="btn btn-primary" id="modalSubmit">Crear Cuenta</button>
        </div>
      </div>
    `;
    modalRoot.innerHTML = '';
    modalRoot.appendChild(modal);

    const closeModal = () => {
      modal.style.animation = 'fadeOut 200ms ease-out forwards';
      setTimeout(() => { modalRoot.innerHTML = ''; }, 200);
    };

    const passInput = modal.querySelector('#regPassword');
    const confirmInput = modal.querySelector('#regConfirmPassword');
    const rules = {
      length: modal.querySelector('#rule-length'),
      number: modal.querySelector('#rule-number'),
      letter: modal.querySelector('#rule-letter'),
      match: modal.querySelector('#rule-match')
    };

    const validatePassword = () => {
      const pass = passInput.value;
      const confirm = confirmInput.value;
      const isLength = pass.length >= 8;
      const hasNumber = /\d/.test(pass);
      const hasLetter = /[a-zA-Z]/.test(pass);
      const isMatch = pass === confirm && pass.length > 0;
      rules.length.classList.toggle('valid', isLength);
      rules.number.classList.toggle('valid', hasNumber);
      rules.letter.classList.toggle('valid', hasLetter);
      rules.match.classList.toggle('valid', isMatch);
      return isLength && hasNumber && hasLetter && isMatch;
    };
    passInput.addEventListener('input', validatePassword);
    confirmInput.addEventListener('input', validatePassword);

    modal.querySelector('#modalCancel').addEventListener('click', closeModal);

    modal.querySelector('#modalSubmit').addEventListener('click', async (e) => {
      e.preventDefault();
      const submitBtn = modal.querySelector('#modalSubmit');

      if (!modal.querySelector('#registrationForm').checkValidity() || !validatePassword()) {
        showModal('Error', 'Completa todos los campos y revisa tu contraseña.', 'error');
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';
        const { tenantSlug } = window.__appConfig;

        const payload = {
          email: modal.querySelector('#regEmail').value.trim(),
          password: modal.querySelector('#regPassword').value.trim(),
          full_name: modal.querySelector('#regName').value.trim(),
          tenant_slug: tenantSlug,
          user_type: 'employee',
          meta: { area: modal.querySelector('#regArea').value.trim() }
        };

        const { data, error } = await supabase.functions.invoke('register-user', { body: payload });

        if (error || data.error) throw new Error(data.error || error.message);

        closeModal();
        setTimeout(() => {
          showModal('Solicitud Recibida', 'Tu cuenta está pendiente de aprobación por el administrador del tenant.', 'success');
        }, 300);

      } catch (error) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Crear Cuenta';
        showModal('Error', error.message, 'error');
      }
    });
  }

  function showResetPasswordModal(user) {
    const supabase = window.supabase;
    const modalRoot = $('#modalRoot');
    if (!modalRoot) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-form">
        <h3 class="modal-title">Cambio de Contraseña Requerido</h3>
        <p class="modal-text" style="text-align: left; margin-top: 1rem;">
          Debes establecer una nueva contraseña para continuar.
        </p>
        <div class="modal-body">
          <form id="resetPasswordForm">
            <div class="form-group">
              <label class="form-label" for="resetPassword">Nueva Contraseña</label>
              <input type="password" id="resetPassword" class="form-input" placeholder="••••••••" required>
              <ul class="password-rules"><li id="rule-length">8+ Caracteres</li><li id="rule-number">1 Número</li><li id="rule-letter">1 Letra</li></ul>
            </div>
            <div class="form-group">
              <label class="form-label" for="resetConfirmPassword">Confirmar Contraseña</label>
              <input type="password" id="resetConfirmPassword" class="form-input" placeholder="••••••••" required>
              <ul class="password-rules"><li id="rule-match">Las contraseñas coinciden</li></ul>
            </div>
          </form>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="modalSubmitReset">Guardar y Continuar</button>
        </div>
      </div>
    `;
    modalRoot.innerHTML = '';
    modalRoot.appendChild(modal);

    const passInput = $('#resetPassword');
    const confirmInput = $('#resetConfirmPassword');
    const rules = {
      length: $('#rule-length'),
      number: $('#rule-number'),
      letter: $('#rule-letter'),
      match: $('#rule-match')
    };

    const validatePassword = () => {
      const pass = passInput.value;
      const confirm = confirmInput.value;
      const isLength = pass.length >= 8;
      const hasNumber = /\d/.test(pass);
      const hasLetter = /[a-zA-Z]/.test(pass);
      const isMatch = pass.length > 0 && pass === confirm;
      rules.length.classList.toggle('valid', isLength);
      rules.number.classList.toggle('valid', hasNumber);
      rules.letter.classList.toggle('valid', hasLetter);
      rules.match.classList.toggle('valid', isMatch);
      return isLength && hasNumber && hasLetter && isMatch;
    };

    passInput.addEventListener('input', validatePassword);
    confirmInput.addEventListener('input', validatePassword);

    $('#modalSubmitReset').addEventListener('click', async () => {
      const submitBtn = $('#modalSubmitReset');
      if (!validatePassword()) {
        showModal('Contraseña Inválida', 'Revisa que tu contraseña cumpla los requisitos.', 'error');
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Guardando...';

        const { data, error } = await supabase.functions.invoke('reset-password-user', {
          body: { userId: user.id, newPassword: passInput.value }
        });

        if (error || (data && data.success === false)) {
          throw new Error(data.error || error.message || 'Error al actualizar');
        }

        modalRoot.innerHTML = '';
        setTimeout(() => {
          showModal('Éxito', 'Contraseña actualizada. Inicia sesión nuevamente.', 'success', () => {
            window.location.reload();
          });
        }, 250);

      } catch (error) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar y Continuar';
        showModal('Error', error.message, 'error');
      }
    });
  }

  // =================================================================
  // Init() - Storage compatible con Tracking Prevention
  // =================================================================
async function init() {
    // A) ESPERAR A QUE SUPABASE-CLIENT ESTÉ LISTO
    if (!window.supabase) {
        // console.log('⏳ Esperando cliente Supabase...');
        setTimeout(init, 50);
        return;
    }

    const currentTenant = detectTenant(); // Asegúrate de que detectTenant() esté definida antes o sea global
    
    // B) VALIDAR TENANT CONTRA DB ANTES DE SEGUIR
    const validTenantData = await validateLoginPage(currentTenant);
    
    if (!validTenantData) {
        // Opción: Redirigir a 404 o mostrar error visual
        document.body.innerHTML = "<h1>❌ Error: Organización no encontrada</h1>";
        return; 
    }

    // --- LÓGICA DE STORAGE (Tu código original) ---
    let storedTenant = null;
    try {
      if (window.safeStorage && typeof window.safeStorage.get === 'function') {
        storedTenant = window.safeStorage.get('current_tenant');
      }
    } catch (e) {
      console.warn('⚠️ No se pudo acceder a storage:', e.message);
    }
    
    if (storedTenant && storedTenant !== currentTenant) {
      console.warn('🔄 Tenant diferente, limpiando sesión…');
      try {
        // Borrar cookie específica
        document.cookie = `sb-hvwygpnuunuuylzondxt-auth-token=;path=/;max-age=0`;
        // Intentar logout real si hay sesión vieja
        await window.supabase.auth.signOut().catch(() => {});
      } catch(e) {}
      
      try {
        if (window.safeStorage) {
          window.safeStorage.remove('current_tenant');
          window.safeStorage.remove('tenantTheme');
          window.safeStorage.remove('tenantSlug');
        }
      } catch(e) {
        console.warn(' Error limpiando storage:', e.message);
      }
    }

    // Guardar tenant actual
    try {
      if (window.safeStorage && typeof window.safeStorage.set === 'function') {
        window.safeStorage.set('current_tenant', currentTenant);
      }
    } catch(e) {}

    console.log(`🚀 Inicializando App - Tenant: ${currentTenant}`);
    
    // C) CARGAR CONFIGURACIÓN (Pasando el tenant validado si tu función lo soporta, o el slug)
    // Asegúrate de que loadTenantConfig esté disponible
    if (typeof loadTenantConfig === 'function') {
        const config = await loadTenantConfig(currentTenant); 
        applyConfiguration(config);
    }
    
    console.log('🏁 App lista para login');
}

// Disparador
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();