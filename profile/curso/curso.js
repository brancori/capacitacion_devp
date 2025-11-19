// Función de inicialización principal
async function initCourse() {
     console.log('🚀 === INICIANDO CURSO ===');
    console.log('🔍 Tenant Manager disponible?', !!window.tenantManager);
    const params = new URLSearchParams(location.search);
    const courseId = params.get("id");

    let courseData = null; // Almacena el JSON del curso
    let currentPageIndex = 0; // Controla la posición actual

    // Referencias a los elementos del DOM
    const pageContentEl = document.getElementById("pageContent");
    const sidebarListEl = document.getElementById("sidebarList");
    console.log("DEBUG DOM pageContent:", pageContentEl);
    console.log("DEBUG DOM sidebarList:", sidebarListEl);
    console.log("DEBUG DOM parent:", pageContentEl?.parentElement);
    console.log("DEBUG DOM size:", pageContentEl?.offsetWidth, pageContentEl?.offsetHeight);
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

        // LOG: Muestra el número de páginas cargadas.
        const pageCount = courseData.pages?.length || 0;
        console.log(`DEBUG-LOAD: Curso '${title}' tiene ${pageCount} páginas de contenido.`);

        // MANEJO DE CURSO VACÍO: Si no hay páginas, muestra un mensaje y detiene el renderizado.
        if (pageCount === 0) {
            sidebarListEl.innerHTML = "<p class='text-secondary'>El administrador no ha añadido páginas a este curso.</p>";
            pageContentEl.innerHTML = "<h2 style='color: var(--warning);'>¡Contenido No Disponible!</h2><p>Por favor, contacta a tu administrador para que agregue contenido a este curso.</p>";
            prevPageBtn.disabled = true;
            nextPageBtn.disabled = true;
            footerMessageEl.textContent = "Página 0 de 0";
            return; 
        }

        // 1. Renderizar la barra lateral (índice de páginas)
        sidebarListEl.innerHTML = courseData.pages.map((page, index) => {
            const titleText = page.title || `Página ${index + 1}`; 
            const icon = page.type === 'video' ? 'fa-video' : 'fa-file-alt';
            
            return `<button class="page-btn" onclick="renderPage(${index})">
                <i class="fas ${icon}"></i> 
                <span>${titleText}</span>
            </button>`;
        }).join('');
        
        // 2. Renderizar la primera página
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
    } else {
        try {
            // 1. obtener tenant y rol del usuario
            const { data: userData, error: authError } = await supabase.auth.getUser();
            if (authError || !userData?.user) {
                pageContentEl.innerHTML = "<p>Error de autenticación. Por favor, vuelve a iniciar sesión.</p>";
                return;
            }
            const myTenantId = userData.user.user_metadata.tenant_id;
            const myRole = userData.user.user_metadata.role;
            
            // 2. cargar curso y su tenant_id
            let query = supabase
                .from("articles") 
                .select("title, content_json, tenant_id")
                .eq("id", courseId);
            
            // APLICAR FILTRO CONDICIONAL: Solo si NO es master Y si el tenant_id existe.
            if (myRole !== "master" && myTenantId) {
                query = query.eq("tenant_id", myTenantId);
            }
            
            const { data: courseData, error: courseError } = await query.single();
            
            if (courseError) {
                console.error("❌ Error al obtener el curso:", courseError.message, courseError.details);
                pageContentEl.innerHTML =
                    `<p>Error de carga: No se pudo verificar el acceso al curso (Código: ${courseError.code}).</p>`;
            } else if (!courseData) {
                console.warn(`⚠️ Curso no encontrado o acceso denegado para ID: ${courseId}`);
                pageContentEl.innerHTML =
                    "<p>No tienes acceso a este curso o no existe en tu inventario.</p>";
            } else {
                
                // 3. Obtener metadatos del tenant (incluyendo colores)
            const tenantId = courseData.tenant_id || myTenantId;

            console.log('🔍 DEBUG Tenant ID detectado:', tenantId);
            console.log('🔍 DEBUG myTenantId:', myTenantId);

            if (tenantId) {
                console.log('📥 Cargando tenant desde base de datos...');
                const config = await window.tenantManager.loadFromDatabase(tenantId);
                console.log('📦 Configuración cargada:', config);
                window.tenantManager.applyStyles();
                console.log('✅ Estilos aplicados desde BD');
            } else {
                console.log('📥 Cargando tenant desde JSON (fallback)...');
                const config = await window.tenantManager.loadFromJson();
                console.log('📦 Configuración cargada:', config);
                window.tenantManager.applyStyles();
                console.log('✅ Estilos aplicados desde JSON');
            }
                
                // 5. Renderizar el curso y mostrar el cuerpo
                loadCourse(courseData.title, courseData.content_json);
                console.log(`✅ Curso '${courseData.title}' cargado con éxito.`);
                document.body.style.opacity = '1';
            }
        } catch (e) {
            // Log crítico mejorado
            console.error('❌ Error crítico en el bloque de carga:', e.message || e);
            pageContentEl.innerHTML = "<p>Error crítico al cargar la plataforma. Intenta recargar.</p>";
        }
    }
}

// Llamar a la función de inicialización cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initCourse);