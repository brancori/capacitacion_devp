// Función de inicialización principal
async function initCourse() {
    console.log('🚀 === INICIANDO CURSO - VERSIÓN ACTUALIZADA ===');
    console.log('🔍 Tenant Manager:', window.tenantManager);
    
    // 1. CARGA INMEDIATA DEL TENANT (Prioridad Visual)
    // Esto se ejecuta antes de pedir datos a la BD para evitar "flicker"
if (window.tenantManager) {
        const config = await window.tenantManager.loadFromJson();
        
        // 🔍 AGREGA ESTO PARA VER LA VERDAD EN LA CONSOLA:
        console.log("🕵️‍♂️ TENANT DETECTADO:", window.tenantManager.tenantSlug);
        console.log("🎨 COLOR PRIMARIO CARGADO:", config.colors?.primary || config.primaryColor);
        
        window.tenantManager.applyStyles();
        document.body.style.opacity = '1'; 
    } else {
        console.error("❌ TenantManager no cargado en el HTML");
        document.body.style.opacity = '1'; // Mostrar igual por seguridad
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


    // Función para renderizar el contenido de una página específica (Video, Texto, etc.)
    function renderPage(index) {
        // LOG: Muestra si la función se detiene por datos inválidos.
        if (!courseData || !courseData.pages || index < 0 || index >= courseData.pages.length) {
            console.warn(`DEBUG-RENDER: renderPage terminó temprano. Índice: ${index}, Páginas: ${courseData?.pages?.length || 'No definido'}`);
            return;
        }

        currentPageIndex = index;
        const page = courseData.pages[currentPageIndex];
        pageContentEl.innerHTML = ''; 

        // LOG: Loguea el tipo de contenido y el ID que se va a inyectar
        console.log(`DEBUG-RENDER: Renderizando página ${index + 1} (ID: ${page.id}) de tipo: ${page.type}`); 

        // 1. Renderizar contenido según el tipo de página
        switch (page.type) {
            case 'video':
                let videoUrl = page.payload.url;

                // SOLUCIÓN: Si es la URL de prueba o una URL no segura, usar un video de ejemplo
                if (videoUrl.includes('cdn.com/intro.mp4')) {
                    videoUrl = 'https://www.youtube.com/embed/M7lc1UVf-VE'; // Video de ejemplo seguro (YouTube)
                    console.warn(`⚠️ DEBUG-RENDER: URL de video de prueba detectada. Usando URL de YouTube segura: ${videoUrl}`);
                }
                
                // Se utiliza tanto iframe (para embeds como YouTube/Vimeo) como <video> (para archivos mp4 directos)
                const videoHtml = videoUrl.includes('youtube.com') || videoUrl.includes('vimeo.com')
                    ? `<iframe width="100%" height="500" src="${videoUrl}" title="Embedded Course Video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
                    : `<video controls width="100%" height="500" src="${videoUrl}"><p>Tu navegador no soporta videos HTML5.</p></video>`;
                
                pageContentEl.innerHTML = `<div class="page-video">${videoHtml}</div>`;
                // LOG: Muestra la URL de la fuente que se intenta cargar
                console.log(`DEBUG-RENDER: URL de Video: ${videoUrl}`);
                break;
            
            case 'text':
                // Se asume que el payload contiene el HTML del texto
                pageContentEl.innerHTML = `<div class="page-text">${page.payload.html}</div>`;
                // LOG: Muestra una parte del HTML cargado
                console.log(`DEBUG-RENDER: Contenido de Texto cargado: ${page.payload.html.substring(0, 50)}...`);
                break;
                
            default:
                pageContentEl.innerHTML = `<p>Tipo de contenido no soportado: <strong>${page.type}</strong></p>`;
        }

        // 2. Actualizar estado de los botones y barra lateral
        prevPageBtn.disabled = currentPageIndex === 0;
        nextPageBtn.disabled = currentPageIndex === courseData.pages.length - 1;
        footerMessageEl.textContent = `Página ${currentPageIndex + 1} de ${courseData.pages.length}`;

        document.querySelectorAll('.page-btn').forEach((btn, idx) => {
            btn.classList.toggle('active', idx === index);
        });
    }


    // Función que se llama después de cargar el JSON del curso
function loadCourse(title, contentJson) {
        courseData = contentJson;
        courseTitleEl.textContent = title;
        
        if (!courseData.pages || courseData.pages.length === 0) {
            sidebarListEl.innerHTML = "<p>Sin contenido.</p>";
            return;
        }
        // 1. Renderizar la barra lateral (índice de páginas)
        sidebarListEl.innerHTML = courseData.pages.map((page, index) => {
                    const titleText = page.title || `Página ${index + 1}`; 
                    const icon = page.type === 'video' ? 'fa-video' : 'fa-file-alt';
                    return `<button class="page-btn" onclick="renderPage(${index})"><i class="fas ${icon}"></i> <span>${titleText}</span></button>`;
                }).join('');
        
        // 2. Renderizar la primera página
        window.renderPage = renderPage;
        renderPage(0);
    }


    // --- Inicialización de Eventos de Navegación ---
    prevPageBtn.addEventListener('click', () => {
        if (currentPageIndex > 0) {
            renderPage(currentPageIndex - 1);
        }
    });

    nextPageBtn.addEventListener('click', () => {
        if (currentPageIndex < courseData.pages.length - 1) {
            renderPage(currentPageIndex + 1);
        }
    });


    // ═══════════════════════════════════════════════════════════
    // BLOQUE DE CARGA DEL CURSO
    // ═══════════════════════════════════════════════════════════

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
        
        // 3. Cargar estilos del tenant desde JSON (igual que index.js)
        console.log('📥 Cargando tenant desde tenants.json...');
        const config = await window.tenantManager.loadFromJson();
        console.log('📦 Configuración cargada:', config);
        console.log('🎨 Colores aplicados:', config.colors);
        window.tenantManager.applyStyles();
        
        // 4. Renderizar el curso y mostrar el cuerpo
        loadCourse(fetchedCourse.title, fetchedCourse.content_json);
        console.log(`✅ Curso '${fetchedCourse.title}' cargado con éxito.`);
        document.body.style.opacity = '1';
    }

} catch (e) {
    console.error('Error crítico:', e);
}
}

document.addEventListener('DOMContentLoaded', initCourse);