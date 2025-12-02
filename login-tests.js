/* login-tests.js - Suite Completa: Login + Registro */

// 1. CONFIGURACIÓN
const TEST_DATA = {
    pass: "password123",
    tenant: "test-suite",
    users: {
        master: "test.master@test.com",
        admin: "test.admin@test.com",
        supervisor: "test.supervisor@test.com",
        auditor: "test.auditor@test.com",
        user: "test.user@test.com"
    }
};

// 2. UTILIDADES
const Logger = {
    el: document.getElementById('results'),
    clear() { this.el.innerHTML = ''; },
    log(msg, type = 'info') {
        const time = new Date().toLocaleTimeString();
        this.el.innerHTML += `<div class="${type}">[${time}] ${msg}</div>`;
        this.el.scrollTop = this.el.scrollHeight;
    },
    pass(msg) { this.log(`✔ PASS: ${msg}`, 'pass'); },
    fail(msg) { this.log(`✖ FAIL: ${msg}`, 'fail'); },
    header(msg) { this.log(`<br><strong>=== ${msg} ===</strong>`, 'info'); }
};

const Assert = {
    equal(actual, expected, context) {
        if (actual === expected) Logger.pass(context);
        else Logger.fail(`${context} (Esperado: '${expected}', Recibido: '${actual}')`);
    },
    isTrue(condition, context) {
        if (condition) Logger.pass(context);
        else Logger.fail(`${context} (Condición no cumplida)`);
    }
};

// 3. AMBIENTE
async function setupEnvironment() {
    window.CURRENT_TENANT = 'test-suite';
    Logger.log("🧪 [Setup] Forzando entorno: Tenant 'test-suite'", 'info');

    // Interceptamos redirección
    window.AuthLogic.redirectUser = (role) => {
        const target = window.AuthLogic.config.redirects[role] || './index.html';
        window.lastRedirect = target;
        Logger.log(`[MOCK] Redirección hacia: ${target}`, 'info');
    };
    
    // Limpieza UI
    window.lastRedirect = null;
    ['email', 'password'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
    
    await new Promise(r => setTimeout(r, 300));
}

// 4. SUITE DE PRUEBAS
const Suite = {
    
    async runAll() {
        Logger.clear();
        Logger.header("🚀 INICIANDO SUITE COMPLETA");
        
        await setupEnvironment();

        // BLOQUE 1: Validaciones
        await this.test_ValidationEmpty();
        
        // BLOQUE 2: Registro de Usuario Nuevo
        await this.test_RegistrationFlow();

        // BLOQUE 3: Login por Roles
        await this.test_RoleLogin('master',     '/dashboard.html');
        await this.test_RoleLogin('admin',      '/dashboard.html');
        await this.test_RoleLogin('supervisor', '/dashboard.html');
        await this.test_RoleLogin('auditor',    '/dashboard.html');
        await this.test_RoleLogin('user',       '/profile/profile.html');

        Logger.header("🏁 SUITE FINALIZADA");
    },

    // --- NUEVO TEST DE REGISTRO ---
async test_RegistrationFlow() {
        Logger.header("Test Registro Nuevo Usuario");

        const timestamp = Date.now();
        const regEmail = `test.reg.${timestamp}@test.com`;
        const regPass = "password123";
        const regName = "Usuario Test Auto";

        Logger.log(`1. Enviando solicitud para: ${regEmail}`, 'info');

        // Paso A: Registro
        const res = await window.AuthLogic.register(regEmail, regPass, regName);

        if (!res.success) {
            Logger.fail(`Fallo al registrar: ${res.message}`);
            return;
        }
        Assert.isTrue(res.success, "Solicitud enviada exitosamente");

        // Paso B: Verificar Bloqueo
        Logger.log("2. Verificando que NO pueda entrar sin aprobación...", 'info');
        const loginRes = await window.AuthLogic.login(regEmail, regPass, TEST_DATA.tenant);
        
        if (loginRes.action === 'ERROR') {
             Logger.pass("Login bloqueado correctamente");
        } else {
             Logger.fail(`¡ALERTA! Usuario entró sin aprobación.`);
        }

        // --- PASO C: LIMPIEZA AUTOMÁTICA (NUEVO) ---
        Logger.log("3. Limpiando datos de prueba...", 'info');
        try {
            const { error } = await window.supabase.rpc('cleanup_test_data');
            
            if (error) {
                Logger.log(`Error en limpieza RPC: ${error.message}`, 'fail');
            } else {
                Logger.pass("🗑️ Usuario temporal eliminado de BD correctamente");
            }
        } catch (e) {
            Logger.log(`Excepción en limpieza: ${e.message}`, 'fail');
        }
    },

    // --- TESTS DE LOGIN ---
    async test_RoleLogin(roleName, expectedRedirect) {
        Logger.header(`Test Login: ${roleName.toUpperCase()}`);
        
        const email = TEST_DATA.users[roleName];
        const pass = TEST_DATA.pass;
        const tenant = TEST_DATA.tenant;
        
        const emailInput = document.getElementById('email');
        if(emailInput) emailInput.value = email;

        const res = await window.AuthLogic.login(email, pass, tenant);

        if (res.action === 'ERROR') {
            if (roleName === 'master') {
                 Logger.log("ℹ️ Nota: Master requiere lógica OR en backend", 'info');
            }
            Logger.fail(`Login falló: ${res.message}`);
            return;
        }

        Assert.equal(res.action, 'SUCCESS', "Login exitoso");
        Assert.equal(res.role, roleName, `Rol detectado es '${roleName}'`);
        
        window.lastRedirect = null;
        window.AuthLogic.redirectUser(res.role);
        
        const cleanRedirect = window.lastRedirect ? window.lastRedirect.replace('./', '/') : '';
        const cleanExpected = expectedRedirect.replace('./', '/');
        
        Assert.equal(cleanRedirect, cleanExpected, `Redirección a ${cleanExpected}`);
    },

    async test_ValidationEmpty() {
        Logger.header("Test Validación (Vacío)");
        const res = await window.AuthLogic.login('', '');
        Assert.equal(res.action, 'ERROR', "Debe rechazar vacíos");
    }
};

// 5. INICIALIZAR
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnRunAll');
    if(btn) {
        btn.addEventListener('click', () => Suite.runAll());
    }
});