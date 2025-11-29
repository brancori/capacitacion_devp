(function() {
  'use strict';

  // =================================================================
  // 1. DEFINICIONES DE UTILIDAD
  // =================================================================

  function $(selector) { return document.querySelector(selector); }
  function $$(selector) { return Array.from(document.querySelectorAll(selector)); }

  // =================================================================
  // 2. VALIDACIÓN DE TENANT
  // =================================================================
  async function validateLoginPage() {
    const tenantSlug = window.CURRENT_TENANT || 'default';
    
    try {
      if (!window.supabase) throw new Error("Supabase no inicializado");

      const { data, error } = await window.supabase
        .from('tenants')
        .select('*');
      
      const tenant = data?.find(t => t.slug === tenantSlug);

      if (error || !tenant) {
        console.warn(`⚠️ Tenant "${tenantSlug}" no encontrado, usando default`);
        return { valid: false, slug: tenantSlug };
      }

      console.log('✅ Tenant validado:', tenant.name);
      return { valid: true, ...tenant };

    } catch (err) {
      console.error('❌ Error validando tenant:', err);
      return { valid: false, slug: tenantSlug };
    }
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
    if (okBtn) {
        okBtn.addEventListener('click', () => {
        modal.style.animation = 'fadeOut 200ms ease-out forwards';
        setTimeout(() => {
            modalRoot.innerHTML = '';
            if (callback) callback();
        }, 200);
        });
    }
  }

  // =================================================================
  // 4. LÓGICA DE INTERACCIÓN (LOGIN)
  // =================================================================
  async function handleLoginSubmit(e) {
    e.preventDefault(); // ESTO EVITA LA RECARGA
    
    const isEmployeeForm = e.target.id === 'formEmployees';
    const emailInput = isEmployeeForm ? $('#empUsername') : $('#conUsername');
    const passwordInput = isEmployeeForm ? $('#empPassword') : $('#conPassword');
    const btn = isEmployeeForm ? $('#btnLoginEmp') : $('#btnLoginCon');
    
    // Validación de seguridad
    if (!emailInput || !btn) return;

    const originalBtnText = btn.querySelector('span') ? btn.querySelector('span').textContent : 'Ingresar';
    const email = emailInput.value.trim();
    const password = passwordInput ? passwordInput.value.trim() : '';
    const tenantSlug = window.CURRENT_TENANT || 'default';

    if (!email) {
      showModal('Error', 'Ingresa tu correo electrónico.', 'error');
      return;
    }

    btn.disabled = true;
    if (btn.querySelector('span')) btn.querySelector('span').textContent = 'Procesando...';

    try {
      // LLAMADA A EDGE FUNCTION: CUSTOM-LOGIN
      const { data, error } = await window.supabase.functions.invoke('custom-login', {
        body: { email, password, tenant_slug: tenantSlug }
      });

      if (error) throw new Error(error.message || 'Error de conexión');
      if (data && data.error) throw new Error(data.error);

      // CASO 1: USUARIO PENDING (Requiere crear contraseña)
      if (data.action === 'FORCE_RESET') {
          console.log("⚠️ Usuario Pending: Iniciando flujo de contraseña.");
          btn.disabled = false;
          if (btn.querySelector('span')) btn.querySelector('span').textContent = originalBtnText;
          
          showResetPasswordModal({ id: data.user_id }); 
          return;
      }

      // CASO 2: LOGIN EXITOSO
      if (data.jwt) {
          const { error: sessionError } = await window.supabase.auth.setSession({
              access_token: data.jwt,
              refresh_token: data.jwt 
          });
          
          if (sessionError) throw sessionError;

          window.safeStorage.set('role', data.role);
          window.safeStorage.set('tenant', tenantSlug);
          window.safeStorage.set('user_email', email);
          
          window.location.href = './profile/profile.html';
      }

    } catch (err) {
      console.error(err);
      btn.disabled = false;
      if (btn.querySelector('span')) btn.querySelector('span').textContent = originalBtnText;
      
      if (err.message === 'Contraseña requerida' || err.message.includes('PASSWORD_MISSING')) {
          showModal('Atención', 'Por favor ingresa tu contraseña.', 'info');
          if (passwordInput) passwordInput.focus();
      } else {
          showModal('Error', err.message, 'error');
      }
    }
  }

  // =================================================================
  // 5. MODALES (REGISTRO Y RESET)
  // =================================================================
  function showResetPasswordModal(user) {
    const modalRoot = $('#modalRoot');
    if (!modalRoot) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content modal-form">
        <h3 class="modal-title">Configuración Inicial</h3>
        <p class="modal-text" style="text-align: left; margin-top: 1rem;">
          Bienvenido. Para activar tu cuenta, crea una contraseña segura.
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
          <button class="btn btn-primary" id="modalSubmitReset">Activar Cuenta</button>
        </div>
      </div>
    `;
    modalRoot.innerHTML = '';
    modalRoot.appendChild(modal);

    const passInput = $('#resetPassword');
    const confirmInput = $('#resetConfirmPassword');
    const submitBtn = $('#modalSubmitReset');

    const validatePassword = () => {
      const pass = passInput.value;
      const confirm = confirmInput.value;
      const rules = {
        length: $('#rule-length'),
        number: $('#rule-number'),
        letter: $('#rule-letter'),
        match: $('#rule-match')
      };
      
      if(rules.length) rules.length.classList.toggle('valid', pass.length >= 8);
      if(rules.number) rules.number.classList.toggle('valid', /\d/.test(pass));
      if(rules.letter) rules.letter.classList.toggle('valid', /[a-zA-Z]/.test(pass));
      if(rules.match) rules.match.classList.toggle('valid', pass.length > 0 && pass === confirm);

      return pass.length >= 8 && /\d/.test(pass) && /[a-zA-Z]/.test(pass) && pass === confirm;
    };

    if (passInput) passInput.addEventListener('input', validatePassword);
    if (confirmInput) confirmInput.addEventListener('input', validatePassword);

    if (submitBtn) {
        submitBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            if (!validatePassword()) {
                showModal('Contraseña Inválida', 'Revisa los requisitos marcados en rojo.', 'error');
                return;
            }

            try {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Guardando...';

                // LLAMADA A EDGE FUNCTION: RESET-PASSWORD-USER
                const { data, error } = await window.supabase.functions.invoke('reset-password-user', {
                    body: { userId: user.id, newPassword: passInput.value }
                });

                if (error) throw new Error(error.message);
                if (data && data.error) throw new Error(data.error);

                modalRoot.innerHTML = '';
                showModal('Cuenta Activada', 'Tu contraseña ha sido creada exitosamente.', 'success', () => {
                    window.location.reload(); 
                });

            } catch (error) {
                console.error(error);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Activar Cuenta';
                showModal('Error', error.message || 'No se pudo activar la cuenta', 'error');
            }
        });
    }
  }

  // =================================================================
  // 6. INICIALIZAR LISTENERS (ESTA ES LA FUNCIÓN QUE FALTABA)
  // =================================================================
  function initializeInteractions() {
    // 1. Tabs
    const tabButtons = $$('.tab-btn');
    const forms = $$('.login-form');
    
    if (tabButtons.length > 0) {
        tabButtons.forEach(button => {
          button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            // Remover clase active de todos
            tabButtons.forEach(btn => btn.classList.remove('active'));
            forms.forEach(form => form.classList.remove('active'));
            
            // Activar actual
            button.classList.add('active');
            const targetForm = document.getElementById(`form${targetTab.charAt(0).toUpperCase() + targetTab.slice(1)}`);
            if (targetForm) targetForm.classList.add('active');
          });
        });
    }

    // 2. Forms Login - Conectar handleLoginSubmit
    const formEmp = $('#formEmployees');
    if (formEmp) {
        formEmp.removeEventListener('submit', handleLoginSubmit); // Limpieza preventiva
        formEmp.addEventListener('submit', handleLoginSubmit);
    }

    const formCon = $('#formContractors');
    if (formCon) {
        formCon.removeEventListener('submit', handleLoginSubmit); // Limpieza preventiva
        formCon.addEventListener('submit', handleLoginSubmit);
    }

    // 3. Botones extra
    const registerBtn = $('#registerEmp');
    if (registerBtn) {
      registerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showModal('Registro', 'Por favor contacta a RRHH para tu registro.', 'info');
      });
    }

    const forgotBtn = $('#forgotEmp');
    if (forgotBtn) {
      forgotBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showModal('Recuperación', 'Contacta a tu supervisor para restablecer tu acceso.', 'info');
      });
    }
  }

  // =================================================================
  // 7. ARRANQUE
  // =================================================================
  async function init() {
      // 1. Esperar a Supabase
      if (!window.supabase) { setTimeout(init, 50); return; }

      // 2. Validar Tenant en DB
      await validateLoginPage();
      
      // 3. Activar UI
      console.log('🏁 Login listo.');
      initializeInteractions(); 
  }

  // Disparador
  if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
  } else {
      init();
  }

})();