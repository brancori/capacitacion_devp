async function initCourse() {
    console.log('🚀 === INICIANDO CURSO - VERSIÓN FINAL ===');
    
    // 1. CARGA INMEDIATA DEL TENANT (Prioridad Visual)
    if (window.tenantManager) {
        // Carga configuración usando la ruta absoluta corregida en tenant-manager.js
        const config = await window.tenantManager.loadFromJson();
        
        console.log("🕵️‍♂️ TENANT DETECTADO:", window.tenantManager.tenantSlug);
        console.log("🎨 COLOR:", config.colors?.primary || config.primaryColor);
        
        window.tenantManager.applyStyles();
        
        // Muestra la página suavemente
        document.body.style.opacity = '1'; 
    } else {
        console.error("❌ TenantManager no cargado en el HTML");
        document.body.style.opacity = '1';
    }

    // 2. Lógica original de obtención de datos
    const params = new URLSearchParams(location.search);
    const courseId = params.get("id");
    let courseData = null;
    let currentPageIndex = 0;

    // Referencias DOM
    const pageContentEl = document.getElementById("pageContent");
    const sidebarListEl = document.getElementById("sidebarList");
    const prevPageBtn = document.getElementById("prevPageBtn");
    const nextPageBtn = document.getElementById("nextPageBtn");
    const courseTitleEl = document.getElementById("courseTitle");
    const footerMessageEl = document.getElementById("footerMessage");

    // Función renderPage
    function renderPage(index) {
        if (!courseData || !courseData.pages || index < 0 || index >= courseData.pages.length) {
            return;
        }

        currentPageIndex = index;
        const page = courseData.pages[currentPageIndex];
        pageContentEl.innerHTML = ''; 

        console.log(`DEBUG-RENDER: Renderizando página ${index + 1} (${page.type})`); 

        switch (page.type) {
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
            
            case 'text':
                pageContentEl.innerHTML = `<div class="page-text">${page.payload.html}</div>`;
                break;
                
            default:
                pageContentEl.innerHTML = `<p>Tipo no soportado: ${page.type}</p>`;
        }

        prevPageBtn.disabled = currentPageIndex === 0;
        nextPageBtn.disabled = currentPageIndex === courseData.pages.length - 1;
        footerMessageEl.textContent = `Página ${currentPageIndex + 1} de ${courseData.pages.length}`;

        document.querySelectorAll('.page-btn').forEach((btn, idx) => {
            btn.classList.toggle('active', idx === index);
        });
    }

    // Función loadCourse
    function loadCourse(title, contentJson) {
        courseData = contentJson;
        courseTitleEl.textContent = title;
        
        if (!courseData.pages || courseData.pages.length === 0) {
            sidebarListEl.innerHTML = "<p>Sin contenido.</p>";
            return;
        } 
        
        sidebarListEl.innerHTML = courseData.pages.map((page, index) => {
            const titleText = page.title || `Página ${index + 1}`; 
            const icon = page.type === 'video' ? 'fa-video' : 'fa-file-alt';
            return `<button class="page-btn" onclick="renderPage(${index})"><i class="fas ${icon}"></i> <span>${titleText}</span></button>`;
        }).join('');
        
        window.renderPage = renderPage;
        renderPage(0);
    }

    // Eventos de Navegación
    prevPageBtn.addEventListener('click', () => {
        if (currentPageIndex > 0) renderPage(currentPageIndex - 1);
    });

    nextPageBtn.addEventListener('click', () => {
        if (currentPageIndex < courseData.pages.length - 1) renderPage(currentPageIndex + 1);
    });

    // 3. Lógica de Carga (Supabase)
    if (!courseId) {
        pageContentEl.innerHTML = "<p>Error: no se recibió ID del curso</p>";
        return;
    }

    try {
        const { data: userData, error: authError } = await supabase.auth.getUser();
        if (authError || !userData?.user) {
            pageContentEl.innerHTML = "<p>Debes iniciar sesión.</p>";
            return;
        }

        const myTenantId = userData.user.user_metadata.tenant_id;
        const myRole = userData.user.user_metadata.role;

        let query = supabase
            .from("articles") 
            .select("title, content_json, tenant_id")
            .eq("id", courseId);

        if (myRole !== "master" && myTenantId) {
            query = query.eq("tenant_id", myTenantId);
        }

        const { data: fetchedCourse, error: courseError } = await query.single();

        if (courseError || !fetchedCourse) {
            console.error("Error curso:", courseError);
            pageContentEl.innerHTML = "<p>No tienes acceso a este curso.</p>";
        } else {
            // Ya cargamos el tenant al inicio, aquí solo pintamos el curso
            loadCourse(fetchedCourse.title, fetchedCourse.content_json);
            console.log(`✅ Curso cargado.`);
        }

    } catch (e) {
        console.error('Error crítico:', e);
    }
}

document.addEventListener('DOMContentLoaded', initCourse);