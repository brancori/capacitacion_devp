// ==========================================
// 0. VARIABLES GLOBALES (PARA QUE TODOS LAS VEAN)
// ==========================================
// Estas variables viven fuera de las funciones para que startQuiz y renderPage compartan los datos.

let courseData = null;
let currentPageIndex = 0;
let isQuizInProgress = false; //  El candado del examen
let currentAnswers = {};      // Respuestas temporales
let maxUnlockedIndex = 0; // Control de navegación
let _navigatedFromSidebarClick = false;
// Referencias a elementos del HTML (se llenan al iniciar)
let pageContentEl, sidebarListEl, prevPageBtn, nextPageBtn, courseTitleEl, footerMessageEl;

let slideStartTime = null;
let slideTimeData = {};      // acumulado local de esta sesión
let _timeFlushInterval = null;

// ==========================================
// 1. INICIO DEL CURSO
// ==========================================

// Carga el tiempo previo guardado en BD al iniciar el curso
async function loadSlideTimeData(userId, courseId) {
    const { data } = await supabase
        .from('user_course_assignments')
        .select('slide_time_data')
        .eq('user_id', userId)
        .eq('course_id', courseId)
        .maybeSingle();

    if (data?.slide_time_data) {
        slideTimeData = data.slide_time_data;
    }
}

// Al inicio de curso.js, junto a las otras funciones globales

function showModal(title, message, type = 'info', callback = null) {
    const modal = document.getElementById('resultModal');
    const iconEl = document.getElementById('modalIcon');
    const titleEl = document.getElementById('modalTitle');
    const scoreEl = document.getElementById('modalScore');
    const msgEl = document.getElementById('modalMessage');
    const btn = modal.querySelector('.btn');

    // Configurar íconos y colores según tipo
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        warning: '⚠️'
    };
    iconEl.textContent = icons[type] || icons.info;

    titleEl.textContent = title;
    msgEl.textContent = message;
    scoreEl.style.display = 'none'; // Ocultar score si no se usa

    // Cambiar color del botón según tipo (opcional)
    btn.className = 'btn btn-primary';
    if (type === 'error') btn.classList.add('btn-danger');
    else if (type === 'success') btn.classList.add('btn-success');

    modal.style.display = 'flex';

    // Manejar cierre
    const closeHandler = () => {
        modal.style.display = 'none';
        btn.removeEventListener('click', closeHandler);
        if (callback) callback();
    };
    btn.onclick = closeHandler;
}

function showConfirm(title, message, onConfirm, onCancel) {
    const modal = document.getElementById('resultModal');
    const iconEl = document.getElementById('modalIcon');
    const titleEl = document.getElementById('modalTitle');
    const scoreEl = document.getElementById('modalScore');
    const msgEl = document.getElementById('modalMessage');
    const btnContainer = modal.querySelector('.course-modal'); // necesitamos añadir botones extra

    // Limpiar botón existente y crear dos nuevos
    const existingBtn = modal.querySelector('.btn');
    if (existingBtn) existingBtn.remove();

    iconEl.textContent = '❓';
    titleEl.textContent = title;
    msgEl.textContent = message;
    scoreEl.style.display = 'none';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Cancelar';

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'btn btn-primary';
    acceptBtn.textContent = 'Aceptar';

    const footer = document.createElement('div');
    footer.style.cssText = 'display: flex; justify-content: center; gap: 20px; margin-top: 20px;';
    footer.appendChild(cancelBtn);
    footer.appendChild(acceptBtn);

    // Insertamos los botones en el modal (después del mensaje)
    const existingFooter = modal.querySelector('.course-modal > div:last-child');
    if (existingFooter) existingFooter.remove();
    document.querySelector('#resultModal .course-modal').appendChild(footer);

    modal.style.display = 'flex';

    const cleanup = () => {
        modal.style.display = 'none';
        cancelBtn.removeEventListener('click', cancelHandler);
        acceptBtn.removeEventListener('click', acceptHandler);
    };

    const cancelHandler = () => {
        cleanup();
        if (onCancel) onCancel();
    };

    const acceptHandler = () => {
        cleanup();
        if (onConfirm) onConfirm();
    };

    cancelBtn.addEventListener('click', cancelHandler);
    acceptBtn.addEventListener('click', acceptHandler);
}

