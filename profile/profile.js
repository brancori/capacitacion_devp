// ═══════════════════════════════════════════════════════════
// GLOBAL UTILITIES & THEME CACHE
// ═══════════════════════════════════════════════════════════
window.safeStorage = window.safeStorage || {
  set: (k, v) => { try { localStorage.setItem(k, v) } catch(e){} },
  get: (k) => { try { return localStorage.getItem(k) } catch(e){ return null } },
  remove: (k) => { try { localStorage.removeItem(k) } catch(e){} }
};

// Aplicar tema cacheado instantáneamente para evitar parpadeos
(function() {
  try {
    const cachedTheme = localStorage.getItem('tenantTheme');
    if (cachedTheme) {
      const theme = JSON.parse(cachedTheme);
      const root = document.documentElement;
      if (theme.primaryColor) root.style.setProperty('--primaryColor', theme.primaryColor);
      if (theme.secondaryColor) root.style.setProperty('--secondaryColor', theme.secondaryColor);
    }
  } catch (e) {}
})();

// ═══════════════════════════════════════════════════════════
// LOGICA PRINCIPAL (MAIN WRAPPER)
// ═══════════════════════════════════════════════════════════
(async () => {

  // 1. ESPERA ACTIVA DE SUPABASE (CRÍTICO)
  // ───────────────────────────────────────────────────────────
  async function waitForSupabase() {
    let intentos = 0;
    while (!window.supabase && intentos < 50) {
      await new Promise(r => setTimeout(r, 100));
      intentos++;
    }
    if (!window.supabase) throw new Error('Supabase no inicializó. Revisa supabase-client.js');
    return window.supabase;
  }

  // ───────────────────────────────────────────────────────────
  // HELPERS GENERALES
  // ───────────────────────────────────────────────────────────
  const setStyle = (prop, value) => {
    if (value) document.documentElement.style.setProperty(prop, value);
  };

  const detectTenant = () => {
    const host = location.hostname || 'localhost';
    if (host === 'localhost') return 'demo';
    if (host === '127.0.0.1') return 'default';
    const parts = host.split('.');
    return (parts.length > 2 && parts[0] !== 'www') ? parts[0] : 'default';
  };

  const getDueDateStatus = (dueDate) => {
    if (!dueDate) return { text: '', urgent: false };
    const ONE_DAY = 1000 * 60 * 60 * 24;
    const now = new Date();
    const due = new Date(dueDate);
    now.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / ONE_DAY);

    if (diffDays < 0) return { text: 'Vencido', urgent: true };
    if (diffDays === 0) return { text: 'Vence hoy', urgent: true };
    if (diffDays <= 7) return { text: `Vence en ${diffDays} días`, urgent: true };
    return { text: `Vence en ${diffDays} días`, urgent: false };
  };

  // ───────────────────────────────────────────────────────────
  // 2. EARLY ROLE CHECK (Seguridad y Redirección)
  // ───────────────────────────────────────────────────────────
  async function performRoleCheck(supabase) {
    console.log('🛡️ Verificando permisos...');
    
    // Check rápido en cache
    let role = window.safeStorage.get('role');
    
    // Si no es válido, buscar en DB
    if (!role || role === 'authenticated') {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, full_name, tenant_id')
          .eq('id', user.id)
          .single();
        
        if (profile) {
          role = profile.role;
          // Aprovechamos de actualizar todo el storage
          window.safeStorage.set('role', profile.role);
          window.safeStorage.set('tenant', profile.tenant_id);
          window.safeStorage.set('full_name', profile.full_name);
        } else {
            role = user.app_metadata?.role;
        }
      }
    }

    // Redirección si es Admin/Master
    if (['master', 'admin', 'supervisor'].includes(role)) {
      console.log(`🔄 Usuario ${role} detectado, redirigiendo a dashboard...`);
      window.location.replace('../dashboard.html');
      return false; // Detener carga de profile
    }
    return true; // Continuar
  }

  // ───────────────────────────────────────────────────────────
  // TENANT CONFIG
  // ───────────────────────────────────────────────────────────
  async function loadTenantConfig() {
    const tenantId = detectTenant();
    try {
      const response = await fetch('../tenants/tenants.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Config not found');
      const data = await response.json();
      return data[tenantId] || data['default'] || {};
    } catch (error) {
      return {};
    }
  }

  function applyConfiguration(config) {
    if (!config) return;
    setStyle('--primaryColor', config.primaryColor);
    setStyle('--secondaryColor', config.secondaryColor);
    
    const companyNameEl = document.getElementById('companyName');
    if (companyNameEl && config.companyName) {
        // Preservar icono si existe
        const icon = companyNameEl.querySelector('i');
        companyNameEl.innerHTML = ''; 
        if(icon) companyNameEl.appendChild(icon);
        companyNameEl.appendChild(document.createTextNode(` ${config.companyName}`));
    }
    localStorage.setItem('tenantTheme', JSON.stringify(config));
  }

  // ───────────────────────────────────────────────────────────
  // RENDER UI FUNCTIONS
  // ───────────────────────────────────────────────────────────
  function renderCourses(coursesList, containerId, emptyMsg) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!coursesList || coursesList.length === 0) {
      container.innerHTML = `<p style="text-align: center; padding: 2rem; color: var(--text-secondary);">${emptyMsg}</p>`;
      return;
    }

    container.innerHTML = coursesList.map(c => {
      const dueDateInfo = getDueDateStatus(c.due_date);
      const progress = c.progress || 0;
      const isUrgent = dueDateInfo.urgent && progress < 100;
      let iconClass = isUrgent ? 'urgent' : (progress === 100 ? 'completed' : 'pending');
      let iconFA = isUrgent ? 'fa-exclamation-triangle' : (progress === 100 ? 'fa-check-circle' : 'fa-clock');
      let btnText = progress === 100 ? 'Ver Certificado' : (progress > 0 ? 'Continuar' : 'Iniciar');

      return `
      <div class="course-card" data-status="${iconClass}">
        <div class="course-icon-lg ${iconClass}"><i class="fas ${iconFA}"></i></div>
        <div class="course-info">
          <h3>${c.title}</h3>
          ${(dueDateInfo.text && progress < 100) ? `<div class="meta-item" style="color: ${isUrgent ? 'var(--danger)' : 'inherit'}"><i class="fas fa-calendar-alt"></i> <span>${dueDateInfo.text}</span></div>` : ''}
          <div class="progress-bar-container"><div class="progress-bar-fill" style="width: ${progress}%;"></div></div>
          <p>Progreso: ${progress}%</p>
        </div>
        <div class="course-actions">
          <a href="../curso/curso.html?id=${c.id}" class="btn btn-primary">${btnText}</a>
        </div>
      </div>`;
    }).join('');
  }

  async function loadDashboardData(supabase, userId) {
    const cachedName = window.safeStorage.get('full_name');
    const cachedRole = window.safeStorage.get('role');

    // 1. UI Básica (Datos cacheados)
    document.getElementById('profileName').textContent = cachedName || 'Usuario';
    const avatarEl = document.querySelector('.avatar');
    if (avatarEl && cachedName) {
        const initials = cachedName.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase();
        avatarEl.innerHTML = `<span style="font-size: 2.5rem; font-weight: bold;">${initials}</span>`;
    }
    const roleEl = document.querySelector('.profile-card .role');
    if(roleEl) roleEl.textContent = cachedRole === 'employee' ? 'Colaborador' : (cachedRole || 'Usuario');

    // 2. Fetch Datos Reales
    const [assignmentsRes, allBadgesRes, myBadgesRes, logsRes] = await Promise.all([
      supabase.from('user_course_assignments').select('*, articles:course_id(id, title, duration_text)').eq('user_id', userId),
      supabase.from('badges').select('*'),
      supabase.from('user_badges').select('badge_id').eq('user_id', userId),
      supabase.from('activity_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5)
    ]);

    const assignments = assignmentsRes.data || [];
    const logs = logsRes.data || [];
    const myBadgesSet = new Set((myBadgesRes.data || []).map(b => b.badge_id));
    const allBadges = allBadgesRes.data || [];

    // Estadísticas
    const total = assignments.length;
    const completed = assignments.filter(a => a.status === 'completed' || a.progress === 100).length;
    const pending = total - completed;
    const percent = total > 0 ? Math.round((completed/total)*100) : 0;

    // Actualizar DOM Stats
    document.querySelector('.progress-text').textContent = `${percent}%`;
    const donutFg = document.querySelector('.progress-donut-fg');
    if(donutFg) {
        const offset = 433.54 - (percent / 100) * 433.54; // 2*PI*69 ≈ 433.54
        donutFg.style.strokeDashoffset = offset;
    }
    
    const stats = document.querySelectorAll('.stat-card h3');
    if(stats[0]) stats[0].textContent = total;
    if(stats[1]) stats[1].textContent = completed;
    if(stats[2]) stats[2].textContent = pending;

    // Badges
    const badgeContainer = document.querySelector('.badges-grid');
    if(badgeContainer) {
        badgeContainer.innerHTML = allBadges.length ? allBadges.map(b => {
            const earned = myBadgesSet.has(b.id);
            return `<div class="badge ${earned?'earned':''}"><i class="${b.icon_class||'fas fa-medal'}"></i><span>${b.name}</span></div>`;
        }).join('') : '<p>No hay insignias disponibles</p>';
    }

    // Timeline
    const timeline = document.querySelector('.timeline');
    if(timeline && logs.length) {
        timeline.innerHTML = logs.map(l => 
            `<div class="timeline-item"><div class="timeline-content"><div class="timeline-date">${new Date(l.created_at).toLocaleDateString()}</div><p>${l.description}</p></div></div>`
        ).join('');
    }

    // Procesar Cursos para Renderizar
    const processedCourses = assignments.map(a => {
        const article = Array.isArray(a.articles) ? a.articles[0] : a.articles;
        if(!article) return null;
        return { ...article, progress: a.progress, due_date: a.due_date, status: a.status };
    }).filter(c => c !== null);

    renderCourses(processedCourses.filter(c => c.progress < 100 && c.status !== 'completed'), 'assignedCoursesContainer', '¡Estás al día!');
    renderCourses(processedCourses.filter(c => c.progress === 100 || c.status === 'completed'), 'completedCoursesContainer', 'Aún no has completado cursos.');
  }

  // ───────────────────────────────────────────────────────────
  // MAIN INIT (ORCHESTRATOR)
  // ───────────────────────────────────────────────────────────
  async function mainInit() {
    try {
      // 1. Esperar Supabase
      const supabase = await waitForSupabase();
      console.log('✅ Supabase listo en profile.js');

      // 2. Verificar Sesión
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('⚠️ Sin sesión, redirigiendo...');
        window.location.href = '../index.html';
        return;
      }

      // 3. Verificar Rol (puede redirigir)
      const shouldContinue = await performRoleCheck(supabase);
      if (!shouldContinue) return;

      // 4. Cargar Configuración Visual
      const config = await loadTenantConfig();
      applyConfiguration(config);

      // 5. Cargar Dashboard
      await loadDashboardData(supabase, session.user.id);

      // 6. Finalizar
      initUIListeners();
      document.body.classList.add('loaded');

    } catch (error) {
      console.error('❌ Error fatal en inicialización:', error);
      document.body.classList.add('loaded'); // Mostrar pantalla aunque haya error
    }
  }

  function initUIListeners() {
    // Tabs
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab, .tab-content').forEach(el => el.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab)?.classList.add('active');
      });
    });

    // Modal cerrar
    document.getElementById('modalClose')?.addEventListener('click', () => {
        document.getElementById('modal')?.classList.remove('show');
    });
  }

  // Arrancar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mainInit);
  } else {
    mainInit();
  }

})();