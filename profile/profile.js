(async function earlyRoleCheck() {
  try {
    // 1. Verificar parámetro en URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === 'true') {
      document.body.classList.add('loaded');
      return;
    }
    
    // 2. Restaurar sesión si hay token
    const urlToken = urlParams.get('token');
    if (urlToken) {
        await window.supabase.auth.setSession({
            access_token: urlToken,
            refresh_token: 'dummy'
        });
    }

    const { data: { user } } = await window.supabase.auth.getUser();
    
    if (!user) {
      document.body.classList.add('loaded');
      return;
    }
    
    // 3. Consultar perfil (SIN .single() para evitar errores de proxy)
    const { data: rawData } = await window.supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id);
    
    // 🔥 FIX 1: Detectar si es array u objeto (Early Check)
    const profile = Array.isArray(rawData) ? rawData[0] : rawData;
    
    console.log('🔍 Rol detectado (Early Check):', profile?.role);
    
    // 4. Redirigir roles administrativos
    if (profile && ['master', 'admin', 'supervisor'].includes(profile.role)) {
      console.log(`🔄 Redirigiendo ${profile.role} → dashboard`);
      const currentSession = await window.supabase.auth.getSession();
      const token = currentSession.data.session?.access_token;
      window.location.replace(`../dashboard.html?token=${token}`);
      return; 
    }
    
    document.body.classList.add('loaded');
    
  } catch (error) {
    console.error('❌ Error en validación:', error);
    document.body.classList.add('loaded'); 
  }
})();

