// ==========================================
// 0. VARIABLES GLOBALES (PARA QUE TODOS LAS VEAN)
// ==========================================
// Estas variables viven fuera de las funciones para que startQuiz y renderPage compartan los datos.
let courseData = null;
let currentPageIndex = 0;
let isQuizInProgress = false; // 🔒 El candado del examen
let currentAnswers = {};      // Respuestas temporales

// Referencias a elementos del HTML (se llenan al iniciar)
let pageContentEl, sidebarListEl, prevPageBtn, nextPageBtn, courseTitleEl, footerMessageEl;

// ==========================================
// 1. INICIO DEL CURSO
// ==========================================
async function initCourse() {
    console.log('🚀 [INIT] Iniciando carga del curso...');

    // 1.1 Conectar variables con el HTML
    pageContentEl = document.getElementById("pageContent");
    sidebarListEl = document.getElementById("sidebarList");
    prevPageBtn = document.getElementById("prevPageBtn");
    nextPageBtn = document.getElementById("nextPageBtn");
    courseTitleEl = document.getElementById("courseTitle");
    footerMessageEl = document.getElementById("footerMessage");

    if (!pageContentEl || !sidebarListEl) {
        console.error("❌ [ERROR] No se encontraron elementos del DOM. Revisa tu HTML.");
        return;
    }

    // 1.2 Cargar Estilos (Tenant)
    if (window.tenantManager) {
        try {
            await window.tenantManager.loadFromJson();
            window.tenantManager.applyStyles();
        } catch (e) { console.warn("⚠️ TenantManager error:", e); }
    }
    document.body.style.opacity = '1';

    // 1.3 Configurar Botones Anterior/Siguiente
    prevPageBtn.onclick = () => {
        if (currentPageIndex > 0) renderPage(currentPageIndex - 1);
    };
    nextPageBtn.onclick = () => {
        if (courseData && currentPageIndex < courseData.pages.length - 1) {
            renderPage(currentPageIndex + 1);
        }
    };

    // 1.4 Descargar datos de Supabase
    await fetchCourseData();
}

// ==========================================
// 2. CONEXIÓN CON SUPABASE
// ==========================================
async function fetchCourseData() {
    const params = new URLSearchParams(location.search);
    const courseId = params.get("id");
    console.log(`🔎 [SUPABASE] Buscando curso ID: ${courseId}`);

    if (!courseId) {
        pageContentEl.innerHTML = "<p class='error-message'>Error: URL sin ID.</p>";
        return;
    }

    try {
        // Auth Check
        const { data: userData } = await supabase.auth.getUser();
        const myTenantId = userData?.user?.user_metadata?.tenant_id;
        const myRole = userData?.user?.user_metadata?.role;

        let query = supabase
            .from("articles")
            .select("title, content_json, quiz_json, tenant_id")
            .eq("id", courseId);

        if (myRole !== "master" && myTenantId) {
            query = query.eq("tenant_id", myTenantId);
        }

        const { data: fetchedCourse, error } = await query.single();

        if (error || !fetchedCourse) {
            console.error("❌ [SUPABASE] Error:", error);
            pageContentEl.innerHTML = "<div class='error-message'>No se pudo cargar el curso.</div>";
            return;
        }

        console.log("✅ [SUPABASE] Curso descargado:", fetchedCourse.title);

        // Procesar Datos (Limpieza e Inyección)
        let finalCourseData = fetchedCourse.content_json;

        // A. Borrar quizzes viejos del JSON
        if (finalCourseData.pages) {
            finalCourseData.pages = finalCourseData.pages.filter(p => 
                p.type !== 'quiz' && p.title !== 'Evaluación Final'
            );
        }

        // B. Inyectar Quiz desde la columna quiz_json
        if (fetchedCourse.quiz_json) {
            console.log("📦 [DATA] Procesando quiz_json...");
            let quizObj = typeof fetchedCourse.quiz_json === 'string' 
                ? JSON.parse(fetchedCourse.quiz_json) 
                : fetchedCourse.quiz_json;

            if (quizObj.questions && quizObj.questions.length > 0) {
                finalCourseData.pages.push({
                    type: 'quiz',
                    title: 'Evaluación Final',
                    payload: quizObj
                });
                console.log(`➕ [DATA] Quiz agregado con ${quizObj.questions.length} preguntas.`);
            }
        } else {
            console.warn("⚠️ [DATA] No hay quiz_json en la base de datos.");
        }

        // Cargar UI
        loadCourseUI(fetchedCourse.title, finalCourseData);

    } catch (e) {
        console.error("❌ [CRITICO] Error en fetchCourseData:", e);
    }
}

