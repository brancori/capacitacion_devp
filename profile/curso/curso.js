// ==========================================
// 0. VARIABLES GLOBALES (PARA QUE TODOS LAS VEAN)
// ==========================================
// Estas variables viven fuera de las funciones para que startQuiz y renderPage compartan los datos.
const supabase = window.supabase;
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
    console.log('[INIT] Iniciando carga del curso...');

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
        // 1. Obtener Usuario
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        const myTenantId = user?.user_metadata?.tenant_id;
        const myRole = user?.user_metadata?.role;

        // 2. Cargar Curso (Articles)
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

        // ============================================================
        // PASO CRÍTICO: PROCESAR Y PARSEAR DATOS **ANTES** DE USARLOS
        // ============================================================
        let finalCourseData;

        // A. Parseo seguro (String vs Objeto)
        if (typeof fetchedCourse.content_json === 'string') {
            try {
                finalCourseData = JSON.parse(fetchedCourse.content_json);
            } catch (e) {
                console.error("❌ Error parseando JSON:", e);
                pageContentEl.innerHTML = "<p>Error de formato en el curso.</p>";
                return;
            }
        } else {
            // Supabase ya lo devolvió como objeto
            finalCourseData = fetchedCourse.content_json || { pages: [] };
        }

        // B. Limpieza de quizzes viejos (si existen en el JSON manual)
        if (finalCourseData.pages) {
            finalCourseData.pages = finalCourseData.pages.filter(p => 
                p.type !== 'quiz' && p.title !== 'Evaluación Final'
            );
        }

        // C. Inyección del nuevo Quiz desde la columna quiz_json
        if (fetchedCourse.quiz_json) {
            let quizObj = typeof fetchedCourse.quiz_json === 'string' 
                ? JSON.parse(fetchedCourse.quiz_json) 
                : fetchedCourse.quiz_json;

            if (quizObj && quizObj.questions && quizObj.questions.length > 0) {
                finalCourseData.pages.push({
                    type: 'quiz',
                    title: 'Evaluación Final',
                    payload: quizObj
                });
            }
        }

        // ============================================================
        // AHORA SÍ: RECUPERAR PROGRESO (Usando finalCourseData ya listo)
        // ============================================================
        let startIndex = 0;
        if (user) {
            const { data: assignment } = await supabase
                .from('user_course_assignments')
                .select('progress, status')
                .eq('user_id', user.id)
                .eq('course_id', courseId)
                .single();

            if (assignment && assignment.status !== 'completed' && assignment.progress > 0) {
                // Usamos finalCourseData que ya está limpio y es un objeto seguro
                // Filtramos el quiz para calcular el progreso real de lectura
                const contentPages = finalCourseData.pages.filter(p => p.type !== 'quiz');
                const totalContentPages = contentPages.length;
                
                if (totalContentPages > 0) {
                    // Fórmula: (progress / 90) * totalPages - 1
                    startIndex = Math.round((assignment.progress / 90) * totalContentPages) - 1;
                    // Asegurar límites (mínimo 0, máximo última página)
                    startIndex = Math.max(0, Math.min(startIndex, finalCourseData.pages.length - 1));
                    
                    console.log(`🔄 [RESUME] Progreso: ${assignment.progress}%. Reanudando en página: ${startIndex}`);
                }
            }
        }

        // 5. Cargar UI
        loadCourseUI(fetchedCourse.title, finalCourseData, startIndex);

    } catch (e) {
        console.error("❌ [CRITICO] Error en fetchCourseData:", e);
    }
}

// ==========================================
// 3. GENERACIÓN DE INTERFAZ (UI)
// ==========================================
function loadCourseUI(title, data, startIndex = 0) {
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

    // Validar que el startIndex no supere el total de páginas (por seguridad)
    if (startIndex >= courseData.pages.length) {
        startIndex = courseData.pages.length - 1;
    }

    // Renderizar la página recuperada
    renderPage(startIndex);
}

