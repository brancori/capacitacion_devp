// ==========================================
// VARIABLES GLOBALES (Estado y Referencias)
// ==========================================
let courseData = null;
let currentPageIndex = 0;
let isQuizInProgress = false; // Controla el bloqueo
let currentAnswers = {};      // Almacena respuestas temporales

// Referencias DOM (se llenan al iniciar)
let pageContentEl, sidebarListEl, prevPageBtn, nextPageBtn, courseTitleEl, footerMessageEl;

// ==========================================
// 1. INICIALIZACIÓN DEL CURSO
// ==========================================
async function initCourse() {
    console.log('🚀 === INICIANDO CURSO ===');

    // 1.1 Asignar referencias DOM globales
    pageContentEl = document.getElementById("pageContent");
    sidebarListEl = document.getElementById("sidebarList");
    prevPageBtn = document.getElementById("prevPageBtn");
    nextPageBtn = document.getElementById("nextPageBtn");
    courseTitleEl = document.getElementById("courseTitle");
    footerMessageEl = document.getElementById("footerMessage");

    // 1.2 Cargar configuración del Tenant
    if (window.tenantManager) {
        try {
            await window.tenantManager.loadFromJson();
            window.tenantManager.applyStyles();
            document.body.style.opacity = '1'; 
        } catch (e) {
            console.error("Error tenant:", e);
            document.body.style.opacity = '1';
        }
    } else {
        document.body.style.opacity = '1';
    }

    // 1.3 Event Listeners de Navegación
    // Usamos funciones flecha para referenciar las variables globales
    prevPageBtn.addEventListener('click', () => {
        if (currentPageIndex > 0) renderPage(currentPageIndex - 1);
    });

    nextPageBtn.addEventListener('click', () => {
        if (courseData && currentPageIndex < courseData.pages.length - 1) {
            renderPage(currentPageIndex + 1);
        }
    });

    // 1.4 Conexión con Supabase
    await fetchCourseData();
}

// ==========================================
// 2. OBTENCIÓN DE DATOS (SUPABASE)
// ==========================================
async function fetchCourseData() {
    const params = new URLSearchParams(location.search);
    const courseId = params.get("id");

    if (!courseId) {
        pageContentEl.innerHTML = "<p class='error-message'>Error: Falta ID de curso.</p>";
        return;
    }

    try {
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

        const { data: fetchedCourse, error: courseError } = await query.single();

        if (courseError || !fetchedCourse) {
            console.error("❌ Error Supabase:", courseError);
            pageContentEl.innerHTML = "<div class='error-message'>No se pudo cargar el curso.</div>";
            return;
        }

        // Preparar datos (Limpieza e Inyección de Quiz)
        let finalCourseData = fetchedCourse.content_json;

        // Limpiar quizzes viejos
        if (finalCourseData.pages) {
            finalCourseData.pages = finalCourseData.pages.filter(p => 
                p.type !== 'quiz' && p.title !== 'Evaluación Final'
            );
        }

        // Inyectar Quiz nuevo si existe
        if (fetchedCourse.quiz_json) {
            let quizObj = typeof fetchedCourse.quiz_json === 'string' 
                ? JSON.parse(fetchedCourse.quiz_json) 
                : fetchedCourse.quiz_json;

            if (quizObj.questions && quizObj.questions.length > 0) {
                finalCourseData.pages.push({
                    type: 'quiz',
                    title: 'Evaluación Final',
                    payload: quizObj
                });
            }
        }

        // Cargar interfaz
        loadCourseUI(fetchedCourse.title, finalCourseData);

    } catch (e) {
        console.error('Error crítico:', e);
        pageContentEl.innerHTML = "<p class='error-message'>Error inesperado.</p>";
    }
}

// ==========================================
// 3. INTERFAZ Y RENDERIZADO
// ==========================================
function loadCourseUI(title, data) {
    courseData = data; // Asignar a variable global
    courseTitleEl.textContent = title;

    if (!courseData.pages || courseData.pages.length === 0) {
        sidebarListEl.innerHTML = "<p>Sin contenido.</p>";
        return;
    }

    // Generar Sidebar
    sidebarListEl.innerHTML = courseData.pages.map((page, index) => {
        const titleText = page.title || `Lección ${index + 1}`; 
        let icon = page.type === 'video' ? 'fa-video' : (page.type === 'quiz' ? 'fa-tasks' : 'fa-file-alt');
        
        return `
            <button class="page-btn" onclick="window.renderPage(${index})">
                <i class="fas ${icon}"></i> <span>${titleText}</span>
            </button>`;
    }).join('');

    renderPage(0);
}