// Pausa el contador del slide actual y acumula segundos
function pauseSlideTimer() {
    if (slideStartTime === null) return;
    const seconds = Math.round((Date.now() - slideStartTime) / 1000);
    if (seconds < 1) return;
    const key = String(currentPageIndex);
    slideTimeData[key] = (slideTimeData[key] || 0) + seconds;
    slideTimeData['total'] = (slideTimeData['total'] || 0) + seconds;
    slideStartTime = null;
}

// Inicia el contador para el slide actual
function startSlideTimer() {
    slideStartTime = Date.now();
}

// Envía silenciosamente a Supabase
async function flushSlideTime() {
    pauseSlideTimer();   // captura lo acumulado hasta ahora
    startSlideTimer();   // reinicia para seguir contando

    try {
        const { data: { user } } = await supabase.auth.getUser();
        const courseId = new URLSearchParams(location.search).get("id");
        if (!user || !courseId) return;

        await supabase
            .from('user_course_assignments')
            .update({ slide_time_data: slideTimeData })
            .eq('user_id', user.id)
            .eq('course_id', courseId);
    } catch (e) {
        console.warn('[TIME] Error en flush silencioso:', e);
    }
}

// Arranca el intervalo de 2 minutos
function startTimeTracking() {
    if (_timeFlushInterval) clearInterval(_timeFlushInterval);
    _timeFlushInterval = setInterval(flushSlideTime, 120000); // 2 min
}

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

        // 🔽 Sidebar desplegable en móvil (no invasivo)
        if (window.innerWidth <= 768) {
            const sidebar = document.querySelector('.course-sidebar');
            const list = document.getElementById('sidebarList');
            if (sidebar && list && !document.querySelector('.current-page-indicator')) {
                const topBar = document.createElement('div');
                topBar.className = 'current-page-indicator';
                topBar.textContent = 'Cargando...';
            
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'mobile-sidebar-toggle';
                toggleBtn.innerHTML = '<span>☰ Índice del curso</span>';
                toggleBtn.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
            
                // Ocultar el h2 que viene en el HTML
                const h2 = sidebar.querySelector('h2');
                if (h2) h2.style.display = 'none';
            
                sidebar.insertBefore(topBar, sidebar.firstChild);
                sidebar.insertBefore(toggleBtn, list);
            
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    sidebar.classList.toggle('expanded');
                });
            
                sidebar.addEventListener('click', (e) => {
                    if (e.target.closest('.page-btn')) {
                        sidebar.classList.remove('expanded');
                    }
                });
            }
        }

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
            showModal('Sesión expirada', 'Tu sesión ha caducado. Serás redirigido al inicio.', 'error', () => {
                window.location.href = '../../index.html';
            });
            return;
        }

        await loadSlideTimeData(session.user.id, courseId);

        const { data: rawData, error } = await supabase
            .from("articles")
            .select("title, content_path, survey_json, tenant_id, question_show")
            .eq("id", courseId);

        if (error || !rawData) {
            pageContentEl.innerHTML = `<div class='error-message'>Error cargando curso.</div>`;
            return;
        }

        const fetchedCourse = Array.isArray(rawData) ? rawData[0] : rawData;
        const basePath = fetchedCourse.content_path;

        // Fetch content.json local
        let finalCourseData;
        try {
            const res = await fetch(`${basePath}/content.json`);
            if (!res.ok) throw new Error('No se pudo cargar content.json');
            finalCourseData = await res.json();
        } catch (e) {
            pageContentEl.innerHTML = `<div class='error-message'>Error cargando contenido del curso.</div>`;
            return;
        }

        if (!finalCourseData.pages) finalCourseData.pages = [];

        // Resolver practice refs desde practice.json
        try {
            const practiceRes = await fetch(`${basePath}/practice.json`);
            if (practiceRes.ok) {
                const practiceMap = await practiceRes.json();
                finalCourseData.pages = finalCourseData.pages.map(p =>
                    p.type === 'practice' && p.ref ? (practiceMap[p.ref] || p) : p
                );
            }
        } catch (_) { /* sin practice.json */ }

        if (finalCourseData.pages) {
            finalCourseData.pages = finalCourseData.pages.filter(p => p.type !== 'quiz' && p.type !== 'survey');
        }

        // Quiz Final — desde archivo local
        let games = null;
        try {
            const quizRes = await fetch(`${basePath}/quiz.json`);
            if (quizRes.ok) {
                const quizObj = await quizRes.json();
                if (quizObj?.questions?.length > 0) {
                    if (fetchedCourse.question_show && fetchedCourse.question_show > 0) {
                        const shuffled = quizObj.questions.sort(() => 0.5 - Math.random());
                        quizObj.questions = shuffled.slice(0, fetchedCourse.question_show);
                    }
                    finalCourseData.pages.push({ type: 'quiz', title: 'Evaluación Final', payload: quizObj });
                }
            }
        } catch (_) { /* sin quiz */ }

        // Games — desde archivo local
        try {
            const gamesRes = await fetch(`${basePath}/games_json.json`);
            if (gamesRes.ok) {
                const fileGames = await gamesRes.json();
                if (Array.isArray(fileGames) && fileGames.length > 0) games = fileGames;
            }
        } catch (_) { /* sin games */ }
        if (Array.isArray(games) && games.length > 0) {
            const norm = (t) => (t && String(t).trim().replace(/\s+/g, ' ')) || '';
            const findAnchor = (title) =>
                finalCourseData.pages.findIndex(p => norm(p.title) === norm(title));

            const withMeta = games.map((game) => {
                const { insertAfter, ...pageData } = game;
                const origIdx = findAnchor(insertAfter);
                return { insertAfter, pageData, origIdx };
            });

            // Insertar primero los simuladores anclados más al final del curso (índice alto);
            // los que no encontraron ancla van al final del orden de inserción.
            withMeta.sort((a, b) => {
                if (a.origIdx === -1 && b.origIdx === -1) return 0;
                if (a.origIdx === -1) return 1;
                if (b.origIdx === -1) return -1;
                return b.origIdx - a.origIdx;
            });

            withMeta.forEach(({ insertAfter, pageData, origIdx }) => {
                const insertIdx = findAnchor(insertAfter);
                if (insertIdx !== -1) {
                    finalCourseData.pages.splice(insertIdx + 1, 0, pageData);
                } else {
                    console.warn(`[curso] games_json: ninguna página coincide con insertAfter "${insertAfter}". Se inserta antes del quiz o al final.`);
                    const quizIdx = finalCourseData.pages.findIndex(p => p.type === 'quiz');
                    const pos = quizIdx !== -1 ? quizIdx : finalCourseData.pages.length - 1;
                    finalCourseData.pages.splice(pos, 0, pageData);
                }
            });
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

    // Agrupar páginas por _cabecera
    let groups = [];
    let currentGroup = { label: 'General', pages: [] };

    courseData.pages.forEach((page, index) => {
        if (page.enabled === false) return;
        if (page._cabecera) {
            const cleanLabel = page._cabecera.replace(/=+/g, '').trim();
            if (currentGroup.pages.length > 0) {
                groups.push(currentGroup);
            }
            currentGroup = { label: cleanLabel, pages: [] };
        }
        currentGroup.pages.push({ page, index });
    });
    if (currentGroup.pages.length > 0) groups.push(currentGroup);

    // Crear menú lateral con grupos colapsables
    sidebarListEl.innerHTML = groups.map((group) => {
        const items = group.pages.map(({ page, index }) => {
            let icon = 'fa-file-alt';
            if (page.type === 'video') icon = 'fa-video';
            if (page.type === 'quiz' || page.type === 'practice') icon = 'fa-tasks';
            if (page.type === 'interactive' || page.type === 'flipCards') icon = 'fa-th-large';
            if (page.type === 'stepByStep') icon = 'fa-list-ol';
            const titleText = page.title || `Tema ${index + 1}`;

            return `
                <button class="page-btn" onclick="window.renderPage(${index})">
                    <i class="fas ${icon}"></i>
                    <span>${titleText}</span>
                </button>`;
        }).join('');

        return `
            <div class="sidebar-group">
                <button class="sidebar-group-header" onclick="toggleSidebarGroup(this)">
                    <span>${group.label}</span>
                    <i class="fas fa-chevron-down sidebar-chevron"></i>
                </button>
                <div class="sidebar-group-items">
                    ${items}
                </div>
            </div>`;
    }).join('');

    // Validar que el startIndex no supere el total de páginas (por seguridad)
    if (startIndex >= courseData.pages.length) {
        startIndex = courseData.pages.length - 1;
    }

    // Renderizar la página recuperada
    startTimeTracking();
    renderPage(startIndex);
}

