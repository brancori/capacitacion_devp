async function rebuildAppConfig() {
  const hostname = location.hostname;
  let slug = (hostname === 'localhost') ? 'demo' : (hostname.split('.').length > 2 ? hostname.split('.')[0] : 'default');
  try {
    const res = await fetch('../tenants/tenants.json');
    const data = await res.json();
    window.__appConfig = { ...data[slug], tenantSlug: slug };
  } catch (e) {}
}


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

  // ───────────────────────────────────────────────────────────
  // TENANT CONFIG
  // ───────────────────────────────────────────────────────────
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
}

  // ───────────────────────────────────────────────────────────
  // PROFILE & PERMISSIONS
  // ───────────────────────────────────────────────────────────
  function updateProfileView(profile) {
    const profileNameEl = document.getElementById('profileName');
    if (profileNameEl) {
      profileNameEl.textContent = profile.full_name || 'Usuario';
    }

    const manageUsersBtn = document.getElementById('manageUsersBtn');
    const allowedRoles = ['master', 'admin', 'supervisor', 'authenticated_admin', 'authenticated'];
    if (manageUsersBtn) {
      manageUsersBtn.style.display = allowedRoles.includes(profile.role) ? 'flex' : 'none';
    }
  }

async function loadUserProfile() {
  try {
    let role = window.safeStorage.get('role');
    let fullName = window.safeStorage.get('full_name');
    let tenantId = window.safeStorage.get('tenant');

    if (!role || !fullName) {
      console.warn('⚠️ Datos faltantes, consultando profile...');

      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, full_name, tenant_id')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      role = profile?.role ?? user?.app_metadata?.role ?? null;
      fullName = profile?.full_name ?? '';
      tenantId = profile?.tenant_id ?? null;
      
      window.safeStorage.set('role', role);
      window.safeStorage.set('full_name', fullName);
      window.safeStorage.set('tenant', tenantId);

      console.log('🔥 PERFIL guardado en cache:', { role, fullName, tenantId });
    } else {
      console.log('✔️ Perfil leído desde cache');
    }

    const profileData = { role, full_name: fullName, tenant_id: tenantId };
    updateProfileView(profileData);

    return profileData;
  } catch (error) {
    window.location.href = '../index.html';
  }
}

  // ───────────────────────────────────────────────────────────
  // DASHBOARD DATA
  // ───────────────────────────────────────────────────────────
  function getDueDateStatus(dueDate) {
    if (!dueDate) return { text: '', urgent: false };
    
    const ONE_DAY = 1000 * 60 * 60 * 24;
    const now = new Date();
    const due = new Date(dueDate);
    
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

  // 🔥 FIX 2: Cerrar correctamente loadRealDashboardData
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

    // Historial / Timeline (Lógica Nueva)
    renderHistoryTimeline(completados);
  }

    function renderHistoryTimeline(completedAssignments) {
    const timelineContainer = document.querySelector('.timeline');
    if (!timelineContainer) return;

    if (completedAssignments.length === 0) {
        timelineContainer.innerHTML = '<p style="color:#888;">No hay historial de cursos completados.</p>';
        return;
    }

    // Ordenar: Más recientes arriba (stacking up from bottom conceptually means list grows upwards, 
    // but standard UI is newest on top).
    // Usamos completed_at si existe, sino updated_at como fallback.
    const sorted = completedAssignments.sort((a, b) => {
        const dateA = new Date(a.completed_at || a.updated_at || 0);
        const dateB = new Date(b.completed_at || b.updated_at || 0);
        return dateB - dateA; // Descendente
    });

    timelineContainer.innerHTML = sorted.map(item => {
        const dateObj = new Date(item.completed_at || item.updated_at || Date.now());
        // Formato DD/MM/YYYY
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


  // 🔥 FIX 3: Agregar función renderCourses
  function renderCourses(list, containerId, emptyMsg, isCompletedSection = false) {
    const el = document.getElementById(containerId);
    if(!el) return;
    
    if(!list.length) { 
        el.innerHTML = `<p style="text-align:center; padding:2rem; color:#888;">${emptyMsg}</p>`; 
        return; 
    }

    el.innerHTML = list.map(c => {
        // Lógica de aprobación: Status completed O Score >= 8
        const approved = c.status === 'completed' || (c.score !== null && Number(c.score) >= 8);
        const progressVal = c.progress || 0;

        let actionButton = '';
        
        if (isCompletedSection && approved) {
            // CAMBIO: Botón para ver certificado
            // Se asume una ruta interna segura
            actionButton = `
            <a href="../certificados/view.html?assignment_id=${c.assignment_id}" class="btn btn-outline" style="border-color:var(--success); color:var(--success);">
                <i class="fas fa-certificate"></i> Ver Certificado
            </a>`;
        } else {
            // Botón estándar de continuar
            const btnText = progressVal > 0 ? 'Continuar' : 'Iniciar';
            actionButton = `
            <a href="../curso/curso.html?id=${c.id}" class="btn btn-primary">
                ${btnText}
            </a>`;
        }

        return `
          <div class="course-card">
            <div class="course-icon-lg ${approved ? 'completed' : 'pending'}">
              <i class="fas ${approved ? 'fa-check-circle' : 'fa-clock'}"></i>
            </div>
            <div class="course-info">
              <h3>${c.title}</h3>
              <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${approved ? 100 : progressVal}%;"></div>
              </div>
              <p class="meta">
                ${approved ? '¡Curso Aprobado!' : `Progreso: ${progressVal}%`}
                ${c.score ? ` | Calificación: ${c.score}` : ''}
              </p>
            </div>
            <div class="course-actions">
               ${actionButton}
            </div>
          </div>
        `;
    }).join('');
  }

// Ejecución
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mainInit);
} else {
    mainInit();
}

  // ═══════════════════════════════════════════════════════════

  // FUNCIÓN PRINCIPAL DE ARRANQUE
  // ═══════════════════════════════════════════════════════════
// profile.js - Función mainInit corregida

  async function mainInit() {
    if (!window.supabase?.auth) { setTimeout(mainInit, 100); return; }

    try {
        const { data: { session } } = await window.supabase.auth.getSession();
        if (!session) { window.location.href = '../index.html'; return; }
        
        const user = session.user;
        const meta = user.app_metadata || {};
        const realRole = meta.role || 'authenticated';
        const realName = user.user_metadata?.full_name || 'Usuario';
        
        // Cachear datos básicos
        window.safeStorage.set('role', realRole);
        window.safeStorage.set('full_name', realName);

        // Admin Button Check
        const manageBtn = document.getElementById('manageUsersBtn');
        if (manageBtn) {
            const isAdmin = ['master', 'admin', 'supervisor'].includes(realRole);
            manageBtn.style.display = isAdmin ? 'flex' : 'none';
        }

        // Configuración visual
        const config = await loadTenantConfig();
        applyConfiguration(config);

        // Cargar datos
        await loadRealDashboardData(user.id, window.supabase);
        await loadCourses(user.id);
        
        initUI();
        document.body.classList.add('loaded');

    } catch (error) {
        console.error('❌ Error fatal:', error);
        document.body.classList.add('loaded');
    }
  }

  async function loadCourses(userId) {
    try {
        // Se agrega 'score' y 'completed_at' a la consulta
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
                assignment_id: a.id, // ID único de la asignación para el certificado
                progress: a.progress || 0, 
                status: a.status,
                score: a.score,
                due_date: a.due_date,
                completed_at: a.completed_at
            };
        }).filter(c => c);

        // Filtrar pendientes vs completados
        // Pendientes: No completado Y score < 8 (si existe score)
        const pending = allData.filter(c => {
             const isPassed = c.status === 'completed' || (c.score !== null && Number(c.score) >= 8);
             return !isPassed;
        });

        // Completados: Status completed O score >= 8
        const completed = allData.filter(c => {
             return c.status === 'completed' || (c.score !== null && Number(c.score) >= 8);
        });

        // Renderizar con flag isCompletedSection=true para el segundo grupo
        renderCourses(pending, 'assignedCoursesContainer', '¡Estás al día! No tienes cursos pendientes.', false);
        renderCourses(completed, 'completedCoursesContainer', 'Aún no has completado ningún curso.', true);
        
    } catch(e) { 
        console.error("Error cargando cursos:", e); 
    }
  }

// Ejecución
  function initUI() {
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', e => {
        document.querySelectorAll('.tab, .tab-content').forEach(x => x.classList.remove('active'));
        const tab = e.target.closest('.tab');
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab)?.classList.add('active');
    }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mainInit);
  else mainInit();

})();
