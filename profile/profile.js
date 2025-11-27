window.safeStorage = window.safeStorage || {
  set: (k, v) => { try { localStorage.setItem(k, v); } catch(e){} },
  get: (k) => { try { return localStorage.getItem(k); } catch(e){ return null; } },
  remove: (k) => { try { localStorage.removeItem(k); } catch(e){} }
};

(async function earlyRoleCheck() {
    if (!window.supabase?.auth) {
        setTimeout(earlyRoleCheck, 100);
        return;
    }

    try {
        const { data: { session } } = await window.supabase.auth.getSession();
        
        if (!session) {
            console.warn('⚠️ Sin sesión activa');
            document.body.classList.add('loaded');
            return;
        }

        let finalRole = window.safeStorage.get('role');
        
        if (!finalRole || finalRole === 'authenticated') {
            const { data: { user } } = await window.supabase.auth.getUser();
            if (user) {
                const { data: profile } = await window.supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                if (profile?.role) finalRole = profile.role;
                else if (user.app_metadata?.role) finalRole = user.app_metadata.role;

                if (finalRole) window.safeStorage.set('role', finalRole);
            }
        }
        document.body.classList.add('loaded');
    } catch (error) {
        console.error('❌ Error validación:', error);
        document.body.classList.add('loaded'); 
    }
})();

(function() {
  try {
    const host = location.hostname || 'localhost';
    const parts = host.split('.');
    const currentSlug = parts.length > 2 && parts[0] !== 'www' ? parts[0] : 'default';
    const cachedTheme = localStorage.getItem('tenantTheme');
    const cachedSlug = localStorage.getItem('tenantSlug');

    if (cachedTheme && cachedSlug === currentSlug) {
      const theme = JSON.parse(cachedTheme);
      const root = document.documentElement;
      if (theme.primaryColor) root.style.setProperty('--primaryColor', theme.primaryColor);
      if (theme.secondaryColor) root.style.setProperty('--secondaryColor', theme.secondaryColor);
    }
  } catch (e) { console.error(e); }
})();