function toggleSidebarGroup(headerBtn) {
    const clickedGroup = headerBtn.closest('.sidebar-group');
    const isOpen = clickedGroup.classList.contains('open');
    
    document.querySelectorAll('.sidebar-group').forEach(group => {
        group.classList.remove('open');
    });
    
    if (!isOpen) {
        clickedGroup.classList.add('open');
        setTimeout(() => {
            const firstPageBtn = clickedGroup.querySelector('.page-btn');
            if (!firstPageBtn) return;
            const match = firstPageBtn.getAttribute('onclick').match(/\d+/);
            if (match) {
                const pageIndex = parseInt(match[0]);
                if (pageIndex <= maxUnlockedIndex) {
                    window.renderPage(pageIndex);
                }
            }
        }, 350);
    }
}

// ==========================================
// 4. RENDERIZADO DE PÁGINA (CORE)
// ==========================================
// Se asigna a window para que el HTML pueda llamarla
window.renderPage = function(index) {
    console.log('%c[RENDER] renderPage llamado con index=' + index, 'color: cyan; font-weight: bold');
    console.trace();
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
    if (page.enabled === false) return;
    if (window.updateQAPageContext) {
        const pageTitle = page.title || `Tema ${index + 1}`;
        window.updateQAPageContext(index, pageTitle);
    }
    pageContentEl.innerHTML = ''; 

    // Guardar progreso automáticamente si NO es Quiz, Practice o Encuesta
    if (page.type !== 'quiz' && page.type !== 'practice' && page.type !== 'survey' 
        && page.type !== 'eppGame' && page.type !== 'craneSimulator' && page.type !== 'lotoGame' && page.type !== 'artGame' && page.type !== 'checklistBuilder' && page.type !== 'accidentInvestigation' && page.type !== 'dragDrop') {
        if (index >= maxUnlockedIndex) {
            maxUnlockedIndex = index + 1; // Preparamos el siguiente
            saveProgress(index, false);
        }
    }
    
    // IMPORTANTE: Si es 'practice' y ya fue superado, permitimos avanzar visualmente
    if (page.type === 'practice' && index < maxUnlockedIndex) {
         // Ya estaba aprobado, no bloqueamos
    }
    pauseSlideTimer();   // detiene el slide anterior
    startSlideTimer();   // inicia el nuevo
switch (page.type) {
        case 'text':
            pageContentEl.innerHTML = page.payload?.html || "<p>Sin contenido.</p>";
            pageContentEl.querySelectorAll('script').forEach(function(s) {
                var n = document.createElement('script');
                n.textContent = s.textContent;
                document.body.appendChild(n);
                s.remove();
            });
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
        case 'eppGame':             // <--- Juego EPP
            window.renderEppGame(page);
            break;
        case 'craneSimulator':      // <--- SIMULADOR DE GRÚAS
            window.renderCraneSimulator(page);
            break;
        case 'lotoGame':
            window.renderLotoGame(page);
            break;
        case 'artGame':
            window.renderArtGame(page);
        break;
        case 'checklistBuilder':
            window.renderChecklistBuilder(page);
            break;
        case 'accidentInvestigation':
            window.renderAccidentInvestigation(page);
            break;
        case 'dragDrop':
            window.renderDragDrop(page);
            break;
        case 'integratedExercise':
            window.renderIntegratedExercise(page);
            break;
        case 'actoCondicion':
            window.renderActoCondicion(page);
            break;
        case 'module-intro': 
            window.renderModuleIntro(page); 
            break;
        default:
            pageContentEl.innerHTML = `<p>Tipo desconocido: ${page.type}</p>`;
    }

    updateNavigationUI(index);
    triggerSlidingPreload(index);
};

