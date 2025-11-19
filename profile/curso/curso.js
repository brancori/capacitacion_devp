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
                    pageContentEl.innerHTML = '<p>Error: No hay preguntas en este quiz.</p>';
                    break;
                }

                const quizContent = page.payload.questions.map((q, qIdx) => `
                    <div class="quiz-card">
                        <h4 class="quiz-question-text">
                            <i class="fas fa-question-circle"></i> ${qIdx + 1}. ${q.question}
                        </h4>
                        <div class="quiz-options">
                            ${q.options.map((opt, oIdx) => `
                                <button class="quiz-btn" onclick="window.checkQuizAnswer(this, ${qIdx}, ${oIdx}, ${q.answer})">
                                    ${opt}
                                </button>
                            `).join('')}
                        </div>
                        <div id="feedback-${qIdx}" class="quiz-feedback"></div>
                    </div>
                `).join('');
                
                pageContentEl.innerHTML = `
                    <div class="quiz-container">
                        <h3><i class="fas fa-clipboard-check"></i> ${page.title || 'Evaluación'}</h3>
                        <p class="mb-4">Selecciona la respuesta correcta para cada pregunta.</p>
                        ${quizContent}
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
            btn.classList.toggle('active', idx === index);
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
        // Verificar autenticación
        const { data: userData, error: authError } = await supabase.auth.getUser();
        
        if (authError || !userData?.user) {
            pageContentEl.innerHTML = `
                <div style="text-align:center; padding:40px;">
                    <h3>🔒 Acceso Restringido</h3>
                    <p>Debes iniciar sesión para ver este curso.</p>
                    <a href="../login.html" class="btn btn-primary">Ir al Login</a>
                </div>`;
            return;
        }

        const myTenantId = userData.user.user_metadata.tenant_id;
        const myRole = userData.user.user_metadata.role;

        // Construir consulta
        let query = supabase
            .from("articles") 
            .select("title, content_json, tenant_id")
            .eq("id", courseId);

        // Seguridad Row Level Security (Simulada en JS por si acaso)
        if (myRole !== "master" && myTenantId) {
            query = query.eq("tenant_id", myTenantId);
        }

        const { data: fetchedCourse, error: courseError } = await query.single();

        if (courseError || !fetchedCourse) {
            console.error("Error Supabase:", courseError);
            pageContentEl.innerHTML = "<div class='error-message'>No tienes permiso para ver este curso o no existe.</div>";
        } else {
            console.log(`✅ Curso cargado exitosamente: ${fetchedCourse.title}`);
            loadCourse(fetchedCourse.title, fetchedCourse.content_json);
        }

    } catch (e) {
        console.error('Error crítico en initCourse:', e);
        pageContentEl.innerHTML = "<p class='error-message'>Ocurrió un error inesperado cargando el curso.</p>";
    }
}

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initCourse);