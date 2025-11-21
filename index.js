/*
========================================================================
  ÍNDICE DEL ARCHIVO (index2.js)
========================================================================
  1. CONFIGURACIÓN E INICIALIZACIÓN DE SUPABASE
  2. CONFIGURACIÓN DE TENANT (UI)
  3. SISTEMA DE MODALES
  4. LÓGICA DE INTERACCIÓN
     - Sistema de Tabs
     - Handler de Login (custom-login)
     - Lógica de Registro (apunta a 'register-user')
     - Lógica de Olvidar Contraseña (placeholder)
  5. MODALES DE ACCIÓN
     - showRegistrationModal (Modificado por Manifiesto)
     - showResetPasswordModal (Lógica heredada)
  6. INICIALIZACIÓN DE LA APLICACIÓN
========================================================================
*/

(function() {
  'use strict';

  // -----------------------------------------------------------------
  // 1. CONFIGURACIÓN E INICIALIZACIÓN DE SUPABASE
  // -----------------------------------------------------------------
  const CURRENT_ORIGIN = window.location.origin;
  
  // IMPORTANTE: URL del proxy (sin barra final)
  const SUPABASE_URL = window.location.origin + '/api';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2d3lncG51dW51dXlsem9uZHh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NDUzMTEsImV4cCI6MjA3NjEyMTMxMX0.FxjCX9epT_6LgWGdzdPhRUTP2vn4CLdixRqpFMRZK70';

  console.log('🔧 Inicializando Supabase con proxy:', SUPABASE_URL);

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      headers: {
        'x-proxy-debug': 'true'
      }
    }
  });

  // Test del proxy al cargar