function updateNavigationUI(index) {
    // 1. Actualizar textos y botones del Footer
    footerMessageEl.textContent = `Página ${index + 1} de ${courseData.pages.length}`;
    prevPageBtn.disabled = (index === 0);

    const currentPage = courseData.pages[index];
    
    if (currentPage.type === 'practice' && index >= maxUnlockedIndex) {
        nextPageBtn.disabled = true; 
    } else {
        nextPageBtn.disabled = (index === courseData.pages.length - 1);
    }

    // 2. Actualizar Sidebar (Colores y SCROLL AUTOMÁTICO)
    const btns = document.querySelectorAll('.page-btn');
    
    btns.forEach((btn) => {
        const btnIndex = parseInt(btn.getAttribute('onclick').match(/\d+/)[0]);
        const isActive = (btnIndex === index);
        btn.classList.toggle('active', isActive);
        
        if (btnIndex > maxUnlockedIndex) {
            btn.classList.add('locked');
            if (!btn.querySelector('.fa-lock')) {
                btn.innerHTML += ' <i class="fas fa-lock" style="font-size:0.7em; margin-left:auto;"></i>';
            }
        } else {
            btn.classList.remove('locked');
            const lockIcon = btn.querySelector('.fa-lock');
            if (lockIcon) lockIcon.remove();
        }
    
        if (isActive) {
            console.log('%c[SCROLL] Intentando centrar botón idx=' + btnIndex, 'color: yellow; font-weight: bold');
            console.log('[SCROLL] sidebar.scrollTop antes:', document.getElementById('sidebarList')?.scrollTop);
            console.group('%c[ACTIVE] Centrando botón activo', 'color: #2e7d7a; font-weight: bold');
            const pageTitle = btn.querySelector('span')?.innerText || 'sin título';
            console.log('Botón activo:', pageTitle);
            
            const group = btn.closest('.sidebar-group');
            if (group) {
                const groupLabel = group.querySelector('.sidebar-group-header span')?.innerText || 'sin nombre';
                console.log('Pertenece al grupo:', groupLabel);
                
                // Asegurar que el grupo esté abierto
                if (!group.classList.contains('open')) {
                    document.querySelectorAll('.sidebar-group').forEach(g => g.classList.remove('open'));
                    group.classList.add('open');
                }
                console.log('Grupo forzado a abrirse (si no lo estaba)');
            }
            
            // Cancelar smooth scroll previo para evitar conflictos
            const sidebar = document.getElementById('sidebarList');
            if (sidebar) {
                sidebar.style.scrollBehavior = 'auto';
            }
            
// Usar offsetTop para cálculo correcto independiente del viewport
requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        const sidebar = document.getElementById('sidebarList');
        if (!sidebar) {
            console.error('No se encontró #sidebarList');
            console.groupEnd();
            return;
        }

        const targetScroll = btn.getBoundingClientRect().top - sidebar.getBoundingClientRect().top + sidebar.scrollTop - (sidebar.clientHeight / 2) + (btn.offsetHeight / 2);
        const clamped = Math.max(0, targetScroll);

        console.log('[SCROLL] offsetTop:', btn.offsetTop, 'clientHeight:', sidebar.clientHeight, 'targetScroll:', targetScroll, 'clamped:', clamped);

        sidebar.style.scrollBehavior = 'smooth';
        sidebar.scrollTo({ top: clamped, behavior: 'smooth' });
    });
});
        }
    });
  // 🔄 Sincroniza el texto de la barra móvil con la página activa
  if (window.innerWidth <= 768) {
    const activeBtn = document.querySelector('.page-btn.active');
    const toggleSpan = document.querySelector('.mobile-sidebar-toggle span');
    if (activeBtn && toggleSpan) {
    }
  }
