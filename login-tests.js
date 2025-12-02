/* login-tests.js */

// 1. CONFIGURACIÓN (Va al principio de todo)
const TEST_DATA = {
    pass: "password123",
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
    }
};

// 3. AMBIENTE
async function setupEnvironment() {
    // Interceptamos la redirección para que no recargue la página
    window.AuthLogic.redirectUser = (role) => {
        const target = window.AuthLogic.config.redirects[role] || './index.html';
        window.lastRedirect = target;
        Logger.log(`[MOCK] Redirección hacia: ${target}`, 'info');
    };
    
    // Limpiamos datos previos
    window.lastRedirect = null;
    const emailInput = document.getElementById('email');
    if(emailInput) emailInput.value = '';
    const passInput = document.getElementById('password');
    if(passInput) passInput.value = '';
    
    await new Promise(r => setTimeout(r, 300));
}

// 4. SUITE DE PRUEBAS
const Suite = {
    
    async runAll() {
        Logger.clear();
        Logger.header("🚀 INICIANDO SUITE MULTI-ROL");
        
        await setupEnvironment();

        // 1. Prueba de validación
        await this.test_ValidationEmpty();
        
        // 2. Pruebas de Roles (Usa los datos de TEST_DATA arriba)
        await this.test_RoleLogin('master',     '/dashboard.html');
        await this.test_RoleLogin('admin',      '/dashboard.html');
        await this.test_RoleLogin('supervisor', '/dashboard.html');
        await this.test_RoleLogin('auditor',    '/dashboard.html');
        await this.test_RoleLogin('user',       '/profile/profile.html');

        Logger.header("🏁 SUITE FINALIZADA");
    },

    async test_RoleLogin(roleName, expectedRedirect) {
        Logger.header(`Test Login: ${roleName.toUpperCase()}`);
        
        const email = TEST_DATA.users[roleName];
        const pass = TEST_DATA.pass;
        
        // Ponemos los datos en el HTML para verlos
        const emailInput = document.getElementById('email');
        if(emailInput) emailInput.value = email;

        // Ejecutamos el login
        const res = await window.AuthLogic.login(email, pass);

        if (res.action === 'ERROR') {
            Logger.fail(`Login falló: ${res.message}`);
            return;
        }

        Assert.equal(res.action, 'SUCCESS', "Login exitoso");
        Assert.equal(res.role, roleName, `Rol detectado es '${roleName}'`);
        
        // Verificamos la redirección
        window.lastRedirect = null;
        window.AuthLogic.redirectUser(res.role);
        
        // Normalizamos rutas para evitar errores por './'
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

// 5. ACTIVAR BOTÓN (Ya no corre automático)
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnRunAll');
    if(btn) {
        btn.addEventListener('click', () => Suite.runAll());
    }
});