// ==========================================
// 4. RENDERIZADO DE PÁGINA (CORE)
// ==========================================
// Se asigna a window para que el HTML pueda llamarla
window.renderPage = function(index) {
    console.log(`[RENDER] Intentando ir a página ${index}`);

    // Bloqueo de Quiz (Sin cambios)
    if (isQuizInProgress) {
        if(!confirm("⚠️ ¡Evaluación en curso! Si sales, perderás progreso.")) return;
        else endQuizMode();
    }

    // Validación de datos
    if (!courseData || !courseData.pages || !courseData.pages[index]) {
        console.error("❌ [RENDER] Página no encontrada o datos vacíos");
        return;
    }

    // Limpiar modal si existe
    const modal = document.getElementById('resultModal');
    if (modal) modal.style.display = 'none';

    currentPageIndex = index;
    const page = courseData.pages[currentPageIndex];
    pageContentEl.innerHTML = ''; // Limpiar pantalla anterior

    // Guardar progreso (si no es quiz)
    if (page.type !== 'quiz') saveProgress(index, false);

    // =======================================================
    // AQUÍ ESTÁ LA SOLUCIÓN: MANEJAR CADA TIPO CORRECTAMENTE
    // =======================================================
    switch (page.type) {
        case 'text':
            // IMPORTANTE: Tu JSON usa page.payload.html
            if (page.payload && page.payload.html) {
                pageContentEl.innerHTML = page.payload.html;
            } else {
                pageContentEl.innerHTML = "<p>⚠️ Error: Esta página de texto no tiene contenido HTML.</p>";
            }
            break;

        case 'video':
            // Asumiendo que el JSON de video usa page.payload.url
            if (page.payload && page.payload.url) {
                pageContentEl.innerHTML = `
                    <div class="video-container" style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden;">
                        <iframe style="position:absolute; top:0; left:0; width:100%; height:100%;" 
                                src="${page.payload.url}" 
                                frameborder="0" allowfullscreen>
                        </iframe>
                    </div>
                    ${page.payload.description ? `<p style="margin-top:1rem">${page.payload.description}</p>` : ''}
                `;
            }
            break;

        case 'quiz':
            // Si el quiz viene en el JSON de la página
            if (page.payload && page.payload.questions) {
                renderQuizTemplate(page.payload.questions);
            } else {
                pageContentEl.innerHTML = "<p>⚠️ Error: Datos del examen no encontrados.</p>";
            }
            break;

        default:
            pageContentEl.innerHTML = `<p>Tipo de contenido desconocido: ${page.type}</p>`;
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
            <!-- INTRO con advertencia - SE VE PRIMERO -->
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

            <!-- PREGUNTAS - OCULTAS hasta que inicie -->
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
    // Confirmación de seguridad
    if (!confirm("¿Estás seguro de comenzar?\n\nNo podrás volver a ver los videos hasta terminar.")) {
        return; // Cancela si dice "No"
    }

    // Activar bloqueo
    isQuizInProgress = true;
    
    // Ocultar intro, mostrar preguntas
    document.getElementById('quizIntro').style.display = 'none';
    document.getElementById('quizQuestionsContainer').style.display = 'block';
    
    // Bloquear navegación
    prevPageBtn.disabled = true;
    nextPageBtn.disabled = true;
    
    // Limpiar respuestas anteriores
    currentAnswers = {};
    window.scrollTo(0, 0);
};

// 5.2 SELECCIONAR OPCIÓN
window.selectOption = function(qIdx, oIdx) {
    if (!isQuizInProgress) return;
    currentAnswers[qIdx] = oIdx;
    const parent = document.getElementById(`q-${qIdx}`);
    parent.querySelectorAll('.quiz-btn').forEach((btn, idx) => {
        if (idx === oIdx) btn.classList.add('selected');
        else btn.classList.remove('selected');
    });
};

// 5.3 ENTREGAR EXAMEN (Guarda y Desbloquea)
window.submitQuiz = async function() {
    console.log("[QUIZ] Entregando examen...");
    
    const questionDivs = document.querySelectorAll('.quiz-options');
    let correctCount = 0;

    // Calificar (código existente)
    questionDivs.forEach((div, idx) => {
        const correctAns = parseInt(div.getAttribute('data-correct'));
        const userAns = currentAnswers[idx];
        if (userAns === correctAns) correctCount++;

        const btns = div.querySelectorAll('.quiz-btn');
        btns.forEach(b => b.disabled = true);

        if (userAns !== undefined && btns[userAns]) {
            btns[userAns].classList.add(userAns === correctAns ? 'correct' : 'incorrect');
        }
        if (btns[correctAns]) btns[correctAns].classList.add('correct');
    });

    const finalScore = Math.round((correctCount / questionDivs.length) * 100);
    const passed = finalScore >= 80;

    console.log(`[QUIZ] Resultado: ${finalScore}% (Aprobado: ${passed})`);

    // Desbloquear navegación
    endQuizMode();

    // ✅ GUARDAR CALIFICACIÓN Y PROGRESO 100%
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const courseId = new URLSearchParams(location.search).get("id");
        
        if (user && courseId) {
            await supabase.from('user_course_assignments').upsert({
                user_id: user.id,
                course_id: courseId,
                score: finalScore,
                progress: 100, // ✅ Siempre 100% al completar quiz
                status: passed ? 'completed' : 'failed',
                assigned_at: new Date()
            }, { onConflict: 'user_id, course_id' });
            
            console.log(`[QUIZ] Guardado: Score=${finalScore}%, Progress=100%, Status=${passed ? 'completed' : 'failed'}`);
        }
    } catch (e) {
        console.error("[ERROR] Guardando resultado:", e);
    }

    // Mostrar modal
    showResultModal(passed, finalScore);
};