// ==========================================
// 3. GENERACIÓN DE INTERFAZ (UI)
// ==========================================
function loadCourseUI(title, data) {
    courseData = data;
    courseTitleEl.textContent = title;

    if (!courseData.pages || courseData.pages.length === 0) {
        sidebarListEl.innerHTML = "<p>Curso vacío.</p>";
        return;
    }

    // Crear menú lateral
    sidebarListEl.innerHTML = courseData.pages.map((page, index) => {
        const titleText = page.title || `Tema ${index + 1}`;
        let icon = 'fa-file-alt';
        if (page.type === 'video') icon = 'fa-video';
        if (page.type === 'quiz') icon = 'fa-tasks';

        return `
            <button class="page-btn" onclick="window.renderPage(${index})">
                <i class="fas ${icon}"></i> 
                <span>${titleText}</span>
            </button>`;
    }).join('');

    // Renderizar primera página
    renderPage(0);
}

// ==========================================
// 4. RENDERIZADO DE PÁGINA (CORE)
// ==========================================
// Se asigna a window para que el HTML pueda llamarla
window.renderPage = function(index) {
    console.log(`🔄 [RENDER] Intentando ir a página ${index}. Estado Examen: ${isQuizInProgress}`);

    // --- 🔒 BLOQUEO DE SEGURIDAD ---
    // Si el examen está activo (TRUE) y tratas de cambiar de página...
    if (isQuizInProgress) {
        console.warn("⛔ [BLOQUEO] Navegación detenida por examen en curso.");
        if(!confirm("⚠️ ¡Evaluación en curso!\n\nSi sales ahora, perderás tu progreso.\n¿Estás seguro de que quieres salir?")) {
            return; // El usuario cancela la salida, se queda en el examen.
        } else {
            console.log("🔓 [BLOQUEO] Usuario forzó la salida.");
            endQuizMode(); // El usuario forzó la salida, limpiamos el estado.
        }
    }

    if (!courseData || !courseData.pages[index]) return;

    // Limpieza UI
    const modal = document.getElementById('resultModal');
    if (modal) modal.style.display = 'none';

    currentPageIndex = index;
    const page = courseData.pages[currentPageIndex];
    pageContentEl.innerHTML = '';

    console.log(`📺 [VIEW] Mostrando: ${page.type}`);

    // Renderizado según tipo
    switch (page.type) {
        case 'video':
            let vUrl = page.payload.url;
            if (vUrl.includes('cdn.com/intro.mp4')) vUrl = 'https://www.youtube.com/embed/M7lc1UVf-VE';
            const vHtml = (vUrl.includes('youtube') || vUrl.includes('vimeo'))
                ? `<iframe width="100%" height="500" src="${vUrl}" frameborder="0" allowfullscreen></iframe>`
                : `<video controls width="100%" height="500" src="${vUrl}"></video>`;
            pageContentEl.innerHTML = `<div class="page-video">${vHtml}</div>`;
            break;

        case 'text':
            pageContentEl.innerHTML = `<div class="page-text">${page.payload.html}</div>`;
            break;

        case 'quiz':
            if (!page.payload.questions) {
                pageContentEl.innerHTML = '<p>Error: JSON de preguntas vacío.</p>';
            } else {
                renderQuizTemplate(page.payload.questions);
            }
            break;

        default:
            pageContentEl.innerHTML = `<p>Tipo desconocido: ${page.type}</p>`;
    }

    updateNavigationUI(index);
};

function updateNavigationUI(index) {
    // Actualizar Footer
    prevPageBtn.disabled = (index === 0);
    nextPageBtn.disabled = (index === courseData.pages.length - 1);
    footerMessageEl.textContent = `Página ${index + 1} de ${courseData.pages.length}`;

    // Actualizar Sidebar
    const btns = document.querySelectorAll('.page-btn');
    btns.forEach((btn, idx) => {
        const isActive = idx === index;
        btn.classList.toggle('active', isActive);
        if (isActive) {
            setTimeout(() => btn.scrollIntoView({behavior: 'smooth', block: 'nearest'}), 100);
        }
    });
}

// ==========================================
// 5. LÓGICA DEL EXAMEN (QUIZ)
// ==========================================

function renderQuizTemplate(questions) {
    console.log("📝 [QUIZ] Renderizando plantilla de examen...");
    
    const questionsHtml = questions.map((q, qIdx) => `
        <div class="quiz-card">
            <h4 class="quiz-question-text">${qIdx + 1}. ${q.question}</h4>
            <div class="quiz-options" id="q-${qIdx}" data-correct="${q.answer}">
                ${q.options.map((opt, oIdx) => `
                    <button class="quiz-btn" onclick="window.selectOption(${qIdx}, ${oIdx})">
                        ${opt}
                    </button>
                `).join('')}
            </div>
        </div>
    `).join('');

    pageContentEl.innerHTML = `
        <div class="quiz-container">
            <div id="quizIntro" class="quiz-intro-card">
                <h3><i class="fas fa-graduation-cap"></i> Evaluación Final</h3>
                <p><strong>Total Preguntas:</strong> ${questions.length}</p>
                <div style="background:#fff3cd; color:#856404; padding:15px; margin:20px 0; border-radius:8px; border:1px solid #ffeeba;">
                    <strong>⚠️ ¡ATENCIÓN!</strong><br>
                    Al presionar "Comenzar", el modo examen se activará y 
                    <u>no podrás salir</u> hasta terminar.
                </div>
                <button class="btn btn-primary btn-lg" onclick="window.startQuiz()">
                    Comenzar Evaluación Ahora
                </button>
            </div>

            <div id="quizQuestionsContainer" style="display:none;">
                ${questionsHtml}
                <div style="margin-top: 30px; text-align: right;">
                    <button class="btn btn-primary" onclick="window.submitQuiz()">
                        Entregar y Calificar
                    </button>
                </div>
            </div>
        </div>`;
}

