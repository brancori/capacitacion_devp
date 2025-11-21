async function initCourse() {
    console.log('🚀 === INICIANDO CURSO - VERSIÓN FINAL ===');
    
    // ==========================================
    // 1. GESTIÓN DEL TENANT (Configuración Visual)
    // ==========================================
    if (window.tenantManager) {
        try {
            const config = await window.tenantManager.loadFromJson();
            console.log("🕵️‍♂️ TENANT DETECTADO:", window.tenantManager.tenantSlug);
            console.log("🎨 COLOR:", config.colors?.primary || config.primaryColor);
            window.tenantManager.applyStyles();
            document.body.style.opacity = '1'; 
        } catch (e) {
            console.error("Error cargando tenant:", e);
            document.body.style.opacity = '1';
        }
    } else {
        console.error("❌ TenantManager no cargado en el HTML");
        document.body.style.opacity = '1';
    }

    // ==========================================
    // 2. VARIABLES Y REFERENCIAS DOM
    // ==========================================
    const params = new URLSearchParams(location.search);
    const courseId = params.get("id");
    let courseData = null;
    let currentPageIndex = 0;

    const pageContentEl = document.getElementById("pageContent");
    const sidebarListEl = document.getElementById("sidebarList");
    const prevPageBtn = document.getElementById("prevPageBtn");
    const nextPageBtn = document.getElementById("nextPageBtn");
    const courseTitleEl = document.getElementById("courseTitle");
    const footerMessageEl = document.getElementById("footerMessage");

    // ==========================================
    // 3. LÓGICA DE RENDERIZADO (Páginas)
    // ==========================================
function renderPage(index) {
    // 1. PREVENT: Bloquear salida si el examen está activo
    if (isQuizInProgress) {
        alert("⚠️ Tienes una evaluación en curso. Debes finalizarla para salir.");
        return;
    }

    // Validaciones básicas
    if (!courseData || !courseData.pages || index < 0 || index >= courseData.pages.length) {
        return;
    }

    // 2. LIMPIEZA: Ocultar modales residuales
    document.getElementById('resultModal').style.display = 'none';

    currentPageIndex = index;
    const page = courseData.pages[currentPageIndex];
    pageContentEl.innerHTML = ''; 

    console.log(`DEBUG-RENDER: Renderizando página ${index + 1} (${page.type})`); 

    switch (page.type) {
        // --- CASO VIDEO ---
        case 'video':
            let videoUrl = page.payload.url;
            if (videoUrl.includes('cdn.com/intro.mp4')) {
                videoUrl = 'https://www.youtube.com/embed/M7lc1UVf-VE'; 
            }
            
            const videoHtml = videoUrl.includes('youtube.com') || videoUrl.includes('vimeo.com')
                ? `<iframe width="100%" height="500" src="${videoUrl}" title="Video" frameborder="0" allowfullscreen></iframe>`
                : `<video controls width="100%" height="500" src="${videoUrl}"></video>`;
            
            pageContentEl.innerHTML = `<div class="page-video">${videoHtml}</div>`;
            break;
        
        // --- CASO TEXTO / HTML ---
        case 'text':
            pageContentEl.innerHTML = `<div class="page-text">${page.payload.html}</div>`;
            break;

        // --- CASO QUIZ ---
        case 'quiz':
            if (!page.payload.questions) {
                pageContentEl.innerHTML = '<p>Error: Sin preguntas.</p>';
                break;
            }
            
            // Renderiza preguntas (ocultas) y portada (visible)
            const questionsHtml = page.payload.questions.map((q, qIdx) => `
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
                    <!-- Portada del Examen -->
                    <div id="quizIntro" class="quiz-intro-card">
                        <h3><i class="fas fa-graduation-cap"></i> Evaluación Final</h3>
                        <p><strong>Preguntas:</strong> ${page.payload.questions.length} | <strong>Aprobación:</strong> 80%</p>
                        <div style="background:#fff3cd; color:#856404; padding:10px; margin:15px 0; border-radius:5px; font-size:0.9rem;">
                            <i class="fas fa-exclamation-triangle"></i> 
                            Al dar clic en "Comenzar", no podrás salir hasta terminar.
                        </div>
                        <button class="btn btn-primary" onclick="window.startQuiz()">
                            Comenzar Evaluación
                        </button>
                    </div>

                    <!-- Preguntas (Inician Ocultas) -->
                    <div id="quizQuestionsContainer" style="display:none;">
                        ${questionsHtml}
                        <div style="margin-top: 30px; text-align: right;">
                            <button class="btn btn-primary" onclick="window.submitQuiz()">
                                Finalizar y Calificar
                            </button>
                        </div>
                    </div>
                </div>`;
            break;
            
        default:
            pageContentEl.innerHTML = `<p>Tipo de contenido no soportado: ${page.type}</p>`;
    }

    // 3. Actualizar UI de Navegación (Botones y Sidebar)
    updateNavigationUI(index);
}


// ==========================================
// FUNCIONES AUXILIARES Y DE QUIZ
// ==========================================

// Actualizar Botones y Sidebar (Carrusel)
function updateNavigationUI(index) {
    // Botones Footer
    prevPageBtn.disabled = currentPageIndex === 0;
    nextPageBtn.disabled = currentPageIndex === courseData.pages.length - 1;
    footerMessageEl.textContent = `Página ${currentPageIndex + 1} de ${courseData.pages.length}`;

    // Sidebar Carrusel
    const allButtons = document.querySelectorAll('.page-btn');
    allButtons.forEach((btn, idx) => {
        const isActive = idx === index;
        btn.classList.toggle('active', isActive);

        if (isActive) {
            // 'nearest' evita saltos bruscos si ya es visible
            btn.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest', 
                inline: 'center'
            });
        }
    });
}



    // ==========================================
    // 4. FUNCIONES GLOBALES (Para interacción HTML)
    // ==========================================
    
    // Validar respuesta del Quiz
    window.checkQuizAnswer = function(btnElement, questionIndex, selectedOption, correctOption) {
        const parent = btnElement.parentElement;
        const feedbackEl = document.getElementById(`feedback-${questionIndex}`);
        const allBtns = parent.querySelectorAll('.quiz-btn');

        // 1. Deshabilitar todos los botones de esta pregunta para evitar doble click
        allBtns.forEach(btn => btn.disabled = true);

        // 2. Verificar respuesta
        if (selectedOption === correctOption) {
            btnElement.classList.add('correct');
            feedbackEl.innerHTML = '<span style="color: #155724; background: #d4edda; padding: 5px 10px; border-radius: 4px;"><i class="fas fa-check"></i> ¡Correcto!</span>';
        } else {
            btnElement.classList.add('incorrect');
            // Resaltar la correcta visualmente
            if (allBtns[correctOption]) {
                allBtns[correctOption].classList.add('correct');
            }
            feedbackEl.innerHTML = '<span style="color: #721c24; background: #f8d7da; padding: 5px 10px; border-radius: 4px;"><i class="fas fa-times"></i> Incorrecto</span>';
        }
    };

    // Exponer renderPage globalmente para los botones del sidebar
    window.renderPage = renderPage;

    // ==========================================
    // 5. CARGA DE DATOS E INTERFAZ
    // ==========================================
    function loadCourse(title, contentJson) {
        courseData = contentJson;
        courseTitleEl.textContent = title || "Curso sin título";
        
        if (!courseData.pages || courseData.pages.length === 0) {
            sidebarListEl.innerHTML = "<p style='padding:15px;'>Este curso no tiene contenido.</p>";
            return;
        } 
        
        // Generar Sidebar
        sidebarListEl.innerHTML = courseData.pages.map((page, index) => {
            const titleText = page.title || `Página ${index + 1}`; 
            let icon = 'fa-file-alt';
            if (page.type === 'video') icon = 'fa-video';
            if (page.type === 'quiz') icon = 'fa-tasks';

            return `
                <button class="page-btn" onclick="window.renderPage(${index})">
                    <i class="fas ${icon}"></i> 
                    <span>${titleText}</span>
                </button>`;
        }).join('');
        
        // Renderizar la primera página
        renderPage(0);
    }

    // Event Listeners de Navegación
    prevPageBtn.addEventListener('click', () => {
        if (currentPageIndex > 0) renderPage(currentPageIndex - 1);
    });

    nextPageBtn.addEventListener('click', () => {
        if (currentPageIndex < courseData.pages.length - 1) renderPage(currentPageIndex + 1);
    });

    // ==========================================
    // 6. CONEXIÓN CON SUPABASE
    // ==========================================