async function saveProgress(pageIndex, isQuizCompleted = false) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const courseId = new URLSearchParams(location.search).get("id");
        
        if (!user || !courseId) {
            console.warn("[PROGRESS] No hay usuario o curso ID");
            return;
        }

        // Calcular porcentaje
        let progress;
        if (isQuizCompleted) {
            progress = 100; // Quiz terminado = 100%
        } else {
            // (página actual + 1) / total páginas * 100
            // Pero el quiz no cuenta hasta completarlo, así que máximo 90%
            const totalWithoutQuiz = courseData.pages.length;
            progress = Math.round(((pageIndex + 1) / totalWithoutQuiz) * 90);
            progress = Math.min(progress, 90); // Máximo 90% sin quiz
        }

        console.log(`[PROGRESS] Guardando progreso: ${progress}%`);

        // Verificar si ya existe un registro
        const { data: existing } = await supabase
            .from('user_course_assignments')
            .select('status, score')
            .eq('user_id', user.id)
            .eq('course_id', courseId)
            .single();

        // Si ya completó el curso, no sobrescribir
        if (existing?.status === 'completed') {
            console.log("[PROGRESS] Curso ya completado, no se actualiza");
            return;
        }

        // Guardar progreso
        await supabase.from('user_course_assignments').upsert({
            user_id: user.id,
            course_id: courseId,
            progress: progress,
            status: progress < 100 ? 'in_progress' : existing?.status || 'in_progress',
            assigned_at: new Date()
        }, { onConflict: 'user_id, course_id' });

        console.log(`[PROGRESS] Guardado exitosamente: ${progress}%`);

    } catch (e) {
        console.error("[PROGRESS] Error guardando progreso:", e);
    }
}

function endQuizMode() {
    console.log(" [QUIZ] Modo examen finalizado. Navegación liberada.");
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
document.addEventListener('DOMContentLoaded', initCourse);