// 5.1 INICIAR EXAMEN (Activa el bloqueo)
window.startQuiz = function() {
    console.log("🔒 [QUIZ] Usuario intenta iniciar examen...");

    if (!confirm("¿Estás seguro de comenzar?\n\nNo podrás volver a ver los videos hasta terminar.")) {
        console.log("❌ [QUIZ] Usuario canceló inicio.");
        return;
    }

    // ACTIVAMOS EL CANDADO GLOBAL
    isQuizInProgress = true;
    console.log("✅ [QUIZ] Examen iniciado. isQuizInProgress = TRUE");

    // Efectos Visuales
    document.body.classList.add('quiz-mode'); 
    document.getElementById('quizIntro').style.display = 'none';
    document.getElementById('quizQuestionsContainer').style.display = 'block';
    
    // Reiniciar respuestas y scrollear arriba
    currentAnswers = {};
    window.scrollTo(0, 0);

    // Bloquear botones footer explícitamente
    prevPageBtn.disabled = true;
    nextPageBtn.disabled = true;
};

// 5.2 SELECCIONAR OPCIÓN
window.selectOption = function(qIdx, oIdx) {
    currentAnswers[qIdx] = oIdx;
    const parent = document.getElementById(`q-${qIdx}`);
    parent.querySelectorAll('.quiz-btn').forEach((btn, idx) => {
        if (idx === oIdx) btn.classList.add('selected');
        else btn.classList.remove('selected');
    });
};

// 5.3 ENTREGAR EXAMEN (Guarda y Desbloquea)
window.submitQuiz = async function() {
    console.log("📤 [QUIZ] Entregando examen...");
    
    const questionDivs = document.querySelectorAll('.quiz-options');
    let correctCount = 0;

    // Calificar
    questionDivs.forEach((div, idx) => {
        const correctAns = parseInt(div.getAttribute('data-correct'));
        const userAns = currentAnswers[idx];

        if (userAns === correctAns) correctCount++;

        // Bloquear inputs visualmente
        const btns = div.querySelectorAll('.quiz-btn');
        btns.forEach(b => b.disabled = true);

        if (btns[userAns]) {
            btns[userAns].classList.add(userAns === correctAns ? 'correct' : 'incorrect');
        }
        if (btns[correctAns]) btns[correctAns].classList.add('correct');
    });

    const finalScore = Math.round((correctCount / questionDivs.length) * 100);
    const passed = finalScore >= 80;

    console.log(`📊 [QUIZ] Resultado: ${finalScore}% (Aprobado: ${passed})`);

    // DESBLOQUEAR EL CANDADO GLOBAL
    endQuizMode();

    // Guardar en Supabase
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const courseId = new URLSearchParams(location.search).get("id");
        if (user && courseId) {
            await supabase.from('user_course_assignments').upsert({
                user_id: user.id, course_id: courseId, score: finalScore,
                status: passed ? 'completed' : 'failed', progress: 100, assigned_at: new Date()
            }, { onConflict: 'user_id, course_id' });
            console.log("💾 [SUPABASE] Calificación guardada.");
        }
    } catch (e) { console.error("❌ [ERROR] Guardando nota:", e); }

    // Mostrar Modal
    showResultModal(passed, finalScore);
};

function endQuizMode() {
    console.log("🔓 [QUIZ] Modo examen finalizado. Navegación liberada.");
    isQuizInProgress = false;
    document.body.classList.remove('quiz-mode');
    updateNavigationUI(currentPageIndex);
}

function showResultModal(passed, score) {
    const modal = document.getElementById('resultModal');
    const icon = document.getElementById('modalIcon');
    const title = document.getElementById('modalTitle');
    
    if (passed) {
        icon.innerHTML = '🏆';
        title.innerText = '¡Felicidades!';
        title.style.color = '#28a745';
    } else {
        icon.innerHTML = '⚠️';
        title.innerText = 'Sigue intentando';
        title.style.color = '#dc3545';
    }
    
    document.getElementById('modalScore').innerText = `${score}%`;
    document.getElementById('modalMessage').innerText = passed 
        ? 'Has aprobado el curso satisfactoriamente.' 
        : 'No alcanzaste el 80% mínimo requerido.';
        
    modal.style.display = 'flex';
}

// Iniciar todo al cargar la página
document.addEventListener('DOMContentLoaded', initCourse);asd