// ... (Bloque de tema cacheado igual) ...
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
      document.body.style.opacity = 1;
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
    const setStyle = (prop, value) => { if (value) document.documentElement.style.setProperty(prop, value); };

    // ... (Funciones de Tenant y Configuración iguales) ...
    const detectTenant = () => {
        const host = location.hostname || 'localhost';
        if (host === 'localhost') return 'demo';
        if (host === '127.0.0.1') return 'default';
        const parts = host.split('.');
        return (parts.length > 2 && parts[0] !== 'www') ? parts[0] : 'default';
    };

    async function loadTenantConfig() {
        const tenantId = detectTenant();
        console.log(`🔍 Detectando tenant: ${tenantId}`);
        try {
            const response = await fetch('../tenants/tenants.json', { cache: 'no-store', headers: { 'Accept': 'application/json' } });
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
        setStyle('--primaryColor', config.primaryColor);
        setStyle('--secondaryColor', config.secondaryColor);
        const companyNameEl = document.getElementById('companyName');
        if (companyNameEl && config.companyName) {
            const icon = companyNameEl.querySelector('i');
            companyNameEl.innerHTML = '';
            if (icon) companyNameEl.appendChild(icon);
            companyNameEl.appendChild(document.createTextNode(` ${config.companyName}`));
        }
        console.log(`🎨 Tenant aplicado: ${config.companyName || 'sin nombre definido'}`);
        try {
            const tenantSlug = detectTenant();
            localStorage.setItem('tenantTheme', JSON.stringify(config));
            localStorage.setItem('tenantSlug', tenantSlug);
            console.log('💾 Configuración de tenant guardada en caché.');
        } catch (e) { console.warn('Advertencia: No se pudo guardar el tema en localStorage.', e); }
    }

    const manageUsersBtn = document.getElementById('manageUsersBtn');
    function updateProfileView(profile) {
        const profileNameEl = document.getElementById('profileName');
        if (profileNameEl) profileNameEl.textContent = profile.full_name || 'Usuario';
        
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
        const now = new Date(); const due = new Date(dueDate);
        now.setHours(0, 0, 0, 0); due.setHours(0, 0, 0, 0);
        const diffTime = due.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / ONE_DAY);
        if (diffDays < 0) return { text: 'Vencido', urgent: true };
        if (diffDays === 0) return { text: 'Vence hoy', urgent: true };
        if (diffDays === 1) return { text: 'Vence mañana', urgent: true };
        if (diffDays <= 7) return { text: `Vence en ${diffDays} días`, urgent: true };
        return { text: `Vence en ${diffDays} días`, urgent: false };
    }

    async function loadUserProfile() {
        // Esta función es redundante con loadRealDashboardData pero la mantenemos para UI rápida
        // Si quieres simplificar, podrías eliminarla, pero dejémosla por ahora.
    }

    // ... (initUI se mantiene igual) ...
    function initUI() {
        const modal = document.getElementById('modal');
        const modalIcon = document.getElementById('modalIcon');
        const modalTitle = document.getElementById('modalTitle');
        const modalMessage = document.getElementById('modalMessage');
        const modalClose = document.getElementById('modalClose');

        function showModal(title, message, type = 'success') {
            modalTitle.textContent = title; modalMessage.textContent = message;
            modalIcon.className = `modal-icon ${type}`;
            modalIcon.innerHTML = type === 'success' ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-info-circle"></i>';
            modal.classList.add('show');
        }
        function closeModal() { modal.classList.remove('show'); }
        modalClose.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

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

        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            document.querySelectorAll('.course-card').forEach(card => {
                const title = card.querySelector('h3').textContent.toLowerCase();
                card.style.display = title.includes(searchTerm) ? 'flex' : 'none';
            });
        });

        const themeToggle = document.getElementById('themeToggle');
        themeToggle?.addEventListener('click', () => { showModal('Cambio de Tema', 'Próximamente', 'info'); });
        
        const progressBars = document.querySelectorAll('.progress-bar-fill');
        progressBars.forEach(bar => {
            const width = bar.style.width; bar.style.width = '0%';
            setTimeout(() => { bar.style.width = width; }, 100);
        });
    }

    // ═══════════════════════════════════════════════════════════
    // 🔥 FUNCIÓN CORE DE DATOS (AQUÍ ESTABA EL ERROR)
    // ═══════════════════════════════════════════════════════════
    async function loadRealDashboardData(userId) {
        const supabase = window.supabase;

        // 1. CARGA DE DATOS - Obtener perfil (SIN .single para evitar error de array)
        const { data: rawProfile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId); // ❌ Quitamos .single()

        if (profileError) {
            console.error('❌ Error cargando perfil:', profileError);
            return;
        }

        // 🔥 FIX 2: Aplanamos el array si es necesario
        const profile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;

        // ✅ Ahora profile.role viene correcto (admin, employee, etc.)
        const userRole = profile?.role || 'employee';
        console.log('🔍 Role del usuario (loadRealDashboardData):', userRole);

        // Continuar con las otras consultas
        const [assignmentsRes, myBadgesRes, allBadgesRes, logsRes] = await Promise.all([
            supabase.from('user_course_assignments').select('*, articles:course_id(title, duration_text)').eq('user_id', userId),
            supabase.from('user_badges').select('badge_id'), 
            supabase.from('badges').select('*'),             
            supabase.from('activity_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5)
        ]);

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
            
            const shortId = (profile.id) ? profile.id.split('-')[0].toUpperCase() : '---'; 

            const roleEl = document.querySelector('.profile-card .role');
            if(roleEl) {
                const roleDisplay = userRole === 'master' ? 'Administrador' : 
                                   userRole === 'admin' ? 'Administrador' :
                                   userRole === 'supervisor' ? 'Supervisor' : 'Colaborador';
                roleEl.textContent = `${roleDisplay} | ID: ${shortId}`;
            }
        }

        // --- B. Estadísticas y Donut Chart ---
        const totalCursos = assignments.length;
        const completados = assignments.filter(a => a.status === 'completed' || Number(a.progress) === 100).length;
        const pendientes = assignments.filter(a => a.status !== 'completed' && Number(a.progress) < 100).length;
        const percentage = totalCursos > 0 ? Math.round((completados / totalCursos) * 100) : 0;

        const donutFg = document.querySelector('.progress-donut-fg');
        const donutText = document.querySelector('.progress-text');
        const progressMsg = document.querySelector('.profile-card p[style*="primary"]');

        if (donutFg) {
            const radius = 69;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (percentage / 100) * circumference;
            donutFg.style.strokeDasharray = `${circumference} ${circumference}`;
            donutFg.style.transition = 'none'; donutFg.style.animation = 'none'; 
            donutFg.style.strokeDashoffset = offset;
        }

        if (donutText) donutText.textContent = `${percentage}%`;
        if (progressMsg) progressMsg.textContent = `${completados} de ${totalCursos} cursos completados`;

        const statCards = document.querySelectorAll('.stat-card h3');
        if(statCards.length >= 3) {
            if(statCards[0]) statCards[0].textContent = totalCursos;
            if(statCards[1]) statCards[1].textContent = completados;
            if(statCards[2]) statCards[2].textContent = pendientes;
        }

        // --- C. RENDERIZADO DE INSIGNIAS ---
        const badgesContainer = document.querySelector('.badges-grid');
        if (badgesContainer) {
            if (allBadges.length === 0) {
                badgesContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; font-size: 0.8rem;">No hay insignias disponibles.</p>';
            } else {
                badgesContainer.innerHTML = allBadges.map(badge => {
                    const isEarned = myBadgesIds.has(badge.id);
                    const cssClass = isEarned ? 'badge earned' : 'badge';
                    const tooltip = isEarned ? '¡Insignia Obtenida!' : 'Bloqueado: Completa los requisitos';
                    return `<div class="${cssClass}" title="${tooltip}"><i class="${badge.icon_class || 'fas fa-medal'}"></i><span>${badge.name}</span></div>`;
                }).join('');
            }
        }

        // --- D. Calendario (Urgencias) ---
        const now = new Date();
        const urgentThreshold = new Date();
        urgentThreshold.setDate(now.getDate() + 7);
        const urgentesCount = assignments.filter(a => {
            if (!a.due_date || a.status === 'completed') return false;
            const due = new Date(a.due_date);
            return due <= urgentThreshold && due >= now;
        }).length;
        if(statCards[3]) statCards[3].textContent = urgentesCount;

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
                    return `<div class="calendar-event ${isUrgent ? 'urgent' : ''}"><div class="event-date"><div class="day">${day}</div><div class="month">${month}</div></div><div class="event-details"><h4>${a.articles.title}</h4><p>${diffDays < 0 ? 'Vencido' : diffDays === 0 ? 'Vence hoy' : `Vence en ${diffDays} días`}</p></div></div>`;
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
                    let icon = 'fa-info-circle'; let color = 'var(--primaryColor)';
                    if (log.action_type === 'course_completed') { icon = 'fa-check-circle'; color = 'var(--success)'; }
                    if (log.action_type === 'enrollment') { icon = 'fa-play-circle'; color = 'var(--warning)'; }
                    return `<div class="timeline-item"><div class="timeline-content"><div class="timeline-date">${date}</div><h3 style="color: ${color}; margin-bottom: 0.5rem; font-size: 1rem;"><i class="fas ${icon}"></i> ${log.action_type === 'course_completed' ? 'Curso Completado' : 'Actividad'}</h3><p style="font-size: 0.9rem;"><strong>${log.description}</strong></p></div></div>`;
                }).join('');
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // FUNCIÓN PRINCIPAL DE ARRANQUE
    // ═══════════════════════════════════════════════════════════
    async function mainInit() {
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get('token');
        if (urlToken) {
            console.log('🔑 Token recibido por URL');
            await supabase.auth.setSession({ access_token: urlToken, refresh_token: 'dummy' });
            window.history.replaceState({}, '', window.location.pathname);
        }
        
        const config = await loadTenantConfig();
        applyConfiguration(config);
        console.log('✅ Tenant listo');

        // 🔐 Obtener usuario autenticado
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData?.user) {
            console.error("❌ No hay sesión activa", authError);
            return;
        }
        const userId = authData.user.id;

        // 🔥 FIX 3: Obtener perfil para redirección (SIN .single)
        const { data: rawProfile, error: profileRowError } = await supabase
            .from("profiles")
            .select("tenant_id, role")
            .eq("id", userId);

        if (profileRowError) { console.error("Error al leer profileRow:", profileRowError); return; }

        // 🔥 FIX 4: Aplanamos array (igual que en loadRealDashboardData)
        const profileRow = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;

        if (!profileRow) { console.error("El usuario no tiene perfil en la base de datos."); return; }

        const myTenant = profileRow.tenant_id;
        const myRole = profileRow.role;

        console.log("🧭 Tenant (main):", myTenant, "| Role (main):", myRole);

        // 🚨 REDIRECCIÓN FORZADA PARA ADMINS 🚨
        if (['master', 'admin', 'supervisor'].includes(myRole)) {
            console.log(`🚀 Rol ${myRole} detectado. Redirigiendo a Dashboard...`);
            const session = await supabase.auth.getSession();
            const token = session.data.session?.access_token || urlToken;
            if (token) {
                window.location.replace(`../dashboard.html?token=${token}`);
                return; // Detenemos la ejecución aquí
            }
        }

        // Si no es admin, cargamos la data del dashboard de usuario
        await loadRealDashboardData(userId);

        // Cargar cursos
        const { data: assignments, error: coursesError } = await supabase
            .from("user_course_assignments")
            .select(`progress, due_date, status, articles (id, title, thumbnail_url, status, instructor_name, duration_text)`)
            .eq('user_id', userId);

        if (coursesError) { console.error("Error al cargar cursos:", coursesError.message); return; }

        const allCourses = assignments ? assignments.map(a => {
            if (!a.articles) return null;
            const articleData = Array.isArray(a.articles) ? a.articles[0] : a.articles;
            if (!articleData) return null;
            return { ...articleData, progress: a.progress, due_date: a.due_date, assignment_status: a.status };
        }).filter(c => c !== null) : [];

        const pendingCourses = allCourses.filter(c => c.progress < 100 && c.assignment_status !== 'completed');
        const completedCourses = allCourses.filter(c => c.progress === 100 || c.assignment_status === 'completed');

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
                let iconClass = 'pending'; let iconFA = 'fa-clock'; let btnText = progress > 0 ? 'Continuar' : 'Iniciar';
                if (isUrgent) { iconClass = 'urgent'; iconFA = 'fa-exclamation-triangle'; } 
                else if (progress === 100) { iconClass = 'completed'; iconFA = 'fa-check-circle'; btnText = 'Ver Certificado'; }
                return `<div class="course-card" data-status="${iconClass}"><div class="course-icon-lg ${iconClass}"><i class="fas ${iconFA}"></i></div><div class="course-info"><h3>${c.title}</h3>${dueDateInfo.text && progress < 100 ? `<div class="meta-item" style="font-size: 0.9rem; color: ${isUrgent ? 'var(--danger)' : 'var(--text-secondary)'}; font-weight: ${isUrgent ? '500' : 'normal'}; margin-bottom: 0.5rem;"><i class="fas fa-calendar-alt"></i><span>${dueDateInfo.text}</span></div>` : ''}<div class="course-meta" style="margin-bottom: 0.75rem;"><div class="meta-item"><i class="fas fa-user-tie"></i> <span>${c.instructor_name || 'Trox Academy'}</span></div><div class="meta-item"><i class="fas fa-clock"></i> <span>${c.duration_text || 'Self-paced'}</span></div></div><div class="progress-bar-container"><div class="progress-bar-fill" style="width: ${progress}%;"></div></div><p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem;">Progreso: ${progress}%</p></div><div class="course-actions"><a href="./curso/curso.html?id=${c.id}" class="btn btn-primary" style="width: 100%;">${btnText}</a></div></div>`;
            }).join("");
        };

        renderCourses(pendingCourses, 'assignedCoursesContainer', '¡Estás al día! No tienes cursos pendientes.');
        renderCourses(completedCourses, 'completedCoursesContainer', 'Aún no has completado ningún curso.');
        
        initUI();
        document.body.classList.add('loaded');
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', mainInit); } else { mainInit(); }
})();