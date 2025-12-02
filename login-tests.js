/* login-tests.js - Suite Completa: Login + Registro + Multi-Tenant */

// 1. CONFIGURACIÓN
const TEST_DATA = {
    pass: "password123",
    tenant: "test-suite",
    otherTenant: "other-company",
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
    testsPassed: 0,
    testsFailed: 0,
    
    clear() { 
        this.el.innerHTML = ''; 
        this.testsPassed = 0;
        this.testsFailed = 0;
    },
    
    log(msg, type = 'info') {
        const time = new Date().toLocaleTimeString();
        this.el.innerHTML += `<div class="${type}">[${time}] ${msg}</div>`;
        this.el.scrollTop = this.el.scrollHeight;
    },
    
    pass(msg) { 
        this.testsPassed++;
        this.log(`✔ PASS: ${msg}`, 'pass'); 
    },
    
    fail(msg) { 
        this.testsFailed++;
        this.log(`✖ FAIL: ${msg}`, 'fail'); 
    },
    
    header(msg) { 
        this.log(`<br><strong>=== ${msg} ===</strong>`, 'info'); 
    },
    
    separator() { 
        this.log('<hr style="border: 1px solid #444; margin: 10px 0;">', 'info'); 
    },
    
    summary() {
        const total = this.testsPassed + this.testsFailed;
        const percentage = total > 0 ? ((this.testsPassed / total) * 100).toFixed(1) : 0;
        
        this.separator();
        this.log(`<strong>📊 RESUMEN FINAL:</strong>`, 'info');
        this.log(`   Total: ${total} tests`, 'info');
        this.log(`   ✔ Pasados: ${this.testsPassed}`, 'pass');
        if (this.testsFailed > 0) {
            this.log(`   ✖ Fallidos: ${this.testsFailed}`, 'fail');
        }
        this.log(`   📈 Tasa de éxito: ${percentage}%`, percentage === '100.0' ? 'pass' : 'fail');
    }
};

const Assert = {
    equal(actual, expected, context) {
        if (actual === expected) {
            Logger.pass(context);
        } else {
            Logger.fail(`${context} (Esperado: '${expected}', Recibido: '${actual}')`);
        }
    },
    
    isTrue(condition, context) {
        if (condition) {
            Logger.pass(context);
        } else {
            Logger.fail(`${context} (Condición no cumplida)`);
        }
    },
    
    contains(str, substring, context) {
        if (str && str.includes(substring)) {
            Logger.pass(context);
        } else {
            Logger.fail(`${context} ('${str}' no contiene '${substring}')`);
        }
    }
};

// 3. HELPERS DE BASE DE DATOS
const DBHelper = {
    async seedTestUsers(customUsers = null, cleanup = false) {
        Logger.log("📦 Inicializando usuarios de prueba...", 'info');
        try {
            const { data, error } = await window.supabase.functions.invoke('seed-users', {
                body: { 
                    cleanup: cleanup,
                    tenant_slug: TEST_DATA.tenant,
                    custom_users: customUsers
                }
            });

            if (error) throw error;
            
            if (data.success) {
                Logger.pass(`Usuarios creados: ${data.results.length}`);
                return { success: true, results: data.results };
            }
            
            throw new Error('Respuesta inesperada de seed-users');
        } catch (err) {
            Logger.fail(`Error creando usuarios: ${err.message}`);
            return { success: false, error: err.message };
        }
    },

    async createUserWithStatus(email, status = 'pending', forceReset = false, role = 'user') {
        const timestamp = Date.now();
        const testEmail = email.includes('@') ? email : `${email}.${timestamp}@test.com`;
        
        try {
            const result = await this.seedTestUsers([{
                email: testEmail,
                password: TEST_DATA.pass,
                role: role,
                status: status,
                force_reset: forceReset,
                full_name: `Test ${status} User`
            }], false);

            if (result.success) {
                return { success: true, email: testEmail };
            }
            
            throw new Error('No se pudo crear usuario');
        } catch (err) {
            Logger.fail(`Error creando usuario especial: ${err.message}`);
            return { success: false, error: err.message };
        }
    },

    async cleanup() {
        Logger.log("🧹 Limpiando datos de prueba...", 'info');
        try {
            const { data, error } = await window.supabase.functions.invoke('seed-users', {
                body: { 
                    cleanup: true,
                    tenant_slug: TEST_DATA.tenant,
                    custom_users: [] // No crear nada, solo limpiar
                }
            });

            if (error) throw error;
            Logger.pass("Limpieza completada");
            return { success: true };
        } catch (err) {
            Logger.log(`Advertencia en limpieza: ${err.message}`, 'info');
            return { success: false };
        }
    }
};