if (!courseId) {
    pageContentEl.innerHTML = "<p class='error-message'>Error: URL inválida (falta ID).</p>";
    return;
}

try {
    const { data: userData } = await supabase.auth.getUser();
    const myTenantId = userData?.user?.user_metadata?.tenant_id;
    const myRole = userData?.user?.user_metadata?.role;

    console.log("🔍 Solicitando curso a Supabase...");

    // 1. IMPORTANTE: AQUÍ SE PIDE LA COLUMNA 'quiz_json'
    let query = supabase
        .from("articles") 
        .select("title, content_json, quiz_json, tenant_id") // <--- ¡REVISA ESTA LÍNEA!
        .eq("id", courseId);

    if (myRole !== "master" && myTenantId) {
        query = query.eq("tenant_id", myTenantId);
    }

    const { data: fetchedCourse, error: courseError } = await query.single();

    if (courseError || !fetchedCourse) {
        console.error("❌ Error Supabase:", courseError);
        pageContentEl.innerHTML = "<div class='error-message'>Error al cargar el curso.</div>";
        return;
    }

    console.log("✅ Curso descargado:", fetchedCourse.title);
    
    // 2. LIMPIEZA: Eliminamos duplicados antiguos del content_json
    let finalCourseData = fetchedCourse.content_json;
    
    if (finalCourseData.pages) {
        const antes = finalCourseData.pages.length;
        finalCourseData.pages = finalCourseData.pages.filter(p => 
            p.type !== 'quiz' && p.title !== 'Evaluación Final'
        );
        console.log(`🧹 Limpieza: Se eliminaron ${antes - finalCourseData.pages.length} páginas de quiz antiguas.`);
    }

    // 3. INYECCIÓN: Agregamos el quiz desde la columna quiz_json
    // Verificamos si existe algo en la columna
    if (fetchedCourse.quiz_json) {
        console.log("📦 Columna quiz_json detectada. Procesando...");
        
        // Parseamos si viene como texto, o lo usamos directo si ya es objeto
        let quizObj = typeof fetchedCourse.quiz_json === 'string' 
            ? JSON.parse(fetchedCourse.quiz_json) 
            : fetchedCourse.quiz_json;

        // Validamos que tenga preguntas
        if (quizObj.questions && quizObj.questions.length > 0) {
            console.log(`➕ Agregando Quiz con ${quizObj.questions.length} preguntas.`);
            
            finalCourseData.pages.push({
                type: 'quiz',
                title: 'Evaluación Final',
                payload: quizObj
            });
        } else {
            console.warn("⚠️ El quiz_json existe pero no tiene preguntas ('questions' array vacío).");
        }
    } else {
        console.warn("⚠️ La columna quiz_json es NULL o vacía en la base de datos.");
    }

    // Cargamos el curso
    loadCourse(fetchedCourse.title, finalCourseData);

} catch (e) {
    console.error('❌ Error crítico en initCourse:', e);
    pageContentEl.innerHTML = "<p class='error-message'>Ocurrió un error inesperado.</p>";
}
}