window.addEventListener('load', async () => {
  console.log('🧪 Testing proxy...');
  try {
    const response = await fetch(`${CURRENT_ORIGIN}/api/rest/v1/`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    console.log('✅ Proxy response:', response.status, await response.text());
  } catch (e) {
    console.error('❌ Proxy test failed:', e);
  }
});

  // -----------------------------------------------------------------
  // 2. CONFIGURACIÓN DE TENANT 
  // -----------------------------------------------------------------
  const DEFAULTS = {
    companyName: "Aula Corporativa",
    logoText: "AC",
    logoUrl: null,
    tagline: "¡Bienvenido!",
    description: "Accede a tu plataforma de capacitación corporativa. Aprende, crece y alcanza tus objetivos profesionales.",
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

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const setStyle = (prop, value) => {
    if (value) document.documentElement.style.setProperty(prop, value);
  };

  const detectTenant = () => {
    const host = location.hostname || 'localhost';
    if (host === 'localhost') return 'demo';
    if (host === '127.0.0.1') return 'default';
    const parts = host.split('.');
    if (parts.length > 2 && parts[0] !== 'www') return parts[0];
    return 'default';
  };

  const tenantId = detectTenant(); // Este es el 'tenant_slug'

  async function loadTenantConfig() {
    try {
      // NOTA: tenants.json es solo para ESTILOS. No es para seguridad.
      const response = await fetch('./tenants/tenants.json', {
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('Tenant config not found');

      const data = await response.json();
      const tenantConfig = data[tenantId] || data['default'] || {};

      const config = {
        ...DEFAULTS,
        ...tenantConfig,
        labels: { ...DEFAULTS.labels,
          ...(tenantConfig.labels || {})
        }
      };

      // Guardamos el slug del tenant globalmente para usarlo en el login
      config.tenantSlug = tenantId;
      console.log(`✅ Tenant Configurado: ${config.companyName} (slug: ${config.tenantSlug})`);

      return config;
    } catch (error) {
      console.warn('⚠️ Error al cargar tenant config:', error);
      return { ...DEFAULTS,
        tenantSlug: 'default'
      };
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

    // La UI está lista, inicializar las interacciones
    initializeInteractions();
  }

  // -----------------------------------------------------------------
  // 3. SISTEMA DE MODALES
  // -----------------------------------------------------------------
  function showModal(title, message, type = 'info', callback = null) {
    const modalRoot = $('#modalRoot');
    if (!modalRoot) return;

    const iconMap = {
      success: '✓',
      error: '✕',
      info: 'ℹ'
    };
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

  // -----------------------------------------------------------------
  // 4. LÓGICA DE INTERACCIÓN (Refactorizada)
  // -----------------------------------------------------------------
  function initializeInteractions() {

    // Sistema de Tabs 
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

    // ---
    // Handler de Login 
    // ---
    const handleLoginSubmit = async (e) => {
      e.preventDefault();

      // Determinar qué formulario se usó
      const isEmployeeForm = e.target.id === 'formEmployees';
      const email = (isEmployeeForm ? $('#empUsername') : $('#conUsername')).value.trim();
      const password = (isEmployeeForm ? $('#empPassword') : $('#conPassword')).value.trim();
      const btn = isEmployeeForm ? $('#btnLoginEmp') : $('#btnLoginCon');

      console.log(`1️⃣ Iniciando login v2 para: ${email}`);

      if (!email || !password) {
        showModal('Error', 'Por favor, ingresa tu usuario y contraseña.', 'error');
        return;
      }

      btn.disabled = true;
      btn.querySelector('span').textContent = 'Validando...';

      try {
        const {
          tenantSlug
        } = window.__appConfig;
        console.log(`2️⃣ Invocando 'custom-login' en Edge Function con slug: ${tenantSlug}`);

        // 1. INVOCAR LA EDGE FUNCTION SEGURA
        // Esta función DEBE validar status, tenant, y roles (según Manifiesto)
        const {
          data,
          error
        } = await supabase.functions.invoke('custom-login', {
          body: {
            email: email,
            password: password,
            tenant_slug: tenantSlug
          }
        });

        if (error) {
          console.error('❌ Error de la Edge Function:', error.message);
          throw new Error(error.message || 'Error del servidor');
        }

        if (data.error) {
          console.error('❌ Error lógico del backend:', data.error);
          
          // Lógica heredada para 'force_reset'.
          // Aunque el nuevo flujo del Manifiesto no lo usa,
          // 'custom-login' podría seguir manejando usuarios antiguos.
          if (data.error_code === 'FORCE_RESET') {
            console.log('3️⃣ Detectado FORCE_RESET desde el backend');
            showResetPasswordModal({
              id: data.user_id
            });
            return; 
          }
          
          // MANIFIESTO UX: "Cuenta pendiente de autorización"
          if (data.error_code === 'PENDING_AUTHORIZATION') {
             throw new Error('Cuenta pendiente de autorización. Contacta a tu administrador.');
          }

          throw new Error(data.error);
        }

        console.log('3️⃣ Edge Function exitosa, token recibido.');

        // 2. ESTABLECER LA SESIÓN CON EL NUEVO TOKEN
        const {
          error: sessionError
        } = await supabase.auth.setSession({
          access_token: data.jwt,
          refresh_token: 'dummy-refresh-token' // El refresh no es necesario para esta demo
        });

        if (sessionError) {
          console.error('❌ Error al establecer la sesión:', sessionError.message);
          throw new Error('Error al iniciar sesión localmente.');
        }

        // 3. ÉXITO
        console.log('4️⃣ Sesión establecida. Redirigiendo...');
        showModal(
          '¡Bienvenido!',
          'Inicio de sesión exitoso. Redirigiendo...',
          'success',
          () => {
            window.location.href = window.__loginRedirect || './profile/profile.html';
          }
        );

      } catch (error) {
        console.error('❌ Error en el flujo de login:', error.message);
        await supabase.auth.signOut(); // Limpiar cualquier sesión parcial
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Ingresar';
        showModal('Error de Acceso', error.message, 'error');
      }
    };

    // Asignar el handler a AMBOS formularios
    $('#formEmployees').addEventListener('submit', handleLoginSubmit);
    $('#formContractors').addEventListener('submit', handleLoginSubmit);

    // ---
    // Lógica de Registro (Modificada por Manifiesto)
    // ---
    const registerBtn = $('#registerEmp');
    if (registerBtn) {
      registerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showRegistrationModal(); // Esta función ahora llama a 'register-user'
      });
    }

    // ---
    // Lógica de Olvidar Contraseña
    // ---
    const forgotBtn = $('#forgotEmp');
    if (forgotBtn) {
      forgotBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showModal('Función no disponible', 'La recuperación de contraseña aún no está implementada.', 'info');
      });
    }

  }; // Fin de initializeInteractions


  // -----------------------------------------------------------------
  // 5. MODALES DE ACCIÓN (Refactorizados)
  // -----------------------------------------------------------------

  // ---
  // MODIFICADO: Modal de Registro (Apunta a Edge Function 'register-user' del Manifiesto)
  // ---
  async function showRegistrationModal() {
    const modalRoot = $('#modalRoot');
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
      setTimeout(() => {
        modalRoot.innerHTML = '';
      }, 200);
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

        const {
          tenantSlug
        } = window.__appConfig;

        // *** INICIO DE CAMBIO (MANIFIESTO) ***
        // El payload ahora coincide con el Manifiesto
        // Asumimos 'employee' porque este es el formulario 'registerEmp'
        const payload = {
          email: modal.querySelector('#regEmail').value.trim(),
          password: modal.querySelector('#regPassword').value.trim(),
          full_name: modal.querySelector('#regName').value.trim(),
          tenant_slug: tenantSlug,
          user_type: 'employee',
          meta: {
            area: modal.querySelector('#regArea').value.trim()
          }
        };

        console.log("🚀 Enviando a 'register-user':", payload);
        
        // INVOCAR LA EDGE FUNCTION DE REGISTRO
        const {
          data,
          error
        } = await supabase.functions.invoke('register-user', {
          body: payload
        });

        if (error || data.error) {
          throw new Error(data.error || error.message);
        }

        console.log('✅ Solicitud de registro exitosa:', data.message);
        closeModal();
        setTimeout(() => {
          // Mensaje de UX exacto del Manifiesto
          showModal(
            'Solicitud Recibida',
            'Tu cuenta está pendiente de aprobación por el administrador del tenant.',
            'success'
          );
        }, 300);
        // *** FIN DE CAMBIO (MANIFIESTO) ***

      } catch (error) {
        console.error('❌ Error de registro:', error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Crear Cuenta';
        showModal('Error', error.message, 'error');
      }
    });
  }

  // ---
  // Modal de Reseteo de Contraseña 
  // ---
  function showResetPasswordModal(user) {
    console.log('🔵 showResetPasswordModal llamado con:', user);
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
      rules.letter.classList.toggle('valid', isMatch);
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

        // Esta es la Edge Function que ya tenías
        const {
          data,
          error
        } = await supabase.functions.invoke('reset-password-user', {
          body: {
            userId: user.id,
            newPassword: passInput.value
          }
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

  // -----------------------------------------------------------------
  // 6. INICIALIZACIÓN DE LA APLICACIÓN
  // -----------------------------------------------------------------
  async function init() {
    console.log(`🚀 Initializing v2 - tenant: ${tenantId}`);
    const config = await loadTenantConfig();
    applyConfiguration(config);
    console.log('✅ Application ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