// 4. AMBIENTE
async function setupEnvironment() {
    window.CURRENT_TENANT = TEST_DATA.tenant;
    Logger.log(`🧪 [Setup] Configurando entorno de pruebas...`, 'info');

    // Interceptar redirección para tests
    window.AuthLogic.redirectUser = (role) => {
        const target = window.AuthLogic.config.redirects[role] || './index.html';
        window.lastRedirect = target;
        Logger.log(`[MOCK] Redirección simulada hacia: ${target}`, 'info');
    };
    
    // Limpiar UI
    window.lastRedirect = null;
    ['email', 'password'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
    
    await new Promise(r => setTimeout(r, 500));
}

// 5. SUITE DE PRUEBAS
const Suite = {
    
    async runAll() {
        Logger.clear();
        Logger.header("🚀 INICIANDO SUITE COMPLETA DE TESTING");
        Logger.log(`Tenant objetivo: ${TEST_DATA.tenant}`, 'info');
        
        await setupEnvironment();

        // PREPARACIÓN: Limpiar y crear usuarios base
        Logger.separator();
        Logger.header("⚙️ PREPARACIÓN DEL ENTORNO");
        
        await DBHelper.cleanup();
        const seedResult = await DBHelper.seedTestUsers(null, true);
        
        if (!seedResult.success) {
            Logger.fail("❌ No se pudieron crear usuarios de prueba. Tests abortados.");
            Logger.summary();
            return;
        }

        // Esperar a que se propaguen los cambios
        await new Promise(r => setTimeout(r, 1000));

        // BLOQUE 1: Validaciones básicas
        Logger.separator();
        Logger.header("📋 BLOQUE 1: VALIDACIONES BÁSICAS");
        await this.test_ValidationEmpty();
        await this.test_ValidationInvalidCredentials();

        // BLOQUE 2: Registro de nuevo usuario
        Logger.separator();
        Logger.header("📋 BLOQUE 2: REGISTRO DE USUARIOS");
        await this.test_RegistrationFlow();

        // BLOQUE 3: Login por roles
        Logger.separator();
        Logger.header("📋 BLOQUE 3: LOGIN POR ROLES");
        await this.test_RoleLogin('master',     '/dashboard.html');
        await this.test_RoleLogin('admin',      '/dashboard.html');
        await this.test_RoleLogin('supervisor', '/dashboard.html');
        await this.test_RoleLogin('auditor',    '/dashboard.html');
        await this.test_RoleLogin('user',       '/profile/profile.html');

        // BLOQUE 4: Estados especiales
        Logger.separator();
        Logger.header("📋 BLOQUE 4: ESTADOS ESPECIALES");
        await this.test_PendingUserBlocked();
        await this.test_ForceResetFlow();

        // BLOQUE 5: Multi-tenant
        Logger.separator();
        Logger.header("📋 BLOQUE 5: AISLAMIENTO MULTI-TENANT");
        await this.test_CrossTenantRejection();

        // RESUMEN FINAL
        Logger.header("🏁 SUITE FINALIZADA");
        Logger.summary();
    },

    // ==================== VALIDACIONES ====================
    async test_ValidationEmpty() {
        Logger.log("Test: Campos vacíos deben ser rechazados", 'info');
        const res = await window.AuthLogic.login('', '');
        Assert.equal(res.action, 'ERROR', "Rechaza campos vacíos");
    },

    async test_ValidationInvalidCredentials() {
        Logger.log("Test: Credenciales inválidas", 'info');
        const res = await window.AuthLogic.login('noexiste@test.com', 'wrongpass');
        Assert.equal(res.action, 'ERROR', "Rechaza credenciales incorrectas");
    },

    // ==================== REGISTRO ====================
    async test_RegistrationFlow() {
        Logger.log("Test: Flujo completo de registro", 'info');

        const timestamp = Date.now();
        const regEmail = `test.reg.${timestamp}@test.com`;
        const regName = "Usuario Test Registro";

        // Paso 1: Registrar nuevo usuario
        Logger.log(`  → Registrando: ${regEmail}`, 'info');
        const regRes = await window.AuthLogic.register(regEmail, TEST_DATA.pass, regName);
        
        if (!regRes.success) {
            Logger.fail(`Registro falló: ${regRes.message}`);
            return;
        }
        
        Assert.isTrue(regRes.success, "Registro completado exitosamente");

        // Paso 2: Verificar que NO pueda hacer login (pending)
        Logger.log("  → Verificando bloqueo por aprobación pendiente...", 'info');
        await new Promise(r => setTimeout(r, 500)); // Esperar propagación
        
        const loginRes = await window.AuthLogic.login(regEmail, TEST_DATA.pass);
        Assert.equal(loginRes.action, 'ERROR', "Usuario sin aprobar bloqueado correctamente");
    },

    // ==================== LOGIN POR ROLES ====================
    async test_RoleLogin(roleName, expectedRedirect) {
        Logger.log(`Test: Login como ${roleName.toUpperCase()}`, 'info');
        
        const email = TEST_DATA.users[roleName];
        
        // Esperar propagación para usuarios recién creados
        await new Promise(r => setTimeout(r, 300));
        
        const res = await window.AuthLogic.login(email, TEST_DATA.pass);

        if (res.action === 'ERROR') {
            Logger.fail(`Login falló para ${roleName}: ${res.message}`);
            Logger.log(`  💡 Verifica que custom-login permita: ${email}`, 'info');
            return;
        }

        Assert.equal(res.action, 'SUCCESS', `Login exitoso como ${roleName}`);
        Assert.equal(res.role, roleName, `Rol detectado correctamente: ${roleName}`);
        
        // Verificar redirección
        window.lastRedirect = null;
        window.AuthLogic.redirectUser(res.role);
        
        const cleanRedirect = window.lastRedirect ? window.lastRedirect.replace('./', '/') : '';
        const cleanExpected = expectedRedirect.replace('./', '/');
        
        Assert.equal(cleanRedirect, cleanExpected, `Redirección correcta a ${cleanExpected}`);
    },

    // ==================== ESTADOS ESPECIALES ====================
    async test_PendingUserBlocked() {
        Logger.log("Test: Usuario con status=pending debe estar bloqueado", 'info');

        const result = await DBHelper.createUserWithStatus('pending', 'pending', false);
        
        if (!result.success) {
            Logger.fail("No se pudo crear usuario de prueba");
            return;
        }

        await new Promise(r => setTimeout(r, 500));
        
        const loginRes = await window.AuthLogic.login(result.email, TEST_DATA.pass);
        
        // Según custom-login: pending + force_reset=false → debe bloquear
        // Pero pending + force_reset=true → devuelve FORCE_RESET
        Assert.equal(loginRes.action, 'ERROR', "Usuario pending bloqueado correctamente");
        
        if (loginRes.error_code) {
            Logger.log(`  → Código de error: ${loginRes.error_code}`, 'info');
        }
    },

    async test_ForceResetFlow() {
        Logger.log("Test: Usuario con force_reset=true debe mostrar modal", 'info');

        // Crear usuario con force_reset
        const result = await DBHelper.createUserWithStatus('forcereset', 'pending', true);
        
        if (!result.success) {
            Logger.fail("No se pudo crear usuario de prueba");
            return;
        }

        await new Promise(r => setTimeout(r, 500));
        
        const loginRes = await window.AuthLogic.login(result.email, TEST_DATA.pass);
        
        // Según custom-login línea 40-47: pending + force_reset → FORCE_RESET
        Assert.equal(loginRes.action, 'FORCE_RESET', "Sistema detecta FORCE_RESET correctamente");
        Assert.isTrue(!!loginRes.user_id, "user_id presente en respuesta");
        
        Logger.log("  ✅ Modal de configuración inicial debe abrirse", 'pass');
    },

    // ==================== MULTI-TENANT ====================
    async test_CrossTenantRejection() {
        Logger.log("Test: Usuario de otro tenant debe ser rechazado", 'info');

        // Crear usuario en otro tenant
        try {
            const timestamp = Date.now();
            const email = `othertenant.${timestamp}@test.com`;
            
            await window.supabase.functions.invoke('seed-users', {
                body: {
                    tenant_slug: TEST_DATA.otherTenant,
                    custom_users: [{
                        email: email,
                        password: TEST_DATA.pass,
                        role: 'user',
                        status: 'active',
                        force_reset: false
                    }]
                }
            });

            await new Promise(r => setTimeout(r, 500));

            // Intentar login en tenant actual (test-suite)
            window.CURRENT_TENANT = TEST_DATA.tenant;
            const res = await window.AuthLogic.login(email, TEST_DATA.pass);
            
            // Según custom-login línea 69-71: WRONG_TENANT o AUTH_ERROR
            Assert.equal(res.action, 'ERROR', "Usuario de otro tenant rechazado");
            
            if (res.error_code) {
                Logger.log(`  → Código: ${res.error_code}`, 'info');
                Assert.isTrue(
                    res.error_code === 'WRONG_TENANT' || res.error_code === 'AUTH_ERROR',
                    "Código de error apropiado"
                );
            }
        } catch (err) {
            Logger.log(`Advertencia: ${err.message}`, 'info');
        }
    }
};

// 6. INICIALIZAR
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnRunAll');
    if(btn) {
        btn.addEventListener('click', () => Suite.runAll());
    }
});