// Función Principal de Renderizado
window.renderPage = function(index) {
    // A. GUARDIA DE SEGURIDAD (Bloqueo durante examen)
    if (isQuizInProgress) {
        if(!confirm("⚠️ Evaluación en curso.\n\nSi sales ahora perderás tu progreso. ¿Salir de todos modos?")) {
            return; // Se queda
        } else {
            endQuizMode(); // Fuerza salida
        }
    }

    if (!courseData || !courseData.pages[index]) return;

    // B. Limpieza UI
    const modal = document.getElementById('resultModal');
    if (modal) modal.style.display = 'none';
    currentPageIndex = index;
    const page = courseData.pages[currentPageIndex];
    pageContentEl.innerHTML = '';

    // C. Switch de Contenido
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
                pageContentEl.innerHTML = '<p>Error: Sin preguntas.</p>';
                break;
            }
            renderQuizTemplate(page.payload.questions);
            break;

        default:
            pageContentEl.innerHTML = `<p>Contenido no soportado.</p>`;
    }

    updateNavigationUI(index);
};

function updateNavigationUI(index) {
    // Actualizar Botones Footer
    prevPageBtn.disabled = (index === 0);
    nextPageBtn.disabled = (index === courseData.pages.length - 1);
    footerMessageEl.textContent = `Página ${index + 1} de ${courseData.pages.length}`;

    // Actualizar Sidebar (Carrusel)
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
// 4. LÓGICA DEL QUIZ
// ==========================================

// Genera el HTML del Quiz (Portada + Preguntas ocultas)
function renderQuizTemplate(questions) {
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
                <p><strong>Preguntas:</strong> ${questions.length} | <strong>Aprobación:</strong> 80%</p>
                <div style="background:#fff3cd; color:#856404; padding:10px; margin:15px 0; border-radius:5px;">
                    <i class="fas fa-exclamation-triangle"></i> 
                    Al dar clic en "Comenzar", se bloqueará la navegación hasta terminar.
                </div>
                <button class="btn btn-primary" onclick="window.startQuiz()">
                    Comenzar Evaluación
                </button>
            </div>

            <div id="quizQuestionsContainer" style="display:none;">
                ${questionsHtml}
                <div style="margin-top: 30px; text-align: right;">
                    <button class="btn btn-primary" onclick="window.submitQuiz()">
                        Finalizar y Calificar
                    </button>
                </div>
            </div>
        </div>`;
}

// 4.1 Iniciar Quiz (Activa Bloqueo)
window.startQuiz = function() {
    if (!confirm("¿Estás seguro de comenzar? No podrás navegar a otras secciones.")) return;

    isQuizInProgress = true;
    document.body.classList.add('quiz-mode'); // Efecto visual CSS
    
    document.getElementById('quizIntro').style.display = 'none';
    document.getElementById('quizQuestionsContainer').style.display = 'block';
    currentAnswers = {};
    
    // Bloquear botones footer explícitamente
    prevPageBtn.disabled = true;
    nextPageBtn.disabled = true;
};

// 4.2 Seleccionar Opción
window.selectOption = function(qIdx, oIdx) {
    currentAnswers[qIdx] = oIdx;
    const parent = document.getElementById(`q-${qIdx}`);
    parent.querySelectorAll('.quiz-btn').forEach((btn, idx) => {
        if (idx === oIdx) btn.classList.add('selected');
        else btn.classList.remove('selected');
    });
};

// 4.3 Terminar Quiz (Guarda y Desbloquea)
window.submitQuiz = async function() {
    const questionDivs = document.querySelectorAll('.quiz-options');
    let correctCount = 0;

    // Validar y Pintar
    questionDivs.forEach((div, idx) => {
        const correctAns = parseInt(div.getAttribute('data-correct'));
        const userAns = currentAnswers[idx];

        if (userAns === correctAns) correctCount++;

        // Congelar botones y pintar
        const btns = div.querySelectorAll('.quiz-btn');
        btns.forEach(b => b.disabled = true);

        if (btns[userAns]) {
            btns[userAns].classList.add(userAns === correctAns ? 'correct' : 'incorrect');
        }
        if (btns[correctAns]) btns[correctAns].classList.add('correct');
    });

    const finalScore = Math.round((correctCount / questionDivs.length) * 100);
    const passed = finalScore >= 80;

    // DESBLOQUEAR NAVEGACIÓN
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
        }
    } catch (e) { console.error("Error guardando:", e); }

    // Mostrar Modal
    showResultModal(passed, finalScore);
};

// Auxiliar para terminar modo quiz
function endQuizMode() {
    isQuizInProgress = false;
    document.body.classList.remove('quiz-mode');
    updateNavigationUI(currentPageIndex);
}

// Auxiliar para mostrar modal
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

// Iniciar app
document.addEventListener('DOMContentLoaded', initCourse);