// Variables temporales para el examen
let currentAnswers = {}; 

// 1. Iniciar el Quiz (Oculta intro, muestra preguntas)
window.startQuiz = function() {
    if (!confirm("¿Estás seguro de comenzar? No podrás navegar a otras secciones hasta terminar.")) {
        return;
    }

    isQuizInProgress = true; 
    document.body.classList.add('quiz-mode'); // Bloqueo visual CSS
    
    document.getElementById('quizIntro').style.display = 'none';
    document.getElementById('quizQuestionsContainer').style.display = 'block';
    currentAnswers = {};
    
    // Desactivar botones footer visualmente
    prevPageBtn.disabled = true;
    nextPageBtn.disabled = true;
};

// 2. Seleccionar opción (Solo visual, no valida todavía)
window.selectOption = function(qIdx, oIdx) {
    currentAnswers[qIdx] = oIdx;
    const parent = document.getElementById(`q-${qIdx}`);
    parent.querySelectorAll('.quiz-btn').forEach((btn, idx) => {
        if (idx === oIdx) btn.classList.add('selected');
        else btn.classList.remove('selected');
    });
};


// 3. Enviar, Calificar y Guardar en BD
window.submitQuiz = async function() {
    const questionDivs = document.querySelectorAll('.quiz-options');
    let correctCount = 0;

    // Validar y Pintar
    questionDivs.forEach((div, idx) => {
        const correctAns = parseInt(div.getAttribute('data-correct'));
        const userAns = currentAnswers[idx];

        if (userAns === correctAns) correctCount++;

        const btns = div.querySelectorAll('.quiz-btn');
        btns.forEach(b => b.disabled = true); // Congelar botones

        if (btns[userAns]) {
            if (userAns === correctAns) btns[userAns].classList.add('correct');
            else btns[userAns].classList.add('incorrect');
        }
        if (btns[correctAns]) btns[correctAns].classList.add('correct');
    });

    // --- Calcular Promedio ---
    // Calcular
    const finalScore = Math.round((correctCount / questionDivs.length) * 100);
    const passed = finalScore >= 80;

    // DESBLOQUEAR NAVEGACIÓN
    isQuizInProgress = false;
    document.body.classList.remove('quiz-mode');
    updateNavigationUI(currentPageIndex); // Reactiva sidebar/footer

    // Guardar BD
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const courseId = new URLSearchParams(location.search).get("id");
        if (user && courseId) {
            await supabase.from('user_course_assignments').upsert({
                user_id: user.id, course_id: courseId, score: finalScore,
                status: passed ? 'completed' : 'failed', progress: 100, assigned_at: new Date()
            }, { onConflict: 'user_id, course_id' });
        }
    } catch (e) { console.error(e); }

    // Mostrar Modal
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
    
    document.getElementById('modalScore').innerText = `${finalScore}%`;
    document.getElementById('modalMessage').innerText = passed 
        ? 'Has aprobado el curso. Calificación registrada.' 
        : 'No alcanzaste el 80% mínimo.';
        
    modal.style.display = 'flex';
};

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initCourse);