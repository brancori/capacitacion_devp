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
        case 'gallery':
            renderGallery(page);
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
        case 'fillBlanks':
            renderFillBlanks(page);
            break;
        case 'survey':
            renderSurvey(page);
            break;
        default:
            pageContentEl.innerHTML = `<p>Tipo desconocido: ${page.type}</p>`;
    }

    updateNavigationUI(index);
};
function renderFillBlanks(page) {
    const data = page.payload;
    // data.text debe contener marcadores como {0}, {1} para los huecos
    // data.blanks es un array con las respuestas correctas ["Ergonomía", "Física"]
    // data.distractors son palabras extra incorrectas (opcional)

    // 1. Preparar el banco de palabras (Correctas + Distractores)
    let allWords = [...data.blanks];
    if (data.distractors) allWords = allWords.concat(data.distractors);
    // Barajar palabras
    allWords.sort(() => 0.5 - Math.random());

    // 2. Generar HTML del texto con huecos
    let contentHtml = data.text;
    data.blanks.forEach((ans, index) => {
        // Reemplazamos {index} o marcadores por un span clicable
        // Usamos un regex simple para buscar las llaves {}
        // Ojo: asumiremos que el JSON viene con placeholders tipo ___ o similar, 
        // pero para hacerlo robusto, mejor usamos un array de segmentos.
        
        // ESTRATEGIA: El texto en JSON debe usar tokens como {{0}}, {{1}}
        contentHtml = contentHtml.replace(`{{${index}}}`, 
            `<span class="blank-space" data-index="${index}" onclick="selectBlank(this)">____</span>`
        );
    });

    pageContentEl.innerHTML = `
        <div class="fill-blanks-container">
            <h2 style="color:var(--primaryColor); text-align:center;">${page.title}</h2>
            <p style="text-align:center; font-size:0.9rem; color:#666;">
                Toca un espacio vacío para seleccionarlo y luego elige la palabra correcta.
            </p>
            
            <div class="sentence-line">
                ${contentHtml}
            </div>

            <div class="word-bank" id="wordBank">
                ${allWords.map(word => `<div class="bank-word" onclick="placeWord(this)">${word}</div>`).join('')}
            </div>

            <div class="fb-feedback" id="fbFeedback"></div>

            <div style="text-align:center; margin-top:20px;">
                <button class="btn btn-primary" onclick="checkFillBlanks()">Verificar</button>
                <button class="btn btn-secondary" onclick="resetFillBlanks()" style="margin-left:10px;">Reiniciar</button>
            </div>
        </div>
    `;

    // Estado local para esta slide
    window.fbState = {
        currentBlank: null, // El span que está seleccionado actualmente
        answers: {},        // {0: "Palabra", 1: "Palabra"}
        correctAnswers: data.blanks
    };
}

// Funciones auxiliares globales para FillBlanks
window.selectBlank = function(el) {
    // Si ya está corregido (verde), no hacer nada
    if (el.classList.contains('correct')) return;

    // Quitar activo de otros
    document.querySelectorAll('.blank-space').forEach(b => b.classList.remove('active'));
    
    // Activar este
    el.classList.add('active');
    window.fbState.currentBlank = el;
};

window.placeWord = function(wordEl) {
    if (!window.fbState.currentBlank || wordEl.classList.contains('used')) return;

    const blank = window.fbState.currentBlank;
    const wordText = wordEl.innerText;
    const blankIndex = blank.dataset.index;

    // Si había una palabra antes, liberarla en el banco visualmente
    if (window.fbState.answers[blankIndex]) {
        const prevWord = window.fbState.answers[blankIndex];
        // Buscar esa palabra en el banco y quitarle 'used'
        const bankWords = document.querySelectorAll('.bank-word');
        for(let w of bankWords) {
            if (w.innerText === prevWord && w.classList.contains('used')) {
                w.classList.remove('used');
                break; // Solo reactivar una instancia
            }
        }
    }

    // Colocar nueva palabra
    blank.innerText = wordText;
    blank.classList.remove('active');
    window.fbState.answers[blankIndex] = wordText;
    
    // Marcar palabra como usada
    wordEl.classList.add('used');
    window.fbState.currentBlank = null; // Deseleccionar
};

