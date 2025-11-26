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
    // FIX: Esperar a que 'window.supabase' Y 'window.supabase.auth' existan
if (!window.supabase?.auth) {
        setTimeout(earlyRoleCheck, 100);
        return;
    }

    try {
        // Ahora es seguro llamar a auth
        const { data: { session } } = await window.supabase.auth.getSession();
        
        if (!session) {
            console.warn('⚠️ Sin sesión activa, mostrando página');
            document.body.classList.add('loaded');
            return;
        }

        console.log('✅ Sesión detectada');

        let finalRole = window.safeStorage.get('role');
        
        if (!finalRole || finalRole === 'authenticated') {
            const { data: { user } } = await window.supabase.auth.getUser();
            
            if (user) {
                const { data: profile } = await window.supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                if (profile?.role) {
                    finalRole = profile.role;
                } else if (user.app_metadata?.role) {
                    finalRole = user.app_metadata.role;
                }

                if (finalRole) {
                    window.safeStorage.set('role', finalRole);
                }
            }
        }
        
        document.body.classList.add('loaded');
        
    } catch (error) {
        console.error('❌ Error en validación:', error);
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
      
      console.log('🎨 Tema cacheado aplicado');
    }
  } catch (e) {
    console.error('Error aplicando tema cacheado', e);
  }
})();

