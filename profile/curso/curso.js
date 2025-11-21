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
        if (!courseData || !courseData.pages || index < 0 || index >= courseData.pages.length) {
            return;
        }

        currentPageIndex = index;
        const page = courseData.pages[currentPageIndex];
        pageContentEl.innerHTML = ''; 

        console.log(`DEBUG-RENDER: Renderizando página ${index + 1} (${page.type})`); 

        switch (page.type) {
            // --- CASO VIDEO ---
            case 'video':
                let videoUrl = page.payload.url;
                // Fix para URLs de prueba antiguas
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

            // --- CASO QUIZ (NUEVO) ---
            case 'quiz':
                if (!page.payload.questions) {
                    pageContentEl.innerHTML = '<p>Error: Sin preguntas.</p>';
                    break;
                }
                
                // 1. Renderizamos la "Portada" del examen + Las preguntas (ocultas)
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
                        <div id="quizIntro" class="quiz-intro-card">
                            <h3><i class="fas fa-graduation-cap"></i> Evaluación Final</h3>
                            <p>Estás a punto de iniciar el examen. Tienes un solo intento para registrar tu calificación.</p>
                            <p><strong>Preguntas:</strong> ${page.payload.questions.length} | <strong>Aprobación:</strong> 80%</p>
                            <button class="btn btn-primary" onclick="window.startQuiz()">
                                Comenzar Evaluación
                            </button>
                        </div>

                        <div id="quizQuestionsContainer">
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

        // Actualizar estado de botones de navegación
        prevPageBtn.disabled = currentPageIndex === 0;
        nextPageBtn.disabled = currentPageIndex === courseData.pages.length - 1;
        footerMessageEl.textContent = `Página ${currentPageIndex + 1} de ${courseData.pages.length}`;

        // Actualizar estado activo en el sidebar
        document.querySelectorAll('.page-btn').forEach((btn, idx) => {
                    const isActive = idx === index;
                    btn.classList.toggle('active', isActive);

                    if (isActive) {
                        // Centra el botón activo en el contenedor (vertical y horizontalmente)
                        setTimeout(() => {
                            btn.scrollIntoView({
                                behavior: 'smooth',
                                block: 'center',
                                inline: 'center'
                            });
                        }, 100);
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
        const { data: userData, error: authError } = await supabase.auth.getUser();
        
        if (authError || !userData?.user) {
            // ... (código de manejo de error de login igual al original) ...
            return;
        }

        const myTenantId = userData.user.user_metadata.tenant_id;
        const myRole = userData.user.user_metadata.role;

        // 1. AGREGAMOS 'quiz_json' AL SELECT
        let query = supabase
            .from("articles") 
            .select("title, content_json, quiz_json, tenant_id") 
            .eq("id", courseId);

        if (myRole !== "master" && myTenantId) {
            query = query.eq("tenant_id", myTenantId);
        }

        const { data: fetchedCourse, error: courseError } = await query.single();

        if (courseError || !fetchedCourse) {
            console.error("Error Supabase:", courseError);
            pageContentEl.innerHTML = "<div class='error-message'>No tienes permiso o no existe.</div>";
        } else {
            console.log(`✅ Curso cargado: ${fetchedCourse.title}`);
            console.log("🔍 Buscando Quiz:", fetchedCourse.quiz_json ? "Encontrado" : "No existe");

            // 2. LÓGICA PARA INYECTAR EL QUIZ AL FINAL DEL ARRAY DE PÁGINAS
            let finalCourseData = fetchedCourse.content_json;
            
            // Si existe quiz_json y tiene preguntas, lo agregamos como una página más
            if (fetchedCourse.quiz_json && fetchedCourse.quiz_json.questions) {
                console.log("➕ Agregando Quiz al flujo del curso...");
                
                // Parseamos si viene como string, si ya es objeto lo usamos directo
                const quizPayload = typeof fetchedCourse.quiz_json === 'string' 
                    ? JSON.parse(fetchedCourse.quiz_json) 
                    : fetchedCourse.quiz_json;

                finalCourseData.pages.push({
                    type: 'quiz',
                    title: 'Evaluación Final',
                    payload: quizPayload 
                });
            }

            // Cargamos el curso con los datos combinados
            loadCourse(fetchedCourse.title, finalCourseData);
        }

    } catch (e) {
        console.error('Error crítico en initCourse:', e);
        pageContentEl.innerHTML = "<p class='error-message'>Ocurrió un error inesperado.</p>";
    }
}

// Variables temporales para el examen
let currentAnswers = {}; 

// 1. Iniciar el Quiz (Oculta intro, muestra preguntas)
window.startQuiz = function() {
    document.getElementById('quizIntro').style.display = 'none';
    document.getElementById('quizQuestionsContainer').style.display = 'block';
    currentAnswers = {}; // Reiniciar respuestas
};

// 2. Seleccionar opción (Solo visual, no valida todavía)
window.selectOption = function(qIdx, oIdx) {
    // Guardar respuesta
    currentAnswers[qIdx] = oIdx;
    
    // Actualizar UI
    const parent = document.getElementById(`q-${qIdx}`);
    const btns = parent.querySelectorAll('.quiz-btn');
    btns.forEach((btn, idx) => {
        if (idx === oIdx) btn.classList.add('selected');
        else btn.classList.remove('selected');
    });
};

// 3. Enviar, Calificar y Guardar en BD
window.submitQuiz = async function() {
    const questionDivs = document.querySelectorAll('.quiz-options');
    let correctCount = 0;
    let total = questionDivs.length;
    let allAnswered = true;

    // --- Validación y Cálculo ---
    questionDivs.forEach((div, idx) => {
        const correctAns = parseInt(div.getAttribute('data-correct'));
        const userAns = currentAnswers[idx];

        if (userAns === undefined) allAnswered = false;

        // Bloquear botones
        const btns = div.querySelectorAll('.quiz-btn');
        btns.forEach(b => b.disabled = true);

        // Pintar resultados
        if (userAns === correctAns) {
            correctCount++;
            if(btns[userAns]) btns[userAns].classList.add('correct'); 
        } else {
            if(btns[userAns]) btns[userAns].classList.add('incorrect');
            if(btns[correctAns]) btns[correctAns].classList.add('correct');
        }
    });

    // --- Calcular Promedio ---
    const finalScore = Math.round((correctCount / total) * 100);
    const passed = finalScore >= 80;
    const status = passed ? 'completed' : 'failed';

    // --- Guardar en Supabase ---
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const params = new URLSearchParams(location.search);
        const courseId = params.get("id");

        if (user && courseId) {
            await supabase
                .from('user_course_assignments')
                .upsert({ 
                    user_id: user.id,
                    course_id: courseId,
                    score: finalScore,
                    status: status,
                    progress: 100,
                    assigned_at: new Date()
                }, { onConflict: 'user_id, course_id' });
            
            console.log("✅ Calificación guardada:", finalScore);
        }
    } catch (e) {
        console.error("Error guardando nota:", e);
    }

    // --- MOSTRAR MODAL ---
    const modalOverlay = document.getElementById('resultModal');
    const modalIcon = document.getElementById('modalIcon');
    const modalTitle = document.getElementById('modalTitle');
    const modalScore = document.getElementById('modalScore');
    const modalMsg = document.getElementById('modalMessage');

    if (passed) {
        modalIcon.innerHTML = '🏆';
        modalTitle.innerText = '¡Felicidades!';
        modalTitle.style.color = '#28a745';
        modalMsg.innerText = 'Has aprobado el curso satisfactoriamente. Tu calificación ha sido registrada.';
    } else {
        modalIcon.innerHTML = '⚠️';
        modalTitle.innerText = 'Sigue intentando';
        modalTitle.style.color = '#dc3545';
        modalMsg.innerText = 'No has alcanzado el puntaje mínimo del 80% para aprobar. Repasa el contenido e intenta nuevamente.';
    }

    modalScore.innerText = `${finalScore}%`;
    modalOverlay.style.display = 'flex';
};

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initCourse);