window.checkFillBlanks = function() {
    const state = window.fbState;
    let correctCount = 0;
    let total = state.correctAnswers.length;
    const blanks = document.querySelectorAll('.blank-space');
    
    // Limpiar estilos previos de error
    blanks.forEach(b => b.classList.remove('incorrect'));

    let allFilled = true;

    blanks.forEach(blank => {
        const idx = blank.dataset.index;
        const userWord = state.answers[idx];
        const correctWord = state.correctAnswers[idx];

        if (!userWord) {
            allFilled = false;
            return;
        }

        if (userWord === correctWord) {
            blank.classList.add('correct');
            blank.classList.remove('incorrect');
            correctCount++;
        } else {
            blank.classList.add('incorrect');
        }
    });

    const feedback = document.getElementById('fbFeedback');
    feedback.style.display = 'block';

    if (correctCount === total) {
        feedback.innerHTML = `<span style="color:#28a745"><i class="fas fa-check-circle"></i> ¡Excelente! Todo correcto.</span>`;
        // Desbloquear siguiente página
        if (currentPageIndex >= maxUnlockedIndex) {
             maxUnlockedIndex = currentPageIndex + 1;
             saveProgress(currentPageIndex, false);
             updateNavigationUI(currentPageIndex);
        }
        document.getElementById('nextPageBtn').disabled = false;
    } else {
        feedback.innerHTML = `<span style="color:#dc3545">Tienes ${total - correctCount} errores. Inténtalo de nuevo.</span>`;
    }
};

window.resetFillBlanks = function() {
    window.renderPage(currentPageIndex); // Recargar simple
};

function updateNavigationUI(index) {
    // 1. Actualizar textos y botones del Footer
    footerMessageEl.textContent = `Página ${index + 1} de ${courseData.pages.length}`;
    prevPageBtn.disabled = (index === 0);

    const currentPage = courseData.pages[index];
    
    // Lógica de bloqueo del botón "Siguiente"
    // Si es práctica y NO ha superado el índice desbloqueado, bloqueamos
    if (currentPage.type === 'practice' && index >= maxUnlockedIndex) {
        nextPageBtn.disabled = true; 
    } else {
        nextPageBtn.disabled = (index === courseData.pages.length - 1);
    }

    // 2. Actualizar Sidebar (Colores y SCROLL AUTOMÁTICO)
    const btns = document.querySelectorAll('.page-btn');
    
    btns.forEach((btn, idx) => {
        // A. Estado Activo
        const isActive = (idx === index);
        btn.classList.toggle('active', isActive);
        
        // B. Estado Bloqueado (Candado)
        if (idx > maxUnlockedIndex) {
            btn.classList.add('locked');
            if(!btn.querySelector('.fa-lock')) {
                btn.innerHTML += ' <i class="fas fa-lock" style="font-size:0.7em; margin-left:auto;"></i>';
            }
        } else {
            btn.classList.remove('locked');
            const lockIcon = btn.querySelector('.fa-lock');
            if(lockIcon) lockIcon.remove();
        }

        // C. 🔥 SCROLL AUTOMÁTICO (La lógica recuperada)
        if (isActive) {
            // Esto hace que la barra lateral se mueva sola hasta el botón activo
            btn.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest', // 'nearest' evita saltos bruscos si ya es visible
                inline: 'start'
            });
        }
    });
}

