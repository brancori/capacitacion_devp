// ==========================================
// PROFILE UI - Renderizado y Eventos
// ==========================================

// HELPERS UI
function getDueDateStatus(dueDate) {
  if (!dueDate) return { text: '', urgent: false };
  const diff = Math.ceil((new Date(dueDate) - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { text: 'Vencido', urgent: true };
  if (diff === 0) return { text: 'Vence hoy', urgent: true };
  if (diff <= 7) return { text: `Vence en ${diff} días`, urgent: true };
  return { text: `Vence en ${diff} días`, urgent: false };
}

function renderHeader(user, config) {
  // Colores
  const r = document.documentElement;
  if (config.primaryColor) r.style.setProperty('--primaryColor', config.primaryColor);
  if (config.secondaryColor) r.style.setProperty('--secondaryColor', config.secondaryColor);

  // Textos Perfil
  document.getElementById('profileName').textContent = user.fullName || 'Usuario';
  const roleEl = document.querySelector('.profile-card .role');
  if (roleEl) roleEl.textContent = user.role === 'employee' ? 'Colaborador' : user.role;

  // Avatar
  const avatarEl = document.querySelector('.avatar');
  if (avatarEl && user.fullName) {
    const initials = user.fullName.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase();
    avatarEl.innerHTML = `<span style="font-size: 2.5rem; font-weight: bold;">${initials}</span>`;
  }
}

function renderStats(assignments, logs) {
  const total = assignments.length;
  const completed = assignments.filter(a => a.status === 'completed' || a.progress === 100).length;
  const pending = total - completed;
  const percent = total > 0 ? Math.round((completed/total)*100) : 0;

  // Donut
  document.querySelector('.progress-text').textContent = `${percent}%`;
  const donutFg = document.querySelector('.progress-donut-fg');
  if(donutFg) donutFg.style.strokeDashoffset = 433.54 - (percent / 100) * 433.54;

  // Tarjetas
  const stats = document.querySelectorAll('.stat-card h3');
  if(stats[0]) stats[0].textContent = total;
  if(stats[1]) stats[1].textContent = completed;
  if(stats[2]) stats[2].textContent = pending;

  // Timeline
  const timeline = document.querySelector('.timeline');
  if(timeline && logs.length) {
    timeline.innerHTML = logs.map(l => 
      `<div class="timeline-item"><div class="timeline-content"><div class="timeline-date">${new Date(l.created_at).toLocaleDateString()}</div><p>${l.description}</p></div></div>`
    ).join('');
  }
}

function renderCourses(assignments) {
  // Procesar datos
  const courses = assignments.map(a => {
    const article = Array.isArray(a.articles) ? a.articles[0] : a.articles;
    if(!article) return null;
    return { ...article, progress: a.progress || 0, due_date: a.due_date, status: a.status };
  }).filter(Boolean);

  const paint = (list, containerId, msg) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!list.length) { el.innerHTML = `<p class="empty-msg">${msg}</p>`; return; }

    el.innerHTML = list.map(c => {
      const due = getDueDateStatus(c.due_date);
      const isUrgent = due.urgent && c.progress < 100;
      const isDone = c.progress === 100;
      
      const icon = isUrgent ? 'fa-exclamation-triangle' : (isDone ? 'fa-check-circle' : 'fa-clock');
      const statusClass = isUrgent ? 'urgent' : (isDone ? 'completed' : 'pending');
      const btnText = isDone ? 'Certificado' : (c.progress > 0 ? 'Continuar' : 'Iniciar');

      return `
      <div class="course-card" data-status="${statusClass}">
        <div class="course-icon-lg ${statusClass}"><i class="fas ${icon}"></i></div>
        <div class="course-info">
          <h3>${c.title}</h3>
          ${(due.text && !isDone) ? `<div class="meta-item ${isUrgent?'text-danger':''}"><i class="fas fa-calendar"></i> ${due.text}</div>` : ''}
          <div class="progress-bar-container"><div class="progress-bar-fill" style="width: ${c.progress}%"></div></div>
          <p class="text-xs">Progreso: ${c.progress}%</p>
        </div>
        <div class="course-actions"><a href="../curso/curso.html?id=${c.id}" class="btn btn-primary">${btnText}</a></div>
      </div>`;
    }).join('');
  };

  paint(courses.filter(c => c.progress < 100), 'assignedCoursesContainer', '¡Todo al día!');
  paint(courses.filter(c => c.progress === 100), 'completedCoursesContainer', 'Sin cursos completados.');
}

function renderBadges(all, myIds) {
  const el = document.querySelector('.badges-grid');
  if(!el) return;
  
  if(!all.length) { el.innerHTML = '<p>No hay insignias.</p>'; return; }
  
  el.innerHTML = all.map(b => 
    `<div class="badge ${myIds.has(b.id) ? 'earned' : ''}">
       <i class="${b.icon_class || 'fas fa-medal'}"></i>
       <span>${b.name}</span>
     </div>`
  ).join('');
}

function initListeners() {
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab, .tab-content').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById(t.dataset.tab)?.classList.add('active');
    });
  });
}

// ==========================================
// INICIALIZACIÓN MAESTRA
// ==========================================
(async () => {
  try {
    const supabase = await waitForSupabase();
    console.log('✅ Supabase listo');

    const user = await validateSessionAndRole(supabase);
    if (!user) { window.location.href = '../index.html'; return; }
    
    // Redirección si es admin
    if (['master', 'admin', 'supervisor'].includes(user.role)) {
      window.location.replace('../dashboard.html');
      return;
    }

    // Carga paralela de Config y Datos
    const [config, data] = await Promise.all([
      getTenantConfig(),
      fetchUserDashboardData(supabase, user.id)
    ]);

    // Renderizado
    renderHeader(user, config);
    if (data) {
      renderStats(data.assignments, data.logs);
      renderCourses(data.assignments);
      renderBadges(data.allBadges, data.myBadgesIds);
    }
    
    initListeners();
    document.body.classList.add('loaded');

  } catch (e) {
    console.error('❌ Error Fatal:', e);
    document.body.classList.add('loaded');
  }
})();