// ==========================================
// 0. VARIABLES GLOBALES (PARA QUE TODOS LAS VEAN)
// ==========================================
// Estas variables viven fuera de las funciones para que startQuiz y renderPage compartan los datos.
let supabase; 
let courseData = null;
let currentPageIndex = 0;
let isQuizInProgress = false; //  El candado del examen
let currentAnswers = {};      // Respuestas temporales
let maxUnlockedIndex = 0; // Control de navegación
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

    if (!courseId) {
        pageContentEl.innerHTML = "<p class='error-message'>Error: URL sin ID.</p>";
        return;
    }

    try {
        let { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (!session || sessionError) {
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

        const { data: rawData, error } = await supabase
            .from("articles")
            .select("title, content_json, quiz_json, survey_json, tenant_id, question_show")
            .eq("id", courseId);

        if (error || !rawData) {
            pageContentEl.innerHTML = `<div class='error-message'>Error cargando curso.</div>`;
            return;
        }

        const fetchedCourse = Array.isArray(rawData) ? rawData[0] : rawData;

        let finalCourseData;
        try {
            finalCourseData = typeof fetchedCourse.content_json === 'string' 
                ? JSON.parse(fetchedCourse.content_json) 
                : (fetchedCourse.content_json || { pages: [] });
        } catch (e) {
            finalCourseData = { pages: [] };
        }

        if (finalCourseData.pages) {
            finalCourseData.pages = finalCourseData.pages.filter(p => p.type !== 'quiz' && p.type !== 'survey');
        }

        // Quiz Final
        if (fetchedCourse.quiz_json) {
            let quizObj = typeof fetchedCourse.quiz_json === 'string' ? JSON.parse(fetchedCourse.quiz_json) : fetchedCourse.quiz_json;
            if (quizObj?.questions?.length > 0) {
                if (fetchedCourse.question_show && fetchedCourse.question_show > 0) {
                    const shuffled = quizObj.questions.sort(() => 0.5 - Math.random());
                    quizObj.questions = shuffled.slice(0, fetchedCourse.question_show);
                }
                finalCourseData.pages.push({ type: 'quiz', title: 'Evaluación Final', payload: quizObj });
            }
        }

        // Encuesta
        const surveyPayload = fetchedCourse.survey_json 
            ? (typeof fetchedCourse.survey_json === 'string' ? JSON.parse(fetchedCourse.survey_json) : fetchedCourse.survey_json)
            : { default: true };
            
        finalCourseData.pages.push({ type: 'survey', title: 'Encuesta de Satisfacción', payload: surveyPayload });

        // Obtener Progreso
        const { data: assignment } = await supabase
            .from('user_course_assignments')
            .select('progress, status')
            .eq('user_id', session.user.id)
            .eq('course_id', courseId)
            .maybeSingle();

        // CÁLCULO DE BLOQUEO
        const totalPages = finalCourseData.pages.length;
        maxUnlockedIndex = 0;

        if (assignment) {
            if (assignment.status === 'completed') {
                maxUnlockedIndex = totalPages - 1;
            } else {
                // (Progreso / 90) * Total = Índice
                const rawIndex = (assignment.progress / 90) * totalPages;
                maxUnlockedIndex = Math.floor(rawIndex);
                
                if (assignment.progress > 0 && maxUnlockedIndex === 0) maxUnlockedIndex = 1;
                if (maxUnlockedIndex >= totalPages) maxUnlockedIndex = totalPages - 1;
            }
        }

        let startIndex = maxUnlockedIndex;
        if (assignment && assignment.status === 'completed') startIndex = 0;

        loadCourseUI(fetchedCourse.title, finalCourseData, startIndex);

    } catch (e) {
        console.error("Error crítico en init:", e);
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
    // Bloqueo estricto
    if (index > maxUnlockedIndex) {
        console.warn(" Navegación bloqueada.");
        return; 
    }

    if (isQuizInProgress) {
        if(!confirm(" ¡Evaluación en curso! Si sales, perderás progreso.")) return;
        else endQuizMode();
    }

    if (!courseData || !courseData.pages || !courseData.pages[index]) return;

    currentPageIndex = index;
    const page = courseData.pages[currentPageIndex];
    pageContentEl.innerHTML = ''; 

    // Guardar progreso automáticamente si NO es Quiz, Practice o Encuesta
    if (page.type !== 'quiz' && page.type !== 'practice' && page.type !== 'survey') {
        if (index >= maxUnlockedIndex) {
            maxUnlockedIndex = index + 1; // Preparamos el siguiente
            saveProgress(index, false);
        }
    }
    
    // IMPORTANTE: Si es 'practice' y ya fue superado, permitimos avanzar visualmente
    if (page.type === 'practice' && index < maxUnlockedIndex) {
         // Ya estaba aprobado, no bloqueamos
    }

    switch (page.type) {
        case 'text':
            pageContentEl.innerHTML = page.payload?.html || "<p>Sin contenido.</p>";
            break;
        case 'video':
            if (page.payload?.url) {
                pageContentEl.innerHTML = `
                    <div class="video-container" style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden;">
                        <iframe style="position:absolute; top:0; left:0; width:100%; height:100%;" 
                                src="${page.payload.url}" frameborder="0" allowfullscreen></iframe>
                    </div>`;
            }
            break;
        case 'image':
            pageContentEl.innerHTML = `
                <div style="display:flex; justify-content:center;">
                    <img src="${page.payload.url}" style="max-width:100%; max-height:75vh;">
                </div>`;
            break;
        case 'practice': 
            renderPracticeQuiz(page);
            break;
        case 'quiz':
            if (page.payload?.questions) renderQuizTemplate(page.payload.questions);
            break;
        case 'flipCards':
            renderFlipCards(page);
            break;
        case 'interactive':
        case 'comparison':
            pageContentEl.innerHTML = page.payload.html;
            break;
        case 'stepByStep':
            renderStepByStep(page);
            break;
        case 'survey':
            renderSurvey(page);
            break;
        default:
            pageContentEl.innerHTML = `<p>Tipo desconocido: ${page.type}</p>`;
    }

    updateNavigationUI(index);
};
function updateNavigationUI(index) {
    // 1. Footer
    prevPageBtn.disabled = (index === 0);
    
    //  Lógica especial para botón Siguiente
    const currentPage = courseData.pages[index];
    
    // Si es práctica y NO ha superado el índice desbloqueado, bloqueamos "Siguiente"
    if (currentPage.type === 'practice' && index >= maxUnlockedIndex) {
        nextPageBtn.disabled = true; 
    } else {
        nextPageBtn.disabled = (index === courseData.pages.length - 1);
    }
    
    footerMessageEl.textContent = `Página ${index + 1} de ${courseData.pages.length}`;

    // 2. Sidebar (Bloqueo visual)
    const btns = document.querySelectorAll('.page-btn');
    btns.forEach((btn, idx) => {
        // Estado activo
        btn.classList.toggle('active', idx === index);
        
        // Estado bloqueado (Lock)
        if (idx > maxUnlockedIndex) {
            btn.classList.add('locked');
            // Opcional: Agregar candado visualmente
            if(!btn.querySelector('.fa-lock')) {
                btn.innerHTML += ' <i class="fas fa-lock" style="font-size:0.7em; margin-left:auto;"></i>';
            }
        } else {
            btn.classList.remove('locked');
            const lockIcon = btn.querySelector('.fa-lock');
            if(lockIcon) lockIcon.remove();
        }
    });
}

function renderPracticeQuiz(page) {
    const config = page.payload.config || { pool_size: 4 };
    const bank = page.payload.bank || [];
    
    // Si maxUnlockedIndex es mayor al índice actual, significa que ya pasamos por aquí
    const isAlreadyPassed = maxUnlockedIndex > currentPageIndex;

    // 1. VISTA: YA APROBADO
    if (isAlreadyPassed) {
        pageContentEl.innerHTML = `
            <div class="practice-container">
                <div class="practice-completed-card">
                    <i class="fas fa-check-circle" style="font-size: 3rem; color: #28a745; margin-bottom: 15px;"></i>
                    <h3>¡Actividad Completada!</h3>
                    <p>Ya has aprobado este módulo.</p>
                    <button class="btn btn-secondary" onclick="window.startPracticeMode()">
                        <i class="fas fa-sync"></i> Practicar de nuevo
                    </button>
                </div>
            </div>
        `;
        document.getElementById('nextPageBtn').disabled = false;
        return;
    }

    // 2. VISTA: MODO EXAMEN
    window.startPracticeMode = function() {
        const shuffled = [...bank].sort(() => 0.5 - Math.random());
        const selectedQuestions = shuffled.slice(0, config.pool_size);

        let html = `
            <div class="practice-container">
                <h2 style="color:var(--primaryColor); text-align:center;">${page.title || 'Práctica'}</h2>
                <form id="practiceForm">
        `;

        selectedQuestions.forEach((q, idx) => {
            html += `
                <div class="practice-card" data-answer="${q.answer}">
                    <p><strong>${idx + 1}. ${q.question}</strong></p>
                    <div class="practice-options">
                        ${q.options.map((opt, optIdx) => `
                            <label>
                                <input type="radio" name="q${idx}" value="${optIdx}">
                                <span>${opt}</span>
                            </label>
                        `).join('')}
                    </div>
                    <div class="feedback-msg" style="margin-top:5px; display:none;"></div>
                </div>
            `;
        });

        html += `
                <div id="practiceActions" style="text-align:center; margin-top:20px;">
                    <button type="button" class="btn btn-primary" onclick="checkPracticeAnswers()">Verificar</button>
                </div>
                <div id="practiceResult" class="practice-completed-card" style="display:none; margin-top:20px;"></div>
            </form>
            </div>
        `;
        pageContentEl.innerHTML = html;
        // Si no está aprobado, bloqueamos el botón siguiente
        if (!isAlreadyPassed) document.getElementById('nextPageBtn').disabled = true;
    };

    window.startPracticeMode();

    window.checkPracticeAnswers = function() {
        const cards = document.querySelectorAll('.practice-card');
        let allCorrect = true;

        cards.forEach(card => {
            const correctIdx = parseInt(card.dataset.answer);
            const selectedInput = card.querySelector('input:checked');
            const feedbackEl = card.querySelector('.feedback-msg');
            const labels = card.querySelectorAll('label');

            labels.forEach(l => l.classList.remove('correct', 'incorrect'));
            
            if (!selectedInput) {
                allCorrect = false;
                feedbackEl.textContent = "Selecciona una opción";
                feedbackEl.style.color = "red";
                feedbackEl.style.display = 'block';
                return;
            }

            const userVal = parseInt(selectedInput.value);
            if (userVal === correctIdx) {
                selectedInput.parentElement.classList.add('correct');
                feedbackEl.textContent = "Correcto";
                feedbackEl.style.color = "green";
            } else {
                selectedInput.parentElement.classList.add('incorrect');
                feedbackEl.textContent = "Incorrecto";
                feedbackEl.style.color = "red";
                allCorrect = false;
            }
            feedbackEl.style.display = 'block';
        });

        const resultArea = document.getElementById('practiceResult');
        const actionArea = document.getElementById('practiceActions');

        if (allCorrect) {
            resultArea.innerHTML = `<h4>¡Correcto!</h4><p>Puedes continuar.</p>`;
            resultArea.style.display = 'block';
            actionArea.style.display = 'none';

            // Desbloquear si es necesario
            if (currentPageIndex >= maxUnlockedIndex) {
                maxUnlockedIndex = currentPageIndex + 1;
                saveProgress(currentPageIndex, false);
                updateNavigationUI(currentPageIndex);
            }
            document.getElementById('nextPageBtn').disabled = false;
        } else {
            const btn = actionArea.querySelector('button');
            btn.innerHTML = "Reintentar (Nuevas Preguntas)";
            btn.classList.replace('btn-primary', 'btn-secondary');
            btn.onclick = () => window.renderPage(currentPageIndex);
        }
    };
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
    
    // 1. Calcular Score y recopilar respuestas
    const questionDivs = document.querySelectorAll('.quiz-options');
    let correctCount = 0;
    let quizDetails = [];

    questionDivs.forEach((div, idx) => {
        const questionText = div.previousElementSibling.innerText;
        const correctAnsIdx = parseInt(div.getAttribute('data-correct'));
        const userAnsIdx = currentAnswers[idx];
        
        // Texto de respuesta
        const options = div.querySelectorAll('.quiz-btn');
        const userAnsText = userAnsIdx !== undefined ? options[userAnsIdx].innerText.trim() : "Sin responder";
        const isCorrect = (userAnsIdx === correctAnsIdx);

        if (isCorrect) correctCount++;

        quizDetails.push({
            question: questionText,
            selected_option: userAnsText,
            is_correct: isCorrect
        });
    });

    const finalScore = Math.round((correctCount / questionDivs.length) * 100);
    
    // NOTA: "Sin importar la respuesta" -> No evaluamos si passed es true/false para la navegación
    // Pero sí guardamos el status real en BD.
    const passed = finalScore >= 80; 

    // 2. Guardar en BD (Silenciosamente)
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const courseId = new URLSearchParams(location.search).get("id");
        
        if (user && courseId) {
            const updateData = {
                score: finalScore,
                quiz_answers: quizDetails,
                // Si quieres que el progreso suba al 95% al terminar el quiz
                progress: 95 
            };

            await supabase
                .from('user_course_assignments')
                .update(updateData)
                .eq('user_id', user.id)
                .eq('course_id', courseId);
        }
    } catch (e) {
        console.error("Error guardando quiz:", e);
    }

    // 3. LÓGICA DE NAVEGACIÓN FORZADA
    // Desactivamos el bloqueo del quiz para poder cambiar de página
    isQuizInProgress = false; 
    document.body.classList.remove('quiz-mode');

    // Buscamos si existe una página siguiente (la encuesta)
    const nextPageIndex = currentPageIndex + 1;
    
    if (nextPageIndex < courseData.pages.length) {
        alert("Examen finalizado. Pasando a la Encuesta de Satisfacción.");
        renderPage(nextPageIndex); // Manda a la encuesta
    } else {
        // Si por error no hay encuesta, mandamos al perfil
        alert("Curso finalizado.");
        window.location.href = '../profile.html';
    }
};


async function saveProgress(pageIndex, isQuizCompleted = false) {
    try {
        // 1. Verificación de seguridad de sesión
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
            console.warn("[SAVE] No hay sesión activa. Posible bloqueo de navegador.");
            return;
        }

        const user = session.user;
        const params = new URLSearchParams(location.search);
        const courseId = params.get("id"); // Obtenemos ID limpio
        
        if (!user || !courseId) {
            console.error("[SAVE] Faltan datos críticos (User o CourseID)");
            return;
        }

        // 2. Calcular Progreso Matemático
        let newProgress;
        if (isQuizCompleted) {
            newProgress = 95; 
        } else {
            const totalPages = courseData.pages.length || 1;
            // Fórmula: ((PáginaActual + 1) / Total) * 90
            newProgress = ((pageIndex + 1) / totalPages) * 90;
            newProgress = Math.round(newProgress * 100) / 100; // Redondear 2 decimales
            if (newProgress > 90) newProgress = 90;
        }

        console.log(`[SAVE] Intentando guardar: ${newProgress}% para Curso: ${courseId}`);

        // 3. ESTRATEGIA CHECK-THEN-ACT (Evita error 400 de Upsert)
        
        // A. Consultar si ya existe registro
        const { data: existing, error: fetchError } = await supabase
            .from('user_course_assignments')
            .select('id, status, progress')
            .eq('user_id', user.id)
            .eq('course_id', courseId)
            .maybeSingle();

        if (fetchError) {
            console.error("[SAVE] Error consultando estado:", fetchError);
            return;
        }

        // B. Si ya está completado, no hacemos nada (Protección)
        if (existing?.status === 'completed') {
            console.log("[SAVE] Curso ya completado. No se sobrescribe.");
            return;
        }

        // C. No guardar si el progreso nuevo es menor al existente (Evitar retroceso)
        if (existing && existing.progress >= newProgress) {
            return; 
        }

        // 4. EJECUTAR UPDATE O INSERT
        const payload = {
            progress: newProgress,
            status: 'in_progress',
            last_accessed: new Date().toISOString()
        };

        let errorAction;

        if (existing) {
            // --- UPDATE (Si ya existe ID) ---
            const { error } = await supabase
                .from('user_course_assignments')
                .update(payload)
                .eq('id', existing.id); // Usamos ID directo, más seguro
            errorAction = error;
        } else {
            // --- INSERT (Si es nuevo) ---
            const { error } = await supabase
                .from('user_course_assignments')
                .insert({
                    user_id: user.id,
                    course_id: courseId,
                    ...payload,
                    assigned_at: new Date().toISOString()
                });
            errorAction = error;
        }

        if (errorAction) {
            console.error("[SAVE] Error al guardar en BD:", errorAction);
        } else {
            console.log("[SAVE] ✅ Progreso guardado correctamente.");
        }

    } catch (e) {
        console.error("[SAVE] Excepción crítica:", e);
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
function renderSurvey(page) {
    pageContentEl.innerHTML = `
        <div class="survey-container">
            <h2 style="text-align:center; color:var(--primaryColor);">Encuesta de Finalización</h2>
            <p style="text-align:center; margin-bottom:30px;">Por favor califica este curso para obtener tu certificado.</p>
            
            <form id="surveyForm" onsubmit="window.submitSurvey(event)">
                <div style="text-align:center;">
                    <h4>Califica el contenido:</h4>
                    <div class="star-rating">
                        <input type="radio" id="star5" name="rating" value="5" required/><label for="star5" title="Excelente">★</label>
                        <input type="radio" id="star4" name="rating" value="4"/><label for="star4" title="Bueno">★</label>
                        <input type="radio" id="star3" name="rating" value="3"/><label for="star3" title="Regular">★</label>
                        <input type="radio" id="star2" name="rating" value="2"/><label for="star2" title="Malo">★</label>
                        <input type="radio" id="star1" name="rating" value="1"/><label for="star1" title="Pésimo">★</label>
                    </div>
                </div>

                <div class="survey-check-group">
                    <p style="margin-bottom:15px;"><strong>Declaración de Honestidad:</strong></p>
                    <p style="font-size:0.9rem; margin-bottom:15px;">"Acepto que leí y de manera honesta revisé y comprendí el contenido de este curso completamente."</p>
                    
                    <label>
                        <input type="radio" name="honesty" value="aceptar" required>
                        Sí, acepto y confirmo.
                    </label>
                    <div style="height:10px;"></div>
                    <label>
                        <input type="radio" name="honesty" value="no_aceptar">
                        No acepto.
                    </label>
                </div>

                <button type="submit" class="btn btn-primary" style="width:100%; padding:15px;">
                    Finalizar Curso y Obtener Certificado
                </button>
            </form>
        </div>
    `;
}

// ==========================================
// LOGICA: ENTREGAR ENCUESTA (FINAL DEL CURSO)
// ==========================================
window.submitSurvey = async function(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const surveyData = [];
    
    // Convertir FormData a JSON array legible
    formData.forEach((value, key) => {
        surveyData.push({ question: key, answer: value });
    });

    console.log("[SURVEY] Enviando y Finalizando...");

    try {
        const { data: { user } } = await supabase.auth.getUser();
        const courseId = new URLSearchParams(location.search).get("id");

        // 1. Actualizar BD: Status COMPLETED
        const { error } = await supabase
            .from('user_course_assignments')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                survey_answers: surveyData,
                progress: 100
            })
            .eq('user_id', user.id)
            .eq('course_id', courseId);

        if (error) throw error;

        // 2. REDIRECCIÓN AUTOMÁTICA
        alert("¡Muchas gracias! Tu curso ha sido completado correctamente.");
        window.location.href = '../profile.html'; // <--- Redirección final

    } catch (err) {
        console.error(err);
        alert("Error al finalizar: " + err.message);
    }
};
// Iniciar todo al cargar la página
document.addEventListener('DOMContentLoaded', initCourse);


/* 
Json, type practice
{
  "type": "practice",
  "title": "Repaso: Normas de Seguridad",
  "payload": {
    "config": {
      "pool_size": 4
    },
    "bank": [
      {
        "question": "¿Cuál es la altura mínima para considerar trabajo en altura?",
        "options": ["1.5 metros", "1.8 metros", "2.0 metros"],
        "answer": 1
      },
      {
        "question": "¿Qué norma regula el EPP?",
        "options": ["NOM-017", "NOM-035", "NOM-030"],
        "answer": 0
      },
      {
        "question": "¿Color de seguridad para prohibición?",
        "options": ["Azul", "Rojo", "Amarillo"],
        "answer": 1
      },
      {
        "question": "¿Color para advertencia?",
        "options": ["Verde", "Amarillo", "Rojo"],
        "answer": 1
      },
      {
        "question": "¿Extintor para fuego tipo A?",
        "options": ["CO2", "Agua", "Polvo Químico"],
        "answer": 1
      }
    ]
  }
} */