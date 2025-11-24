(function() {
        try {
          // 1. Obtener el slug actual SÍNCRONAMENTE
          const host = location.hostname || 'localhost';
          const parts = host.split('.');
          const currentSlug = parts.length > 2 && parts[0] !== 'www' ? parts[0] : 'default';

          // 2. Intentar cargar el tema cacheado
          const cachedTheme = localStorage.getItem('tenantTheme');
          const cachedSlug = localStorage.getItem('tenantSlug');

          // 3. Validar y aplicar el tema
          if (cachedTheme && cachedSlug === currentSlug) {
            const theme = JSON.parse(cachedTheme);
            const root = document.documentElement;
            
            // Aplicar estilos, asumiendo que el caché guarda primaryColor y secondaryColor
            if (theme.primaryColor) root.style.setProperty('--primaryColor', theme.primaryColor);
            if (theme.secondaryColor) root.style.setProperty('--secondaryColor', theme.secondaryColor);
            
            // Mostrar la página inmediatamente ya que el tema es correcto
            document.body.style.opacity = 1;
          }
        } catch (e) {
          console.error('Error aplicando tema cacheado', e);
          // Si hay error, la página se quedará oculta y la lógica principal la mostrará
        }
      })();

// ═══════════════════════════════════════════════════════════
// BLOQUE ÚNICO DE INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════
(async () => {

    const supabase = window.supabase;
  // --- Lógica del Tenant (Tu código original) ---
  const setStyle = (prop, value) => {
    if (value) document.documentElement.style.setProperty(prop, value);
  };

  const detectTenant = () => {
    const host = location.hostname || 'localhost';

    if (host === 'localhost') {
      return 'demo';
    }
    if (host === '127.0.0.1') {
      return 'default';
    }
    const parts = host.split('.');
    
    if (parts.length > 2 && parts[0] !== 'www') {
      return parts[0];
    }
    
    return 'default';
  };

// Validar sesión al cargar el perfil
(function validateProfileAccess() {
  const detectTenant = () => {
    const host = location.hostname || 'localhost';
    if (host === 'localhost' || host === '127.0.0.1') return 'demo';
    const parts = host.split('.');
    return (parts.length > 2 && parts[0] !== 'www') ? parts[0] : 'default';
  };
  
  const currentTenant = detectTenant();
  const storedTenant = localStorage.getItem('current_tenant');
  
  if (storedTenant && storedTenant !== currentTenant) {
    console.error('❌ Acceso denegado: Tenant no coincide');
    alert('Sesión inválida. Serás redirigido al login.');
    window.location.href = '../index.html';
    return;
  }
})();

  async function loadTenantConfig() {
    const tenantId = detectTenant();
    console.log(`🔍 Detectando tenant: ${tenantId}`);
    try {
      const response = await fetch('../tenants/tenants.json', {
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error('No se pudo cargar tenants.json');
      const data = await response.json();
      return data[tenantId] || data['default'] || {};
    } catch (error) {
      console.warn('⚠️ Error al cargar configuración del tenant:', error);
      return {};
    }
  }

function applyConfiguration(config) {
    if (!config) return;
    
    // Colores
    setStyle('--primaryColor', config.primaryColor);
    setStyle('--secondaryColor', config.secondaryColor);

    // Nombre de la compañía
    const companyNameEl = document.getElementById('companyName');
    if (companyNameEl && config.companyName) {
      const icon = companyNameEl.querySelector('i');
      companyNameEl.innerHTML = '';
      if (icon) companyNameEl.appendChild(icon);
      companyNameEl.appendChild(document.createTextNode(` ${config.companyName}`));
    }
    console.log(`🎨 Tenant aplicado: ${config.companyName || 'sin nombre definido'}`);

    // --- CAMBIO: Guardar la configuración en localStorage ---
    try {
        const tenantSlug = detectTenant();
        localStorage.setItem('tenantTheme', JSON.stringify(config));
        localStorage.setItem('tenantSlug', tenantSlug);
        console.log('💾 Configuración de tenant guardada en caché.');
    } catch (e) {
        console.warn('Advertencia: No se pudo guardar el tema en localStorage.', e);
    }
  }

  // --- Lógica de Permisos (NUEVA) ---
  const manageUsersBtn = document.getElementById('manageUsersBtn');

  /**
   * Muestra u oculta elementos basados en el rol del usuario.
   */
  function updateProfileView(profile) {
    // Actualizar el nombre
    const profileNameEl = document.getElementById('profileName');
    if (profileNameEl) {
      // *** CORREGIDO ***
      profileNameEl.textContent = profile.full_name || 'Usuario';
    }

    // Lógica de permisos existente
    // *** CORREGIDO (para incluir 'supervisor') ***
    const allowedRoles = ['master', 'admin', 'supervisor'];
    if (allowedRoles.includes(profile.role)) {
      if (manageUsersBtn) manageUsersBtn.style.display = 'flex';
    } else {
      if (manageUsersBtn) manageUsersBtn.style.display = 'none';
    }
  }
function getDueDateStatus(dueDate) {
  if (!dueDate) return { text: '', urgent: false };
  
  const ONE_DAY = 1000 * 60 * 60 * 24;
  const now = new Date();
  const due = new Date(dueDate);
  
  // Ignorar la hora, comparar solo fechas
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  
  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / ONE_DAY);

  if (diffDays < 0) return { text: 'Vencido', urgent: true };
  if (diffDays === 0) return { text: 'Vence hoy', urgent: true };
  if (diffDays === 1) return { text: 'Vence mañana', urgent: true };
  if (diffDays <= 7) return { text: `Vence en ${diffDays} días`, urgent: true };
  
  return { text: `Vence en ${diffDays} días`, urgent: false };
}
  /**
   * Carga el perfil del usuario desde Supabase y actualiza la vista.
   */
async function loadUserProfile() {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    // DEBUG: Pausar y mostrar info
    console.log('🔍 DEBUG user:', user);
    console.log('🔍 DEBUG authError:', authError);
    
    if (authError || !user) {
      console.error('No hay sesión activa');
      window.location.href = '../index.html'; // COMENTADO TEMPORALMENTE
      return;
    }

    // ✅ CAMBIO AQUÍ
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();

    if (profileError) throw profileError;

    if (profile) {
      updateProfileView(profile);
    } else {
      console.warn('Usuario autenticado pero sin perfil.');
      updateProfileView({ role: 'user', full_name: 'Usuario' });
    }
  } catch (error) {
    console.error('Error al cargar el perfil del usuario:', error.message);
    updateProfileView({ role: 'user', full_name: 'Usuario' });
  }
}

  // --- Lógica de UI (Modales, Tabs, Filtros) ---
  function initUI() {
    // ... (Todo tu código de UI original va aquí, sin cambios) ...
    // --- Modal general ---
    const modal = document.getElementById('modal');
    const modalIcon = document.getElementById('modalIcon');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalClose = document.getElementById('modalClose');

    function showModal(title, message, type = 'success') {
      modalTitle.textContent = title;
      modalMessage.textContent = message;
      modalIcon.className = `modal-icon ${type}`;
      modalIcon.innerHTML = type === 'success'
        ? '<i class="fas fa-check-circle"></i>'
        : '<i class="fas fa-info-circle"></i>';
      modal.classList.add('show');
    }
    function closeModal() {
      modal.classList.remove('show');
    }
    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // --- Tabs ---
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(tc => tc.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
      });
    });

    // --- Filtros ---
    const filterBtns = document.querySelectorAll('.filter-btn');
    const courseCards = document.querySelectorAll('.course-card[data-status]');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.filter;
        courseCards.forEach(card => {
          card.style.display = (filter === 'all' || card.dataset.status === filter) ? 'flex' : 'none';
        });
      });
    });

    // --- Buscador ---
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      document.querySelectorAll('.course-card').forEach(card => {
        const title = card.querySelector('h3').textContent.toLowerCase();
        card.style.display = title.includes(searchTerm) ? 'flex' : 'none';
      });;
    });



    // --- Botón de tema ---
    const themeToggle = document.getElementById('themeToggle');
    themeToggle?.addEventListener('click', () => {
      showModal('Cambio de Tema', 'El modo oscuro estará disponible próximamente', 'info');
    });

    // --- Animación de barras ---
    const progressBars = document.querySelectorAll('.progress-bar-fill');
    progressBars.forEach(bar => {
      const width = bar.style.width;
      bar.style.width = '0%';
      setTimeout(() => {
        bar.style.width = width;
      }, 100);
    });
  }