// ═══════════════════════════════════════════════════════════
// BLOQUE ÚNICO DE INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════
(async () => {
  const supabase = window.supabase;

  const loadTenantConfig = async () => {
    try {
        const response = await fetch('../tenants/tenants.json');
        const data = await response.json();
        const host = location.hostname !== 'localhost' ? location.hostname.split('.')[0] : 'demo';
        return data[host] || data['default'] || {};
    } catch (e) { return {}; }
  };

  const applyConfiguration = (config) => {
    if (!config) return;
    const root = document.documentElement;
    if (config.primaryColor) root.style.setProperty('--primaryColor', config.primaryColor);
    if (config.secondaryColor) root.style.setProperty('--secondaryColor', config.secondaryColor);
    const companyNameEl = document.getElementById('companyName');
    if (companyNameEl && config.companyName) {
         companyNameEl.innerHTML = `<i class="fas fa-graduation-cap"></i> ${config.companyName}`;
    }
  };

  // ═══════════════════════════════════════════════════════════
  // LÓGICA DE DATOS DASHBOARD
  // ═══════════════════════════════════════════════════════════
  async function loadRealDashboardData(userId, supabase) {
    const cachedRole = window.safeStorage.get('role');
    const cachedName = window.safeStorage.get('full_name');

    // 1. Obtener asignaciones con score y fecha de completado
    const [assignmentsRes, myBadgesRes, allBadgesRes] = await Promise.all([
      supabase.from('user_course_assignments')
        .select('*, articles:course_id(title, duration_text)')
        .eq('user_id', userId),
      supabase.from('user_badges')
        .select('badge_id')
        .eq('user_id', userId), 
      supabase.from('badges').select('*')
    ]);

    const assignments = assignmentsRes.data || [];
    const myBadgesIds = new Set((myBadgesRes.data || []).map(b => b.badge_id)); 
    const allBadges = allBadgesRes.data || [];

    // Render Perfil Básico
    const profileNameEl = document.getElementById('profileName');
    if (profileNameEl) profileNameEl.textContent = cachedName || 'Usuario';

    const avatarEl = document.querySelector('.avatar');
    if (avatarEl && cachedName) {
      const initials = cachedName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
      avatarEl.innerHTML = `<span style="font-size: 2.5rem; font-weight: bold;">${initials}</span>`;
    }

    // Estadísticas
    const totalCursos = assignments.length;
    // Criterio de completado: status 'completed' o score >= 8 (aprobado)
    const completados = assignments.filter(a => 
      a.status === 'completed' || Number(a.progress) === 100 || (a.score && Number(a.score) >= 8)
    );
    const numCompletados = completados.length;
    const pendientes = totalCursos - numCompletados;
    const percentage = totalCursos > 0 ? Math.round((numCompletados / totalCursos) * 100) : 0;

    // Actualizar Gráfica Donut
    const donutFg = document.querySelector('.progress-donut-fg');
    const donutText = document.querySelector('.progress-text');
    const progressMsg = document.querySelector('.profile-card p[style*="primary"]');

    if (donutFg) {
      const radius = 69;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (percentage / 100) * circumference;
      donutFg.style.strokeDasharray = `${circumference} ${circumference}`;
      donutFg.style.strokeDashoffset = offset;
    }
    if (donutText) donutText.textContent = `${percentage}%`;
    if (progressMsg) progressMsg.textContent = `${numCompletados} de ${totalCursos} cursos completados`;

    // Tarjetas Superiores
    const statCards = document.querySelectorAll('.stat-card h3');
    if (statCards[0]) statCards[0].textContent = totalCursos;
    if (statCards[1]) statCards[1].textContent = numCompletados;
    if (statCards[2]) statCards[2].textContent = pendientes;

    // Badges
    const badgesContainer = document.querySelector('.badges-grid');
    if (badgesContainer) {
      badgesContainer.innerHTML = allBadges.length === 0 
        ? '<p style="grid-column: 1/-1; text-align: center;">No hay insignias.</p>'
        : allBadges.map(badge => {
            const isEarned = myBadgesIds.has(badge.id);
            return `<div class="${isEarned ? 'badge earned' : 'badge'}"><i class="${badge.icon_class || 'fas fa-medal'}"></i><span>${badge.name}</span></div>`;
          }).join('');
    }

    // Historial / Timeline
    renderHistoryTimeline(completados);
  }

  // ═══════════════════════════════════════════════════════════
  // RENDERIZADO DE HISTORIAL
  // ═══════════════════════════════════════════════════════════
  function renderHistoryTimeline(completedAssignments) {
    const timelineContainer = document.querySelector('.timeline');
    if (!timelineContainer) return;

    if (completedAssignments.length === 0) {
        timelineContainer.innerHTML = '<p style="color:#888;">No hay historial de cursos completados.</p>';
        return;
    }

    const sorted = completedAssignments.sort((a, b) => {
        const dateA = new Date(a.completed_at || a.updated_at || 0);
        const dateB = new Date(b.completed_at || b.updated_at || 0);
        return dateB - dateA; 
    });

    timelineContainer.innerHTML = sorted.map(item => {
        const dateObj = new Date(item.completed_at || item.updated_at || Date.now());
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        const formattedDate = `${day}/${month}/${year}`;
        
        const title = item.articles?.title || 'Curso sin título';
        const score = item.score ? `Nota: ${item.score}` : 'Completado';

        return `
        <div class="timeline-item">
            <div class="timeline-content">
                <div class="timeline-date"><i class="far fa-calendar-check"></i> ${formattedDate}</div>
                <h4 style="margin:0; color:var(--primaryColor);">${title}</h4>
                <p style="margin:0.5rem 0 0 0; font-size:0.9rem;">${score} - Aprobado</p>
            </div>
        </div>`;
    }).join('');
  }

  // ═══════════════════════════════════════════════════════════
  // RENDERIZADO DE CURSOS (PENDIENTES, COMPLETADOS Y CATÁLOGO)
  // ═══════════════════════════════════════════════════════════
  // Se agregó el parámetro isCatalog para manejar la vista del catálogo
function renderCourses(list, containerId, emptyMsg, isCompletedSection = false, isCatalog = false) {
    const el = document.getElementById(containerId);
    if(!el) return;
    
    if(!list.length) { 
        el.innerHTML = `<p style="text-align:center; padding:2rem; color:#888;">${emptyMsg}</p>`; 
        return; 
    }

    el.innerHTML = list.map(c => {
        // ... lógica existente de aprobación ...
        const approved = !isCatalog && (c.status === 'completed' || (c.score !== null && Number(c.score) >= 8));
        const progressVal = c.progress || 0;
        let actionButton = '';

        if (isCatalog) {
            // BOTÓN PARA CATÁLOGO
            actionButton = `
            <button class="btn btn-success" onclick="enrollUser('${c.id}')">
                <i class="fas fa-plus"></i> Inscribirme
            </button>`;
        } else if (isCompletedSection && approved) {
             // ... botón certificado ...
             actionButton = `<a href="../certificados/view.html?assignment_id=${c.assignment_id}" class="btn btn-outline" style="border-color:var(--success); color:var(--success);"><i class="fas fa-certificate"></i> Ver Certificado</a>`;
        } else {
             // ... botón continuar ...
             actionButton = `<a href="../curso/curso.html?id=${c.id}" class="btn btn-primary">${progressVal > 0 ? 'Continuar' : 'Iniciar'}</a>`;
        }

        // Renderizado de tarjeta (ajustado para catálogo que no tiene progreso)
        return `
          <div class="course-card">
            <div class="course-icon-lg ${isCatalog ? 'catalog' : (approved ? 'completed' : 'pending')}">
              <i class="fas ${isCatalog ? 'fa-book-open' : (approved ? 'fa-check-circle' : 'fa-clock')}"></i>
            </div>
            <div class="course-info">
              <h3>${c.title}</h3>
              ${!isCatalog ? `
              <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${approved ? 100 : progressVal}%;"></div>
              </div>
              <p class="meta">
                ${approved ? '¡Curso Aprobado!' : `Progreso: ${progressVal}%`}
                ${c.score ? ` | Calificación: ${c.score}` : ''}
              </p>` 
              : `<p class="meta">${c.duration_text || 'Duración variable'}</p>`}
            </div>
            <div class="course-actions">
               ${actionButton}
            </div>
          </div>
        `;
    }).join('');
}

  // ═══════════════════════════════════════════════════════════
  // FUNCIÓN PRINCIPAL MAIN INIT
  // ═══════════════════════════════════════════════════════════
  async function mainInit() {
    if (!window.supabase?.auth) { setTimeout(mainInit, 100); return; }

    try {
        const { data: { session } } = await window.supabase.auth.getSession();
        if (!session) { window.location.href = '../index.html'; return; }
        
        const user = session.user;
        const meta = user.app_metadata || {};
        const realRole = meta.role || 'authenticated';
        const realName = user.user_metadata?.full_name || 'Usuario';
        
        window.safeStorage.set('role', realRole);
        window.safeStorage.set('full_name', realName);

        const manageBtn = document.getElementById('manageUsersBtn');
        if (manageBtn) {
            const isAdmin = ['master', 'admin', 'supervisor'].includes(realRole);
            manageBtn.style.display = isAdmin ? 'flex' : 'none';
        }

        const config = await loadTenantConfig();
        applyConfiguration(config);

        await loadRealDashboardData(user.id, window.supabase);
        await loadCourses(user.id);
        await loadNotifications(user.id, window.supabase);
        setupNotificationUI(window.supabase);
        
        // Cargar Catálogo (Nueva llamada)
        await loadCatalog(user.id, window.supabase);
        
        initUI();
        document.body.classList.add('loaded');

    } catch (error) {
        console.error('❌ Error fatal:', error);
        document.body.classList.add('loaded');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LOGICA DE CARGA DE DATOS (Cursos y Catálogo)
  // ═══════════════════════════════════════════════════════════
  
  // Nueva función para cargar el catálogo
async function loadCatalog(userId, supabase) {
    try {
        const { data: myAssignments } = await supabase
            .from('user_course_assignments')
            .select('course_id')
            .eq('user_id', userId);
            
        const myCourseIds = new Set((myAssignments || []).map(a => a.course_id));

        // CORRECCIÓN: Usar 'status' en lugar de 'is_active'
        const { data: allArticles, error } = await supabase
            .from('articles')
            .select('id, title, thumbnail_url, duration_text')
            .eq('status', 'published'); 

        if (error) throw error;

        const catalog = (allArticles || []).filter(art => !myCourseIds.has(art.id));

        renderCourses(catalog, 'catalogCoursesContainer', 'No hay nuevos cursos disponibles en el catálogo.', false, true);

    } catch (e) {
        console.error("Error cargando catálogo:", e);
    }
}

  async function loadCourses(userId) {
    try {
        const { data: assignments, error } = await window.supabase
            .from("user_course_assignments")
            .select(`id, progress, due_date, status, score, completed_at, articles (id, title, thumbnail_url, duration_text)`)
            .eq('user_id', userId);

        if (error) throw error;

        const allData = (assignments || []).map(a => {
            const art = Array.isArray(a.articles) ? a.articles[0] : a.articles;
            if (!art) return null;
            return { 
                ...art,
                assignment_id: a.id,
                progress: a.progress || 0, 
                status: a.status,
                score: a.score,
                due_date: a.due_date,
                completed_at: a.completed_at
            };
        }).filter(c => c);

        const pending = allData.filter(c => {
             const isPassed = c.status === 'completed' || (c.score !== null && Number(c.score) >= 8);
             return !isPassed;
        });

        const completed = allData.filter(c => {
             return c.status === 'completed' || (c.score !== null && Number(c.score) >= 8);
        });

        renderCourses(pending, 'assignedCoursesContainer', '¡Estás al día! No tienes cursos pendientes.', false);
        renderCourses(completed, 'completedCoursesContainer', 'Aún no has completado ningún curso.', true);
        
    } catch(e) { 
        console.error("Error cargando cursos:", e); 
    }
  }

  // Nueva función para filtrar en tiempo real
  function initSearchFilter() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    searchInput.addEventListener('keyup', (e) => {
        const term = e.target.value.toLowerCase();
        // Filtra tarjetas de curso, items del historial y recomendaciones
        const items = document.querySelectorAll('.course-card, .timeline-item, .recommendation-card');
        
        items.forEach(item => {
            const text = item.innerText.toLowerCase();
            item.style.display = text.includes(term) ? '' : 'none';
        });
    });
  }

  function initSearchFilter() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    searchInput.addEventListener('keyup', (e) => {
        const term = e.target.value.toLowerCase();
        // Busca en tarjetas de cursos, items de historial y recomendaciones
        const selector = '.course-card, .timeline-item, .recommendation-card';
        const items = document.querySelectorAll(selector);
        
        items.forEach(item => {
            // Si el texto coincide, se muestra (elimina style inline), si no, display: none
            const text = item.innerText.toLowerCase();
            item.style.display = text.includes(term) ? '' : 'none';
        });
    });
}

  function initUI() {
    // Inicializar Tabs
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', e => {
        document.querySelectorAll('.tab, .tab-content').forEach(x => x.classList.remove('active'));
        const tab = e.target.closest('.tab');
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab)?.classList.add('active');
    }));

    // Inicializar Buscador
    initSearchFilter();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mainInit);
  else mainInit();


  async function loadNotifications(userId, supabase) {
    const listContainer = document.querySelector('.notification-list');
    const badge = document.querySelector('.notification-badge');
    if (!listContainer) return;

    const { data: notifs, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false });

    if (error || !notifs) return;

    if (badge) {
        badge.textContent = notifs.length;
        badge.style.display = notifs.length > 0 ? 'flex' : 'none';
    }

    if (notifs.length === 0) {
        listContainer.innerHTML = '<p style="padding:1rem; text-align:center;">No tienes notificaciones nuevas.</p>';
        return;
    }

    listContainer.innerHTML = notifs.map(n => `
        <div class="notification-item ${n.type}" onclick="markAsRead('${n.id}', '${n.link || '#'}')">
            <div class="notification-icon-box">
                <i class="fas ${getIconForType(n.type)}"></i>
            </div>
            <div class="notification-content">
                <h4>${n.title}</h4>
                <p>${n.message}</p>
                <div class="notification-time">${new Date(n.created_at).toLocaleDateString()}</div>
            </div>
        </div>
    `).join('');
  }

  function getIconForType(type) {
    switch(type) {
        case 'urgent': return 'fa-exclamation-triangle';
        case 'success': return 'fa-check-circle';
        default: return 'fa-info-circle';
    }
  }

  window.markAsRead = async (id, link) => {
    try {
        await window.supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);
        
        const item = document.querySelector(`.notification-item[onclick*="${id}"]`);
        if(item) item.remove();
        
        const badge = document.querySelector('.notification-badge');
        if(badge) {
            const count = parseInt(badge.textContent) - 1;
            badge.textContent = count > 0 ? count : '';
            if(count <= 0) badge.style.display = 'none';
        }

        if (link && link !== '#') window.location.href = link;
        
    } catch (e) { console.error(e); }
  };

  function setupNotificationUI() {
    const btn = document.getElementById('notificationBtn');
    let panel = document.querySelector('.notification-panel');
    
    if (!panel) {
        const panelHTML = `
        <div class="notification-panel" id="notificationPanel">
            <div class="notification-header">
                <h3>Notificaciones</h3>
                <button class="notification-close" id="closeNotifPanel"><i class="fas fa-times"></i></button>
            </div>
            <div class="notification-list"></div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', panelHTML);
        panel = document.getElementById('notificationPanel');
        
        document.getElementById('closeNotifPanel').addEventListener('click', () => {
            panel.classList.remove('show');
        });
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        if (panel.classList.contains('show') && !panel.contains(e.target) && !btn.contains(e.target)) {
            panel.classList.remove('show');
        }
    });
  }
})();