// 🔄 Sincronizar barra superior con página activa
const topBar = document.querySelector('.current-page-indicator');
const activeBtn = document.querySelector('.page-btn.active');
if (topBar && activeBtn && window.innerWidth <= 768) {
    topBar.textContent = activeBtn.querySelector('span')?.textContent || `Página ${index + 1}`;
}


}


// ==========================================
// GUARDAR RESPUESTAS DE SIMULADORES
// ==========================================
window.saveSimuladorRespuesta = async function(simuladorType, payload) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { console.warn('[SIM] No hay sesión'); return; }
        const courseId = new URLSearchParams(location.search).get('id');
        if (!courseId) { console.warn('[SIM] No hay courseId'); return; }

        const { error } = await supabase
            .from('simulador_respuestas')
            .upsert({
                user_id: session.user.id,
                course_id: courseId,
                simulador_type: simuladorType,
                payload: payload,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,course_id,simulador_type' });

        if (error) {
            console.error('[SIM] Error guardando:', error);
        } else {
            console.log('[SIM] ✅ Respuesta guardada:', simuladorType);
        }
    } catch(e) {
        console.error('[SIM] Excepción:', e);
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
    showConfirm(
        'Iniciar examen',
        'No podrás salir hasta terminar. ¿Estás seguro?',
        () => {
            isQuizInProgress = true;
            document.getElementById('quizIntro').style.display = 'none';
            document.getElementById('quizQuestionsContainer').style.display = 'block';
            prevPageBtn.disabled = true;
            nextPageBtn.disabled = true;
            currentAnswers = {};
            window.scrollTo(0, 0);
        }
    );
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

        showModal('Examen completado', 'Pasando a la Encuesta de Satisfacción.', 'success', () => {
            renderPage(nextPageIndex);
        });
    } else {
        // Caso borde: Si no hay encuesta, finalizamos aquí
        showModal('Curso finalizado', 'Has completado todas las actividades.', 'success', () => {
            window.location.href = '../profile.html';
        });
    }
};

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

            // Flush final garantizado
        pauseSlideTimer();
        if (_timeFlushInterval) clearInterval(_timeFlushInterval);

        // 1. Actualizar BD: Status COMPLETED
        const { error } = await supabase
            .from('user_course_assignments')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                survey_answers: surveyData,
                progress: 100,
                slide_time_data: slideTimeData 
            })
            .eq('user_id', user.id)
            .eq('course_id', courseId);

        if (error) throw error;

        // 2. REDIRECCIÓN AUTOMÁTICA
        showModal('¡Gracias!', 'Curso completado correctamente. Redirigiendo...', 'success', () => {
            window.location.href = '../profile.html';
        });

    } catch (err) {
        console.error(err);
        alert("Error al finalizar: " + err.message);
    }
};


// Iniciar todo al cargar la página
document.addEventListener('DOMContentLoaded', initCourse);