// ═══════════════════════════════════════════════════════════
// BLOQUE ÚNICO DE INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════
(async () => {
  const supabase = window.supabase;

  // ───────────────────────────────────────────────────────────
  // HELPERS
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

  // ───────────────────────────────────────────────────────────
  // TENANT CONFIG
  // ───────────────────────────────────────────────────────────
async function loadTenantConfig() {
    try {
        const response = await fetch('../tenants/tenants.json');
        const data = await response.json();
        const host = location.hostname !== 'localhost' ? location.hostname.split('.')[0] : 'demo';
        return data[host] || data['default'] || {};
    } catch (e) { return {}; }
}

function applyConfiguration(config) {
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
  async function loadRealDashboardData(userId) {
    const cachedRole = window.safeStorage.get('role');
    const cachedTenant = window.safeStorage.get('tenant');
    const cachedName = window.safeStorage.get('full_name');

    console.log('📦 Usando datos cacheados para dashboard:', {
      role: cachedRole,
      tenant: cachedTenant,
      name: cachedName
    });

    const [assignmentsRes, myBadgesRes, allBadgesRes, logsRes] = await Promise.all([
      supabase.from('user_course_assignments')
        .select('*, articles:course_id(title, duration_text)')
        .eq('user_id', userId),
      supabase.from('user_badges')
        .select('badge_id')
        .eq('user_id', userId), 
      supabase.from('badges').select('*'),             
      supabase.from('activity_logs')
        .select('description')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)
    ]);

    const assignments = assignmentsRes.data || [];
    const myBadgesIds = new Set((myBadgesRes.data || []).map(b => b.badge_id)); 
    const allBadges = allBadgesRes.data || [];
    const logs = logsRes.data || [];

    console.log('📊 Datos del dashboard cargados:', {
      assignments: assignments.length,
      badges: allBadges.length,
      logs: logs.length
    });

    // Renderizar perfil
    const profileNameEl = document.getElementById('profileName');
    if (profileNameEl) {
      profileNameEl.textContent = cachedName || 'Usuario';
    }

    const avatarEl = document.querySelector('.avatar');
    if (avatarEl && cachedName) {
      const initials = cachedName
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
      avatarEl.innerHTML = `<span style="font-size: 2.5rem; font-weight: bold;">${initials}</span>`;
    }

    const roleEl = document.querySelector('.profile-card .role');
    if (roleEl && cachedRole) {
      const roleMap = {
        master: 'Administrador Master',
        admin: 'Administrador',
        supervisor: 'Supervisor',
        employee: 'Colaborador'
      };
      const { data: { user } } = await supabase.auth.getUser();
      const shortId = user.id.split('-')[0].toUpperCase();
      roleEl.textContent = `${roleMap[cachedRole] || 'Colaborador'} | ID: ${shortId}`;
    }

    // Estadísticas
    const totalCursos = assignments.length;
    const completados = assignments.filter(a => 
      a.status === 'completed' || Number(a.progress) === 100
    ).length;
    const pendientes = totalCursos - completados;
    const percentage = totalCursos > 0 ? Math.round((completados / totalCursos) * 100) : 0;

    const donutFg = document.querySelector('.progress-donut-fg');
    const donutText = document.querySelector('.progress-text');
    const progressMsg = document.querySelector('.profile-card p[style*="primary"]');

    if (donutFg) {
      const radius = 69;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (percentage / 100) * circumference;
      donutFg.style.strokeDasharray = `${circumference} ${circumference}`;
      donutFg.style.strokeDashoffset = offset;
      console.log(`📊 Donut: ${percentage}%`);
    }

    if (donutText) donutText.textContent = `${percentage}%`;
    if (progressMsg) progressMsg.textContent = `${completados} de ${totalCursos} cursos completados`;

    const statCards = document.querySelectorAll('.stat-card h3');
    if (statCards[0]) statCards[0].textContent = totalCursos;
    if (statCards[1]) statCards[1].textContent = completados;
    if (statCards[2]) statCards[2].textContent = pendientes;

    // Badges
    const badgesContainer = document.querySelector('.badges-grid');
    if (badgesContainer) {
      if (allBadges.length === 0) {
        badgesContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">No hay insignias.</p>';
      } else {
        badgesContainer.innerHTML = allBadges.map(badge => {
          const isEarned = myBadgesIds.has(badge.id);
          const cssClass = isEarned ? 'badge earned' : 'badge';
          return `<div class="${cssClass}"><i class="${badge.icon_class || 'fas fa-medal'}"></i><span>${badge.name}</span></div>`;
        }).join('');
      }
    }

    // Calendario
    const now = new Date();
    const urgentThreshold = new Date();
    urgentThreshold.setDate(now.getDate() + 7);

    const urgentesCount = assignments.filter(a => {
      if (!a.due_date || a.status === 'completed') return false;
      const due = new Date(a.due_date);
      return due <= urgentThreshold && due >= now;
    }).length;
    
    if (statCards[3]) statCards[3].textContent = urgentesCount;

    // Timeline
    const timelineContainer = document.querySelector('.timeline');
    if (timelineContainer && logs.length > 0) {
      timelineContainer.innerHTML = logs.map(log => {
        const date = new Date(log.created_at).toLocaleDateString('es-ES');
        return `<div class="timeline-item"><div class="timeline-content"><div class="timeline-date">${date}</div><p>${log.description}</p></div></div>`;
      }).join('');
    }
  }


  // 🔥 FIX 3: Agregar función renderCourses
function renderCourses(list, containerId, msg) {
    const el = document.getElementById(containerId);
    if(!el) return;
    if(!list.length) { 
        el.innerHTML = `<p style="text-align:center; padding:2rem; color:#888;">${msg}</p>`; 
        return; 
    }
    el.innerHTML = list.map(c => `
      <div class="course-card">
        <div class="course-icon-lg ${c.progress === 100 ? 'completed' : 'pending'}">
          <i class="fas ${c.progress === 100 ? 'fa-check-circle' : 'fa-clock'}"></i>
        </div>
        <div class="course-info">
          <h3>${c.title}</h3>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${c.progress}%;"></div>
          </div>
          <p class="meta">Progreso: ${c.progress}%</p>
        </div>
        <div class="course-actions">
           <a href="./curso/curso.html?id=${c.id}" class="btn btn-primary">
             ${c.progress > 0 ? 'Continuar' : 'Iniciar'}
           </a>
        </div>
      </div>
    `).join('');
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
    // 1. Esperar a Supabase
    if (!window.supabase?.auth) {
        setTimeout(mainInit, 100);
        return;
    }

    try {
        console.log('🚀 Iniciando Perfil...');

        // 2. Recuperar sesión
        const { data: { session } } = await window.supabase.auth.getSession();

        if (!session) {
            window.location.href = '../index.html';
            return; 
        }

        // 3. Fix de Sesión (Tracking Prevention)
        await window.supabase.auth.setSession(session);
        
        const user = session.user;
        const meta = user.app_metadata || {};
        
        // Datos reales del token
        const realRole = meta.role || 'authenticated';
        const realTenant = meta.tenant_id;
        const realName = user.user_metadata?.full_name || 'Usuario';
        
        // 4. AUTORREPARACIÓN DE STORAGE
        // Si el localStorage está sucio ('undefined'), lo arreglamos con los datos del token
        const storedTenant = window.safeStorage.get('tenant');
        if (!storedTenant || storedTenant === 'undefined') {
            console.log("🛠️ Corrigiendo datos locales...");
            window.safeStorage.set('role', realRole);
            if (realTenant) window.safeStorage.set('tenant', realTenant);
            window.safeStorage.set('full_name', realName);
        }

        // 5. >>> AQUÍ QUITAMOS LA REDIRECCIÓN <<<
        // Ya no verificamos si eres admin. Si entraste aquí, es porque quieres ver tus cursos.
        // Solo mostraremos el botón de "Ir a Dashboard" si eres admin (Lógica visual, no de bloqueo).
        const manageBtn = document.getElementById('manageUsersBtn');
        if (manageBtn) {
            const isAdmin = ['master', 'admin', 'supervisor'].includes(realRole);
            manageBtn.style.display = isAdmin ? 'flex' : 'none'; // Solo admins ven el botón
            
        }

        // 6. Cargar Interfaz
        const config = await loadTenantConfig();
        applyConfiguration(config);

        // Renderizar Usuario
        document.getElementById('profileName').textContent = realName;
        const roleEl = document.querySelector('.profile-card .role');
        if(roleEl) roleEl.textContent = `${realRole.toUpperCase()} | ${user.email}`;
        
        // 7. Cargar Cursos
        await loadCourses(user.id);
        
        initUI();
        document.body.classList.add('loaded');

    } catch (error) {
        console.error('❌ Error fatal:', error);
        // Aunque falle, mostramos la interfaz para no dejar pantalla blanca
        document.body.classList.add('loaded');
    }
}

async function loadCourses(userId) {
    try {
        const { data: assignments, error } = await window.supabase
            .from("user_course_assignments")
            .select(`progress, due_date, status, articles (id, title, thumbnail_url, duration_text)`)
            .eq('user_id', userId);

        if (error) throw error;

        const allData = (assignments || []).map(a => {
            const art = Array.isArray(a.articles) ? a.articles[0] : a.articles;
            if (!art) return null;
            return { 
                ...art, 
                progress: a.progress || 0, 
                status: a.status,
                due_date: a.due_date 
            };
        }).filter(c => c);

        const pending = allData.filter(c => c.progress < 100 && c.status !== 'completed');
        const completed = allData.filter(c => c.progress === 100 || c.status === 'completed');

        renderCourses(pending, 'assignedCoursesContainer', '¡Estás al día! No tienes cursos pendientes.');
        renderCourses(completed, 'completedCoursesContainer', 'Aún no has completado ningún curso.');
        
        // Actualizar estadísticas simples
        updateStats(allData.length, completed.length, pending.length);

    } catch(e) { 
        console.error("Error cargando cursos:", e); 
    }
}

function updateStats(total, done, pending) {
    const stats = document.querySelectorAll('.stat-card h3');
    if(stats[0]) stats[0].textContent = total;
    if(stats[1]) stats[1].textContent = done;
    if(stats[2]) stats[2].textContent = pending;
    
    // Donut chart
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    const donutFg = document.querySelector('.progress-donut-fg');
    const donutText = document.querySelector('.progress-text');
    
    if (donutFg) {
        const circumference = 2 * Math.PI * 69;
        const offset = circumference - (percent / 100) * circumference;
        donutFg.style.strokeDasharray = `${circumference} ${circumference}`;
        donutFg.style.strokeDashoffset = offset;
    }
    if (donutText) donutText.textContent = `${percent}%`;
}
// Ejecución
function initUI() {
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', e => {
        document.querySelectorAll('.tab, .tab-content').forEach(x => x.classList.remove('active'));
        const tab = e.target.closest('.tab'); // Asegura click en el div
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab)?.classList.add('active');
    }));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mainInit);
else mainInit();
})();
