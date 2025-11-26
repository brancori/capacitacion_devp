// ==========================================
// 0. VARIABLES GLOBALES (PARA QUE TODOS LAS VEAN)
// ==========================================
// Estas variables viven fuera de las funciones para que startQuiz y renderPage compartan los datos.
let supabase; 
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

    // Esperar a que el Proxy de Supabase esté listo
    if (!window.supabase || typeof window.supabase.from !== 'function') {
        setTimeout(initCourse, 100);
        return;
    }

    supabase = window.supabase;

    // 1.1 Conectar variables con el HTML
    pageContentEl = document.getElementById("pageContent");
    sidebarListEl = document.getElementById("sidebarList");
    prevPageBtn = document.getElementById("prevPageBtn");
    nextPageBtn = document.getElementById("nextPageBtn");
    courseTitleEl = document.getElementById("courseTitle");
    footerMessageEl = document.getElementById("footerMessage");

    if (!pageContentEl || !sidebarListEl) {
        console.error("❌ [ERROR] Elementos del DOM no encontrados.");
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
    console.log(`🔎 [DEBUG] ID buscado en URL: ${courseId}`);

    if (!courseId) {
        pageContentEl.innerHTML = "<p class='error-message'>Error: URL sin ID.</p>";
        return;
    }

    try {
        // 1. AUTO-REPARACIÓN DE SESIÓN
        let { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (!session || sessionError) {
            console.warn("⚠️ [RECOVERY] Buscando token manual...");
            const customKey = Object.keys(window.localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));

            if (customKey) {
                try {
                    const token = JSON.parse(window.localStorage.getItem(customKey));
                    const { data: rec } = await supabase.auth.setSession({
                        access_token: token.access_token,
                        refresh_token: token.refresh_token
                    });
                    if (rec.session) session = rec.session;
                } catch (e) { }
            }
        }

        if (!session) {
            alert("Sesión expirada.");
            window.location.href = '../../index.html';
            return;
        }

        // 2. DATOS DE USUARIO
        const user = session.user;
        const myRole = user?.app_metadata?.role || user?.user_metadata?.role || localStorage.getItem('role') || 'authenticated';
        const myTenantId = user?.app_metadata?.tenant_id || user?.user_metadata?.tenant_id || localStorage.getItem('tenant');

        console.log(`👤 [DEBUG] User: ${user.email} | Rol: ${myRole}`);

        // 3. QUERY
        let query = supabase
            .from("articles")
            .select("title, content_json, quiz_json, tenant_id")
            .eq("id", courseId);

        if (myRole !== "master" && myRole !== "admin") {
            if (myTenantId) query = query.eq("tenant_id", myTenantId);
        }

        // ⚠️ NOTA: Quitamos .single() por seguridad para manejar el array manualmente
        const { data: rawData, error } = await query;

        if (error) {
            console.error("❌ [SUPABASE ERROR]:", error);
            pageContentEl.innerHTML = `<div class='error-message'>Error BD: ${error.message}</div>`;
            return;
        }

        // ============================================================
        // 🛠️ FIX DEL ARRAY (La corrección mágica)
        // ============================================================
        // Si rawData es un array (lista), tomamos el primero. Si es objeto, lo usamos directo.
        const fetchedCourse = Array.isArray(rawData) ? rawData[0] : rawData;

        if (!fetchedCourse) {
            pageContentEl.innerHTML = "<div class='error-message'>Curso no encontrado (posible bloqueo RLS).</div>";
            return;
        }

        console.log("✅ [EXITO] Título:", fetchedCourse.title);

        // 5. PROCESAMIENTO
        let finalCourseData;
        if (typeof fetchedCourse.content_json === 'string') {
            try {
                finalCourseData = JSON.parse(fetchedCourse.content_json);
            } catch (e) {
                pageContentEl.innerHTML = `<div class='error-message'>JSON Corrupto: ${e.message}</div>`;
                return;
            }
        } else {
            finalCourseData = fetchedCourse.content_json || { pages: [] };
        }

        // Limpieza de quizzes viejos
        if (finalCourseData.pages) {
            finalCourseData.pages = finalCourseData.pages.filter(p => p.type !== 'quiz');
        }

        // Inyección del Quiz
        if (fetchedCourse.quiz_json) {
            try {
                let quizObj = typeof fetchedCourse.quiz_json === 'string' ? JSON.parse(fetchedCourse.quiz_json) : fetchedCourse.quiz_json;
                if (quizObj?.questions?.length > 0) {
                    finalCourseData.pages.push({ type: 'quiz', title: 'Evaluación Final', payload: quizObj });
                }
            } catch (e) {}
        }

        // 6. RECUPERAR PROGRESO
        let startIndex = 0;
        try {
            const { data: assignment } = await supabase
                .from('user_course_assignments')
                .select('progress, status')
                .eq('user_id', user.id)
                .eq('course_id', courseId)
                // Aquí también aplicamos el fix por si acaso devuelve array
                .maybeSingle(); 

            if (assignment && assignment.status !== 'completed' && assignment.progress > 0) {
                 const contentPages = finalCourseData.pages.filter(p => p.type !== 'quiz');
                 if (contentPages.length > 0) {
                    startIndex = Math.round((assignment.progress / 90) * contentPages.length) - 1;
                    startIndex = Math.max(0, Math.min(startIndex, finalCourseData.pages.length - 1));
                 }
            }
        } catch (err) {}

        loadCourseUI(fetchedCourse.title, finalCourseData, startIndex);

    } catch (e) {
        console.error("❌ [CRITICO]:", e);
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
        case 'flipCards':
            renderFlipCards(page);
            break;

        case 'interactive':
            renderInteractive(page);
            break;

        case 'stepByStep':
            renderStepByStep(page);
            break;

        case 'comparison':
            renderComparison(page);
            break;
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

function renderFlipCards(page) {
    let html = page.payload.instruction || '';
    
    html += '<div class="flip-cards-container">';
    page.payload.cards.forEach(card => {
        html += `
            <div class="flip-card" onclick="this.classList.toggle('flipped')">
                <div class="flip-card-inner">
                    <div class="flip-card-front" style="background:${card.front.color}">
                        <div class="card-icon">${card.front.icon}</div>
                        <div class="card-letter">${card.front.letter}</div>
                        <div class="card-title">${card.front.title}</div>
                    </div>
                    <div class="flip-card-back">
                        <p><strong>${card.back.content}</strong></p>
                        <hr style="border-color:rgba(255,255,255,0.3); margin:15px 0;">
                        <p style="font-size:0.85rem;">⚡ ${card.back.action}</p>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    if (page.payload.summary) {
        html += page.payload.summary;
    }
    
    pageContentEl.innerHTML = html; // 
}

// ============================================
// RENDER: Interactive (Contenido interactivo)
// ============================================
function renderInteractive(page) {
     pageContentEl.innerHTML = page.payload.html;
}

// ============================================
// RENDER: StepByStep (Pasos numerados)
// ============================================
function renderStepByStep(page) {
    let html = page.payload.intro || '';
    
    html += '<div class="steps-container">';
    page.payload.steps.forEach(step => {
        html += `
            <div class="step-card">
                <div class="step-number">${step.number}</div>
                <div class="step-content">
                    <div class="step-icon">${step.icon}</div>
                    <h3 class="step-title">${step.title}</h3>
                    <p class="step-description">${step.content}</p>
                    ${step.tip ? `<div class="step-tip">💡 <strong>Tip:</strong> ${step.tip}</div>` : ''}
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    if (page.payload.criticalNumbers) {
        html += page.payload.criticalNumbers;
    }
    
    if (page.payload.warnings) {
        html += page.payload.warnings;
    }
    
    pageContentEl.innerHTML = html;
}

// ============================================
// RENDER: Comparison (Igual que interactive)
// ============================================
function renderComparison(page) {
    pageContentEl.innerHTML = page.payload.html;
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

    // 1. Calcular calificación
    questionDivs.forEach((div, idx) => {
        const correctAns = parseInt(div.getAttribute('data-correct'));
        const userAns = currentAnswers[idx];
        if (userAns === correctAns) correctCount++;

        // Deshabilitar UI y mostrar correcciones visuales
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

    // 2. Definir estado y progreso según resultado
    // Si reprueba: Vuelve a 0% y se queda 'in_progress'
    const statusToSave = passed ? 'completed' : 'in_progress';
    const progressToSave = passed ? 100 : 0;

    endQuizMode();

    // 3. Guardar en Supabase
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const courseId = new URLSearchParams(location.search).get("id");
        
        if (user && courseId) {
            await supabase.from('user_course_assignments').upsert({
                user_id: user.id,
                course_id: courseId,
                score: finalScore,
                progress: progressToSave, 
                status: statusToSave,
                assigned_at: new Date() // Actualizamos fecha para registrar el intento reciente
            }, { onConflict: 'user_id, course_id' });
            
            console.log(`[DB] Guardado: Score=${finalScore}, Status=${statusToSave}, Progress=${progressToSave}%`);
        }
    } catch (e) {
        console.error("[ERROR] Guardando resultado:", e);
    }

    // 4. Mostrar resultados
    showResultModal(passed, finalScore);

    // Opcional: Si reprobó, forzar recarga visual o llevar al inicio al cerrar el modal
    if (!passed) {
        // Esto asegura que la UI entienda que volvimos al inicio
        // Puedes agregarlo dentro del botón del modal o dejarlo que suceda al recargar
        console.log("Usuario reprobado. Progreso reiniciado.");
    }
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