function renderPracticeQuiz(page) {
    const config = page.payload.config || { pool_size: 4 };
    const bank = page.payload.bank || [];
    
    const isAlreadyPassed = maxUnlockedIndex > currentPageIndex;

    // 1. VISTA: YA APROBADO (Sin cambios)
    if (isAlreadyPassed) {
        pageContentEl.innerHTML = `
            <div class="practice-container" style="text-align:center; display:flex; flex-direction:column; justify-content:center;">
                <div class="practice-completed-card">
                    <i class="fas fa-check-circle" style="font-size: 4rem; color: #28a745; margin-bottom: 20px;"></i>
                    <h3 style="color: #28a745;">¡Actividad Completada!</h3>
                    <p>Ya has aprobado este módulo anteriormente.</p>
                    <button class="btn btn-secondary" style="margin-top:20px;" onclick="window.startPracticeMode()">
                        <i class="fas fa-sync"></i> Practicar de nuevo
                    </button>
                </div>
            </div>
        `;
        document.getElementById('nextPageBtn').disabled = false;
        return;
    }

    // 2. VISTA: MODO EXAMEN (NUEVO DISEÑO)
    window.startPracticeMode = function() {
        const shuffled = [...bank].sort(() => 0.5 - Math.random());
        const selectedQuestions = shuffled.slice(0, config.pool_size);

        // Generamos el HTML con la nueva estructura de tarjetas y botones
        let html = `
            <div class="practice-container">
                <h2 style="color:var(--primaryColor); margin-bottom:25px;">${page.title || 'Validación de Conocimientos'}</h2>
                <div id="practiceQuestionsList">
        `;

        selectedQuestions.forEach((q, idx) => {
            html += `
                <div class="practice-card" id="p-card-${idx}" data-answer="${q.answer}">
                    <h4>${idx + 1}. ${q.question}</h4>
                    <div class="practice-options">
                        ${q.options.map((opt, optIdx) => `
                            <button type="button" class="quiz-option-btn" onclick="selectPracticeOption(${idx}, ${optIdx})">
                                ${opt}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <div id="practiceActions" style="text-align:center; margin-top:30px; margin-bottom:20px;">
                    <button type="button" class="btn btn-primary btn-lg" onclick="checkPracticeAnswers()">
                        Verificar Respuestas
                    </button>
                </div>
                <div id="practiceResult" class="practice-completed-card" style="display:none; margin-top:30px; text-align:center;"></div>
            </div>
        `;
        pageContentEl.innerHTML = html;
        if (!isAlreadyPassed) document.getElementById('nextPageBtn').disabled = true;
    };

    // NUEVA FUNCIÓN: Maneja la selección visual de las opciones
    window.selectPracticeOption = function(cardIdx, optIdx) {
        const card = document.getElementById(`p-card-${cardIdx}`);
        // Si los botones están deshabilitados (ya se verificó), no hacer nada
        if (card.querySelector('.quiz-option-btn').disabled) return;

        const options = card.querySelectorAll('.quiz-option-btn');

        // Quitar clase 'selected' de todas las opciones de esta tarjeta
        options.forEach(btn => btn.classList.remove('selected'));

        // Agregar 'selected' a la opción clickeada y guardar su índice
        options[optIdx].classList.add('selected');
        card.dataset.selected = optIdx;
    };

    window.startPracticeMode();

    // FUNCIÓN ACTUALIZADA: Verifica las respuestas con la nueva estructura
    window.checkPracticeAnswers = function() {
        const cards = document.querySelectorAll('.practice-card');
        let allCorrect = true;
        let anyUnanswered = false;

        cards.forEach(card => {
            const correctIdx = parseInt(card.dataset.answer);
            // Obtenemos la selección del dataset que guardamos en selectPracticeOption
            const selectedIdx = card.dataset.selected ? parseInt(card.dataset.selected) : null;
            const options = card.querySelectorAll('.quiz-option-btn');

            // Limpiar estilos previos
            options.forEach(btn => btn.classList.remove('correct', 'incorrect'));
            card.style.border = "";

            if (selectedIdx === null) {
                allCorrect = false;
                anyUnanswered = true;
                // Resaltar tarjeta incompleta
                card.style.border = "2px solid var(--warning)";
            } else {
                // Aplicar feedback visual y lógica
                if (selectedIdx === correctIdx) {
                    options[selectedIdx].classList.add('correct');
                } else {
                    options[selectedIdx].classList.add('incorrect');
                    // Opcional: mostrar cuál era la correcta
                    // options[correctIdx].classList.add('correct'); 
                    allCorrect = false;
                }
            }
            
            // Deshabilitar botones para evitar cambios después de verificar
            if (!anyUnanswered) {
                options.forEach(btn => btn.disabled = true);
            }
        });

        if (anyUnanswered) {
            alert("Por favor, responde todas las preguntas antes de verificar.");
            return;
        }

        const resultArea = document.getElementById('practiceResult');
        const actionArea = document.getElementById('practiceActions');

        if (allCorrect) {
            resultArea.innerHTML = `
                <i class="fas fa-check-circle" style="font-size: 3rem; color: #28a745; margin-bottom: 15px;"></i>
                <h3 style="color:#28a745">¡Excelente trabajo!</h3>
                <p>Has respondido correctamente todas las preguntas.</p>
            `;
            resultArea.style.display = 'block';
            actionArea.style.display = 'none';

            if (currentPageIndex >= maxUnlockedIndex) {
                maxUnlockedIndex = currentPageIndex + 1;
                saveProgress(currentPageIndex, false);
                updateNavigationUI(currentPageIndex);
            }
            document.getElementById('nextPageBtn').disabled = false;
        } else {
            const btn = actionArea.querySelector('button');
            btn.innerHTML = "<i class='fas fa-sync-alt'></i> Intentar de nuevo";
            btn.classList.replace('btn-primary', 'btn-secondary');
            // Recargar la página para reiniciar el intento
            btn.onclick = () => window.renderPage(currentPageIndex);
        }
    };
}

function renderFlipCards(page) {
    // 1. Usamos 'practice-card' para el contenedor principal para que se vea IGUAL al quiz
    let html = `
        <div style="height:100%; display:flex; flex-direction:column; justify-content:center; max-width: 800px; margin: 0 auto; width:100%;">
            
            <div class="practice-card">
                <h2 style="color:var(--primaryColor); margin-top:0; margin-bottom:20px; font-size:1.1rem; font-weight:600;">
                    ${page.title}
                </h2>
                
                ${page.payload.instruction ? `<p style="margin-bottom:20px; color:#666;">${page.payload.instruction}</p>` : ''}
                
                <div class="cards-list-container">
    `;
    
    page.payload.cards.forEach((card, index) => {
        // Icono y color
        const iconHtml = card.front.icon || '<i class="fas fa-info-circle"></i>';
        const iconColor = card.front.color || 'var(--primaryColor)';
        
        html += `
            <div class="accordion-card" id="acc-card-${index}">
                <div class="accordion-header" onclick="window.toggleAccordion(${index})">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <span style="color: ${iconColor}; font-size: 1rem;">${iconHtml}</span>
                        <span>${card.front.title}</span>
                    </div>
                    <i class="fas fa-chevron-down toggle-icon" style="font-size:0.8rem;"></i>
                </div>
                
                <div class="accordion-body">
                    <p style="margin-bottom:10px;"><strong>Definición:</strong> ${card.back.content}</p>
                    ${card.back.action ? `<div style="font-size:0.9rem; color:var(--secondaryColor); text-align:right;"><i class="fas fa-arrow-right"></i> ${card.back.action}</div>` : ''}
                </div>
            </div>
        `;
    });
    
    html += `       </div> </div>     </div>`;       // Cierre contenedor principal wrapper
    
    pageContentEl.innerHTML = html;
}

// NUEVA FUNCIÓN AUXILIAR (Asegúrate de copiarla también)
window.toggleAccordion = function(index) {
    const card = document.getElementById(`acc-card-${index}`);
    // Cierra otros si quisieras comportamiento exclusivo (opcional, aquí desactivado para permitir varios abiertos)
    card.classList.toggle('active');
};
function renderGallery(page) {
    const data = page.payload;
    
    let html = `
        <div class="gallery-container" style="text-align:center;">
            <h2 style="color:var(--primaryColor);">${page.title}</h2>
            <p>${data.instruction || ''}</p>
            <div class="gallery-btn-group">`;

    data.buttons.forEach(btn => {
        const btnClass = btn.style === 'good' ? 'btn-success' : 'btn-danger';
        const icon = btn.style === 'good' ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>';
        
        html += `
            <button class="btn ${btnClass} gallery-trigger" 
                onclick="openImageModal('${btn.url}', '${btn.caption}')">
                ${icon} ${btn.label}
            </button>`;
    });

    html += `</div></div>`;
    pageContentEl.innerHTML = html;
}

window.openImageModal = function(url, caption) {
    let modal = document.getElementById('imgModalViewer');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'imgModalViewer';
        modal.className = 'course-modal-overlay';
        modal.onclick = (e) => { if(e.target === modal) modal.style.display = 'none'; };
        modal.innerHTML = `
            <div class="course-modal" style="max-width:90vh; width:auto; padding:20px;">
                <div style="text-align:right; margin-bottom:10px;">
                    <span onclick="document.getElementById('imgModalViewer').style.display='none'" 
                          style="cursor:pointer; font-size:1.5rem; color:#666;">&times;</span>
                </div>
                <img id="imgModalSrc" style="max-width:100%; max-height:70vh; border-radius:8px; display:block; margin:0 auto;">
                <p id="imgModalCap" style="margin-top:15px; font-weight:bold; color:var(--textForm); text-align:center;"></p>
            </div>`;
        document.body.appendChild(modal);
    }

    document.getElementById('imgModalSrc').src = url;
    document.getElementById('imgModalCap').innerText = caption;
    modal.style.display = 'flex';
};
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
    
    // 2. Guardar en BD
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const courseId = new URLSearchParams(location.search).get("id");
        
        if (user && courseId) {
            const updateData = {
                score: finalScore,
                quiz_answers: quizDetails,
                progress: 95, // Avanzamos casi al final
                status: 'in_progress'
            };

            const { error } = await supabase
                .from('user_course_assignments')
                .update(updateData)
                .eq('user_id', user.id)
                .eq('course_id', courseId);

            if (error) throw error;
        }
    } catch (e) {
        console.error("Error guardando quiz:", e);
        // Opcional: alertar al usuario si falla el guardado
        return; 
    }

    // 3. LÓGICA DE NAVEGACIÓN Y DESBLOQUEO
    isQuizInProgress = false; 
    document.body.classList.remove('quiz-mode');

    // Buscamos si existe una página siguiente (la encuesta)
    const nextPageIndex = currentPageIndex + 1;
    
    if (nextPageIndex < courseData.pages.length) {
        // CORRECCIÓN CRÍTICA: Desbloquear localmente la siguiente página
        if (nextPageIndex > maxUnlockedIndex) {
            maxUnlockedIndex = nextPageIndex;
        }
        
        // Actualizamos visualmente el sidebar para quitar el candado
        updateNavigationUI(currentPageIndex);

        alert("Examen finalizado. Pasando a la Encuesta de Satisfacción.");
        renderPage(nextPageIndex); 
    } else {
        // Caso borde: Si no hay encuesta, finalizamos aquí
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