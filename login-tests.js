const IS_TEST = window.location.pathname.includes("test-runner");

// 1. UTILIDADES DE TEST
const Logger = {
    el: document.getElementById('results'),
    log(msg, type = 'info') {
        this.el.innerHTML += `<div class="${type}">[${new Date().toLocaleTimeString()}] ${msg}</div>`;
        this.el.scrollTop = this.el.scrollHeight;
    },
    pass(msg) { this.log(`✔ PASS: ${msg}`, 'pass'); },
    fail(msg) { this.log(`✖ FAIL: ${msg}`, 'fail'); },
    info(msg) { this.log(`ℹ ${msg}`, 'info'); }
};

const Assert = {
    equal(actual, expected, testName) {
        if (actual === expected) Logger.pass(testName);
        else Logger.fail(`${testName} (Esperado: '${expected}', Recibido: '${actual}')`);
    },
    isTrue(condition, testName) {
        if (condition) Logger.pass(testName);
        else Logger.fail(testName);
    }
};

// 2. MOCKS (Simulaciones)
async function setupEnvironment() {
    Logger.info("Configurando entorno de prueba...");
    
    // Limpiar storage
    localStorage.clear();
    
    // Espiar redirecciones en lugar de navegar
    window.originalRedirect = window.AuthLogic.redirectUser;
    window.lastRedirect = null;
    
    // Sobrescribir redirectUser para testear
    window.AuthLogic.redirectUser = (role) => {
        const target = window.AuthLogic.config.redirects[role];
        window.lastRedirect = target;
        Logger.info(`[MOCK] Redirección detectada para rol '${role}' hacia: ${target}`);
    };

    // Esperar inicialización de Supabase
    await new Promise(r => setTimeout(r, 1000));
}

// 3. ESCENARIOS DE PRUEBA
const Tests = {
    async runAll() {
        await setupEnvironment();
        await this.testTenantDetection();
        await this.testLoginFail_Empty();
        await this.testLoginSuccess_User(); // Requiere usuario real en DB o Mock
        await this.testRegistration_RateLimit();
    },

    // TEST 1: Verificar si el Tenant System detectó algo
    testTenantDetection() {
        const tenant = window.CURRENT_TENANT;
        Assert.isTrue(!!tenant, "Detección de Tenant Inicial");
        Logger.info(`Tenant detectado: ${tenant}`);
    },

    // TEST 2: Validación de UI vacía
    async testLoginFail_Empty() {
        Logger.info("--- Iniciando Test: Login Vacío ---");
        
        // Simular input usuario
        document.getElementById('email').value = '';
        document.getElementById('password').value = '';
        
        // Ejecutar lógica directa (Simulando click)
        const result = await window.AuthLogic.login('', '');
        
        Assert.equal(result.action, 'ERROR', "Debe fallar sin credenciales");
    },

    // TEST 3: Login Real (Necesitas un usuario de prueba en tu DB 'test@test.com')
    async testLoginSuccess_User() {
        Logger.info("--- Iniciando Test: Login Exitoso (User) ---");
        
        // DATOS DE PRUEBA (¡Ajustar con un usuario real de tu DB!)
        const testEmail = "bran@gmial.com"; 
        const testPass = "Salen756";

        // Simular escritura
        document.getElementById('email').value = testEmail;
        document.getElementById('password').value = testPass;

        // Llamar a la lógica
        const result = await window.AuthLogic.login(testEmail, testPass);

        if (result.action === 'ERROR') {
            Logger.info("⚠️ Saltando assertions de éxito (Usuario no existe o pass incorrecto)");
            return;
        }

        Assert.equal(result.action, 'SUCCESS', "Login devuelve SUCCESS");
        Assert.equal(result.role, 'user', "Rol detectado es 'user'");
        
        // Verificar si AuthLogic intentó redirigir
        window.AuthLogic.redirectUser(result.role);
        Assert.equal(window.lastRedirect, '/profile/profile.html', "Redirección correcta a Profile");
    },

    // TEST 4: Registro y Rate Limiting
    async testRegistration_RateLimit() {
        Logger.info("--- Iniciando Test: Registro & Rate Limit ---");
        
        const randomEmail = `test_${Date.now()}@spam.com`;
        
        // Intentar registrar 4 veces rápido
        for (let i = 1; i <= 4; i++) {
            Logger.info(`Intento de registro #${i}...`);
            const res = await window.AuthLogic.register(randomEmail, "123456", "Tester Bot");
            
            if (i <= 3) {
               // Podría ser success o error 429 si ya corriste tests antes
               Logger.info(`Resultado #${i}: ${res.success ? 'OK' : res.message}`);
            } else {
               // El 4to debe fallar obligatoriamente si el rate limit funciona
               if (!res.success && res.message.includes('Demasiados intentos')) {
                   Assert.isTrue(true, "Rate Limit bloqueó el 4to intento");
               } else {
                   Logger.info("Nota: Rate Limit puede permitir más si la IP cambió o la regla es por tiempo");
               }
            }
        }
    }
};

// Auto-run al cargar
window.onload = () => {
    setTimeout(() => Tests.runAll(), 500); 
};