async function loadRealDashboardData(userId) {
    const supabase = window.supabase;

    // 1. CARGA DE DATOS (Perfil, Asignaciones, Mis Insignias, Catálogo Completo, Logs)
    const [profileRes, assignmentsRes, myBadgesRes, allBadgesRes, logsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('user_course_assignments').select('*, articles:course_id(title, duration_text)').eq('user_id', userId),
        supabase.from('user_badges').select('badge_id'), 
        supabase.from('badges').select('*'),             
        supabase.from('activity_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5)
    ]);

    const profile = profileRes.data;
    const assignments = assignmentsRes.data || [];
    const myBadgesIds = new Set((myBadgesRes.data || []).map(b => b.badge_id)); 
    const allBadges = allBadgesRes.data || [];
    const logs = logsRes.data || [];

    // --- A. Renderizar Perfil ---
    if (profile) {
        document.getElementById('profileName').textContent = profile.full_name || 'Usuario';
        const initials = (profile.full_name || 'U').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        const avatarEl = document.querySelector('.avatar');
        if(avatarEl) avatarEl.innerHTML = `<span style="font-size: 2.5rem; font-weight: bold;">${initials}</span>`;
        
        const shortId = profile.id.split('-')[0].toUpperCase(); 
        const roleEl = document.querySelector('.profile-card .role');
        if(roleEl) roleEl.textContent = `${profile.role === 'master' ? 'Administrador' : 'Colaborador'} | ID: ${shortId}`;
    }

    // --- B. Estadísticas y Donut Chart ---
    const totalCursos = assignments.length;
    // Consideramos completado si status es 'completed' O si el progreso es 100
    const completados = assignments.filter(a => a.status === 'completed' || Number(a.progress) === 100).length;
    const pendientes = assignments.filter(a => a.status !== 'completed' && Number(a.progress) < 100).length;
    
    // Calcular porcentaje
    const percentage = totalCursos > 0 ? Math.round((completados / totalCursos) * 100) : 0;

    // --- FIX DEL DONUT ---
const donutFg = document.querySelector('.progress-donut-fg');
    const donutText = document.querySelector('.progress-text');
    const progressMsg = document.querySelector('.profile-card p[style*="primary"]');

    if (donutFg) {
        // 1. Definir radio y circunferencia exacta (r=69 según tu HTML)
        const radius = 69;
        const circumference = 2 * Math.PI * radius; // Aprox 433.54

        // 2. Calcular el offset
        // Si porcentaje es 0, el offset es igual a la circunferencia (círculo vacío)
        // Si porcentaje es 100, el offset es 0 (círculo lleno)
        const offset = circumference - (percentage / 100) * circumference;

        // 3. APLICAR ESTILOS FORZOSOS
        // Es CRÍTICO establecer el dasharray aquí para asegurar que coincida con la matemática
        donutFg.style.strokeDasharray = `${circumference} ${circumference}`;
        
        // Desactivamos cualquier animación o transición CSS que esté estorbando
        donutFg.style.transition = 'none'; 
        donutFg.style.animation = 'none'; 

        // Aplicamos el valor calculado
        donutFg.style.strokeDashoffset = offset;

        // Debug para ver en consola si está calculando bien
        console.log(` Donut Debug: ${percentage}% | Offset: ${offset}`);
    }

    if (donutText) donutText.textContent = `${percentage}%`;
    if (progressMsg) progressMsg.textContent = `${completados} de ${totalCursos} cursos completados`;

    // Actualizar Tarjetas de Estadísticas (Grid)
    const statCards = document.querySelectorAll('.stat-card h3');
    if(statCards.length >= 3) {
        if(statCards[0]) statCards[0].textContent = totalCursos;
        if(statCards[1]) statCards[1].textContent = completados;
        if(statCards[2]) statCards[2].textContent = pendientes;
        // La tarjeta de "Urgente" la calculamos abajo
    }

    // --- C. RENDERIZADO DE INSIGNIAS (Lógica de Álbum) ---
    const badgesContainer = document.querySelector('.badges-grid');
    if (badgesContainer) {
        if (allBadges.length === 0) {
            badgesContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; font-size: 0.8rem;">No hay insignias disponibles.</p>';
        } else {
            // Recorremos el CATÁLOGO COMPLETO (allBadges) para mostrarlas todas
            badgesContainer.innerHTML = allBadges.map(badge => {
                // Checamos si el usuario tiene esta estampita
                const isEarned = myBadgesIds.has(badge.id);
                
                // Si la tiene = color ('earned'). Si no = gris ('badge' normal del CSS)
                const cssClass = isEarned ? 'badge earned' : 'badge';
                const tooltip = isEarned ? '¡Insignia Obtenida!' : 'Bloqueado: Completa los requisitos';

                return `
                <div class="${cssClass}" title="${tooltip}">
                    <i class="${badge.icon_class || 'fas fa-medal'}"></i>
                    <span>${badge.name}</span>
                </div>
                `;
            }).join('');
        }
    }

    // --- D. Calendario (Urgencias) ---
    const now = new Date();
    const urgentThreshold = new Date();
    urgentThreshold.setDate(now.getDate() + 7);

    // Filtramos urgentes para el contador de la tarjeta roja
    const urgentesCount = assignments.filter(a => {
        if (!a.due_date || a.status === 'completed') return false;
        const due = new Date(a.due_date);
        return due <= urgentThreshold && due >= now;
    }).length;
    
    if(statCards[3]) statCards[3].textContent = urgentesCount;

    // Renderizar lista del calendario
    const calendarContainer = document.querySelector('.calendar-card');
    const upcomingAssignments = assignments
        .filter(a => a.due_date && a.status !== 'completed')
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
        .slice(0, 3);

    if (calendarContainer) {
        const header = '<h3><i class="far fa-calendar-alt"></i> Próximos Vencimientos</h3>';
        let content = '';

        if (upcomingAssignments.length === 0) {
            content = '<p style="text-align: center; color: var(--text-secondary); padding: 1rem; font-size: 0.9rem;">¡Estás al día!</p>';
        } else {
            content = upcomingAssignments.map(a => {
                const date = new Date(a.due_date);
                const day = date.getDate();
                const month = date.toLocaleString('es-ES', { month: 'short' }).toUpperCase();
                
                const diffTime = date - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const isUrgent = diffDays <= 5;

                return `
                <div class="calendar-event ${isUrgent ? 'urgent' : ''}">
                    <div class="event-date">
                        <div class="day">${day}</div>
                        <div class="month">${month}</div>
                    </div>
                    <div class="event-details">
                        <h4>${a.articles.title}</h4>
                        <p>${diffDays < 0 ? 'Vencido' : diffDays === 0 ? 'Vence hoy' : `Vence en ${diffDays} días`}</p>
                    </div>
                </div>`;
            }).join('');
        }
        calendarContainer.innerHTML = header + content;
    }

    // --- E. Timeline ---
    const timelineContainer = document.querySelector('.timeline');
    if (timelineContainer) {
        if (logs.length === 0) {
            timelineContainer.innerHTML = '<p style="padding: 1rem; color: var(--text-secondary);">Sin actividad reciente.</p>';
        } else {
            timelineContainer.innerHTML = logs.map(log => {
                const date = new Date(log.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
                let icon = 'fa-info-circle';
                let color = 'var(--primaryColor)';
                
                if (log.action_type === 'course_completed') { icon = 'fa-check-circle'; color = 'var(--success)'; }
                if (log.action_type === 'enrollment') { icon = 'fa-play-circle'; color = 'var(--warning)'; }
                
                return `
                <div class="timeline-item">
                    <div class="timeline-content">
                        <div class="timeline-date">${date}</div>
                        <h3 style="color: ${color}; margin-bottom: 0.5rem; font-size: 1rem;">
                            <i class="fas ${icon}"></i> ${log.action_type === 'course_completed' ? 'Curso Completado' : 'Actividad'}
                        </h3>
                        <p style="font-size: 0.9rem;"><strong>${log.description}</strong></p>
                    </div>
                </div>`;
            }).join('');
        }
    }
}

  // ═══════════════════════════════════════════════════════════

  // FUNCIÓN PRINCIPAL DE ARRANQUE
  // ═══════════════════════════════════════════════════════════
async function mainInit() {
  // AGREGAR ESTO AL INICIO:
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  
  if (urlToken) {
    console.log('🔑 Token recibido por URL');
    await supabase.auth.setSession({
      access_token: urlToken,
      refresh_token: 'dummy'
    });
    window.history.replaceState({}, '', window.location.pathname);
  }
    // 1. Carga la config del tenant
    const config = await loadTenantConfig();
    applyConfiguration(config);
    console.log('✅ Tenant listo');

    document.body.style.opacity = 1;
    // 2. Carga el perfil de usuario (para permisos)
    await loadUserProfile();
    console.log('✅ Perfil de usuario cargado');

// 🔐 Obtener usuario autenticado (LO QUE TE FALTABA)
const { data: authData, error: authError } = await supabase.auth.getUser();
if (authError || !authData?.user) {
  console.error("❌ No hay sesión activa", authError);
  return;
}
const userId = authData.user.id;
await loadRealDashboardData(userId);

// Obtener profile (tenant + role)
const { data: profileRow, error: profileRowError } = await supabase
  .from("profiles")
  .select("tenant_id, role")
  .eq("id", userId)
  .single();

if (profileRowError) {
  console.error("❌ Error al leer profileRow:", profileRowError);
  return;
}

const myTenant = profileRow?.tenant_id;
const myRole   = profileRow?.role;

console.log("🧭 Tenant usado en consulta:", myTenant, "Role:", myRole);
console.log("DEBUG authData:", authData);
console.log("DEBUG profileRow:", profileRow);
console.log("DEBUG myTenant, myRole:", myTenant, myRole);


const { data: assignments, error: coursesError } = await supabase
        .from("user_course_assignments")
        .select(`
            progress,
            due_date,
            status, 
            articles (
            id,
            title,
            thumbnail_url,
            status,
            instructor_name,
            duration_text
            )
        `)
        .eq('user_id', userId); // <--- FILTRO CRÍTICO

if (coursesError) {
        console.error("Error al cargar cursos:", coursesError.message);
        return;
    }

    // 2. PROCESAR Y SEPARAR LOS CURSOS (VERSIÓN CORREGIDA)
const allCourses = assignments ? assignments.map(a => {
        // Validación: Si no hay datos del artículo, saltamos
        if (!a.articles) return null;

        // Supabase a veces devuelve un array si la relación no es 'single'
        const articleData = Array.isArray(a.articles) ? a.articles[0] : a.articles;
        
        if (!articleData) return null;

        return {
            ...articleData, // Esto extrae id, title, thumbnail_url, etc.
            progress: a.progress,
            due_date: a.due_date,
            assignment_status: a.status
        };
    }).filter(c => c !== null) : []; // Eliminamos los nulos para evitar errores

    // Logs de depuración para verificar
    console.log("Cursos procesados:", allCourses);

    const pendingCourses = allCourses.filter(c => c.progress < 100 && c.assignment_status !== 'completed');
    const completedCourses = allCourses.filter(c => c.progress === 100 || c.assignment_status === 'completed');

    console.log(`📦 Cursos: ${pendingCourses.length} pendientes, ${completedCourses.length} completados`);

    // 3. FUNCIÓN DE RENDERIZADO (Reutilizable)
    const renderCourses = (coursesList, containerId, emptyMsg) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (coursesList.length === 0) {
            container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-secondary);">${emptyMsg}</p>`;
            return;
        }

        container.innerHTML = coursesList.map(c => {
            const dueDateInfo = getDueDateStatus(c.due_date);
            const progress = c.progress || 0;
            const isUrgent = dueDateInfo.urgent && progress < 100;

            let iconClass = 'pending';
            let iconFA = 'fa-clock';
            let btnText = progress > 0 ? 'Continuar' : 'Iniciar';
            
            if (isUrgent) {
                iconClass = 'urgent';
                iconFA = 'fa-exclamation-triangle';
            } else if (progress === 100) {
                iconClass = 'completed';
                iconFA = 'fa-check-circle';
                btnText = 'Ver Certificado';
            }

            return `
            <div class="course-card" data-status="${iconClass}">
                <div class="course-icon-lg ${iconClass}">
                    <i class="fas ${iconFA}"></i>
                </div>
                <div class="course-info">
                    <h3>${c.title}</h3>
                    ${dueDateInfo.text && progress < 100 ? `
                    <div class="meta-item" style="font-size: 0.9rem; color: ${isUrgent ? 'var(--danger)' : 'var(--text-secondary)'}; font-weight: ${isUrgent ? '500' : 'normal'}; margin-bottom: 0.5rem;">
                        <i class="fas fa-calendar-alt"></i>
                        <span>${dueDateInfo.text}</span>
                    </div>` : ''}
                    
                    <div class="course-meta" style="margin-bottom: 0.75rem;">
                        <div class="meta-item"><i class="fas fa-user-tie"></i> <span>${c.instructor_name || 'Trox Academy'}</span></div>
                        <div class="meta-item"><i class="fas fa-clock"></i> <span>${c.duration_text || 'Self-paced'}</span></div>
                    </div>

                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${progress}%;"></div>
                    </div>
                    <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem;">Progreso: ${progress}%</p>
                </div>
                <div class="course-actions">
                    <a href="./curso/curso.html?id=${c.id}" class="btn btn-primary" style="width: 100%;">
                        ${btnText}
                    </a>
                </div>
            </div>`;
        }).join("");
    };

    // 4. RENDERIZAR EN LOS CONTENEDORES CORRECTOS
    renderCourses(pendingCourses, 'assignedCoursesContainer', '¡Estás al día! No tienes cursos pendientes.');
    renderCourses(completedCourses, 'completedCoursesContainer', 'Aún no has completado ningún curso.');

    console.log('✅ Cursos renderizados correctamente por tabs');

    initUI();
}

  // --- Disparador de Carga ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mainInit);
  } else {
    mainInit();
  }

})();
