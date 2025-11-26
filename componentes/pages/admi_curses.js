(async () => {
        window.addEventListener('error', (e) => {
        console.error('🔥 ERROR GLOBAL:', e.error);
        console.error('🔥 Mensaje:', e.message);
        console.error('🔥 Stack:', e.error?.stack);
    });

    window.addEventListener('unhandledrejection', (e) => {
        console.error('🔥 PROMISE RECHAZADA:', e.reason);
    });
    // =================================================================
    // ESTADO GLOBAL
    // =================================================================
    let currentAdmin = null;
    let currentGroup = null;
    let allGroups = [];
    let groupMembers = [];
    let allCourses = []; 
    let selectedCoursesToAssign = [];

    // =================================================================
    // CONFIGURACIÓN TENANT & AUTH (CORREGIDA)
    // =================================================================
    const setStyle = (prop, value) => value && document.documentElement.style.setProperty(prop, value);

    async function loadTenantConfig() {
        const host = location.hostname === 'localhost' ? 'demo' : location.hostname.split('.')[0];
        const tenantId = (host === '127' || host === 'www') ? 'default' : host;
        let config = {};

        // 1. FIX: Ruta corregida ../../tenants/tenants.json
        try {
            const resp = await fetch('../../tenants/tenants.json');
            if (resp.ok) {
                const data = await resp.json();
                config = data[tenantId] || data['default'] || {};
            } else {
                console.warn(`⚠️ tenants.json no encontrado en ../../tenants/tenants.json (Status: ${resp.status})`);
            }
        } catch (e) { 
            console.warn('⚠️ Error cargando/parseando tenants.json:', e); 
        }

        // 2. Fallback a DB
        try {
            const { data: tDb } = await window.supabase
                .from('tenants')
                .select('id, name')
                .eq('slug', tenantId)
            
            if (tDb) {
                config.tenantUUID = tDb.id;
                if (!config.companyName) config.companyName = tDb.name;
            }
        } catch (e) {
            console.error('❌ Error crítico obteniendo Tenant ID de DB:', e);
        }

        // 3. Fallback visual final
        if (!config.companyName) config.companyName = tenantId.toUpperCase();
        
        return config;
    }

async function checkAuth(config) {
    // 1. Obtener usuario autenticado
    const { data: { user }, error: authError } = await window.supabase.auth.getUser();
    
    if (authError || !user) {
        console.error('❌ No autenticado:', authError);
        window.location.href = '../../index.html';
        return null;
    }

    console.log('✅ Usuario autenticado:', user.email);

    // 2. Obtener perfil (SIN .single() para evitar errores con RLS)
    const { data: rawData, error: profileError } = await window.supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id);

    if (profileError) {
        console.error('❌ Error obteniendo perfil:', profileError);
        alert('Error de permisos: No se pudo cargar tu perfil');
        window.location.href = '../../index.html';
        return null;
    }

    // 3. FIX: Manejar respuesta como array
    const profile = Array.isArray(rawData) ? rawData[0] : rawData;

    if (!profile) {
        alert('Error: Perfil no encontrado en la base de datos');
        window.location.href = '../../index.html';
        return null;
    }

    console.log('📋 Perfil cargado:', profile.role, profile.tenant_id);

    // 4. Verificar rol
    const allowedRoles = ['master', 'admin', 'supervisor'];
    if (!allowedRoles.includes(profile.role)) {
        alert('Acceso denegado: Necesitas ser Admin, Supervisor o Master');
        window.location.href = '../../profile/profile.html';
        return null;
    }

    console.log('✅ Acceso autorizado:', profile.role);
    return profile;
}

    // =================================================================
    // LOGICA DE DATOS
    // =================================================================

    async function fetchGroups() {
        // FIX: Evitar error 400 si tenant_id es null
        if (!currentAdmin.tenant_id) {
            console.warn('⛔ Usuario sin tenant_id, saltando fetchGroups');
            return [];
        }

        const { data, error } = await window.supabase
            .from('course_groups')
            .select('*')
            .eq('tenant_id', currentAdmin.tenant_id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching groups:', error);
            return [];
        }
        return data;
    }

    async function updateKPIs() {
        if (!currentAdmin.tenant_id) return;

        const { data, error } = await window.supabase
            .from('user_course_assignments')
            .select('status, due_date')
            .eq('tenant_id', currentAdmin.tenant_id);

        if (error) return;

        let completed = 0, active = 0, expired = 0;
        const now = new Date();

        data.forEach(a => {
            if (a.status === 'completed') completed++;
            else if (['in_progress', 'not_started'].includes(a.status)) active++;

            if (a.due_date && new Date(a.due_date) < now && a.status !== 'completed') {
                expired++;
            }
        });

        const total = data.length;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

        document.getElementById('kpi-completed').textContent = `${percent}%`;
        document.getElementById('kpi-active').textContent = active;
        document.getElementById('kpi-expired').textContent = expired;
        document.getElementById('kpi-urgent').textContent = expired; 
    }


    async function updateGlobalCompliance() {
        if (!currentAdmin.tenant_id) return;

        const { data } = await window.supabase
            .from('user_course_assignments')
            .select('status, due_date')
            .eq('tenant_id', currentAdmin.tenant_id);

        const badge = document.getElementById('compliance-badge');
        const valSpan = document.getElementById('compliance-value');

        if (!data || data.length === 0) {
            valSpan.textContent = '0%';
            badge.className = 'compliance-badge danger';
            return;
        }

        const completed = data.filter(a => a.status === 'completed').length;
        const percent = Math.round((completed / data.length) * 100);

        valSpan.textContent = `${percent}%`;
        
        // Reset y asignar nueva clase
        badge.className = 'compliance-badge'; 
        if (percent <= 50) badge.classList.add('danger');
        else if (percent <= 80) badge.classList.add('warning');
        else badge.classList.add('success');
    }

// =================================================================
// ESTADÍSTICAS POR GRUPO
// =================================================================
async function getGroupStats(groupId) {
    const { data: members } = await window.supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

    if (!members || members.length === 0) {
        return { completed: 0, inProgress: 0, expired: 0, completionRate: 0 };
    }

    const userIds = members.map(m => m.user_id);
    const now = new Date().toISOString();

    const { data: assignments } = await window.supabase
        .from('user_course_assignments')
        .select('status, due_date')
        .in('user_id', userIds);

    if (!assignments) return { completed: 0, inProgress: 0, expired: 0, completionRate: 0 };

    let completed = 0, inProgress = 0, expired = 0;

    assignments.forEach(a => {
        if (a.status === 'completed') completed++;
        else if (a.due_date && new Date(a.due_date) < new Date()) expired++;
        else inProgress++;
    });

    const total = assignments.length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { completed, inProgress, expired, completionRate };
}

// =================================================================
// DETALLE DE USUARIO
// =================================================================
let currentDetailUser = null;

window.openUserDetail = async (userId, userName) => {
    currentDetailUser = { id: userId, name: userName };
    document.getElementById('user-detail-name').textContent = userName;
    document.getElementById('user-detail-modal').classList.add('active');

    const summaryEl = document.getElementById('user-summary');
    const coursesEl = document.getElementById('user-courses-container');
    
    summaryEl.innerHTML = '<p>Cargando...</p>';
    coursesEl.innerHTML = '';

    const now = new Date();

    const { data: assignments } = await window.supabase
        .from('user_course_assignments')
        .select('*, articles(title)')
        .eq('user_id', userId);

    if (!assignments || assignments.length === 0) {
        summaryEl.innerHTML = '<p>Este usuario no tiene cursos asignados.</p>';
        return;
    }

    let completed = 0, inProgress = 0, expired = 0;
    const processed = assignments.map(a => {
        let displayStatus = a.status;
        if (a.status === 'completed') completed++;
        else if (a.due_date && new Date(a.due_date) < now) {
            expired++;
            displayStatus = 'expired';
        } else inProgress++;
        return { ...a, displayStatus };
    });

    summaryEl.innerHTML = `
        <div class="stat-box completed">
            <div class="stat-value">${completed}</div>
            <div>Completados</div>
        </div>
        <div class="stat-box in-progress">
            <div class="stat-value">${inProgress}</div>
            <div>En Progreso</div>
        </div>
        <div class="stat-box expired">
            <div class="stat-value">${expired}</div>
            <div>Vencidos</div>
        </div>
    `;

    const statusLabels = {
        completed: 'Completado',
        in_progress: 'En Progreso',
        not_started: 'No Iniciado',
        expired: 'Vencido'
    };

    coursesEl.innerHTML = `
        <table class="user-courses-table">
            <thead>
                <tr>
                    <th>Curso</th>
                    <th>Progreso</th>
                    <th>Vencimiento</th>
                    <th>Estado</th>
                </tr>
            </thead>
            <tbody>
                ${processed.map(a => `
                    <tr>
                        <td>${a.articles?.title || 'Sin título'}</td>
                        <td>${a.progress || 0}%</td>
                        <td>${a.due_date ? new Date(a.due_date).toLocaleDateString() : '-'}</td>
                        <td><span class="status-badge ${a.displayStatus}">${statusLabels[a.displayStatus] || a.displayStatus}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
};

window.closeUserDetailModal = () => {
    document.getElementById('user-detail-modal').classList.remove('active');
    currentDetailUser = null;
};

window.sendReminder = async () => {
    if (!currentDetailUser) return;
    // TODO: Integrar con sistema de notificaciones/email
    showToast('Info', `Recordatorio enviado a ${currentDetailUser.name}`, 'success');
};

window.switchMainTab = (tabName) => {
    document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.main-tab[data-maintab="${tabName}"]`).classList.add('active');

    document.getElementById('main-view').style.display = 'none';
    document.getElementById('tracking-view').style.display = 'none';
    document.getElementById('detail-view').classList.remove('active');

    if (tabName === 'groups') {
        document.getElementById('main-view').style.display = 'block';
    } else if (tabName === 'tracking') {
        document.getElementById('tracking-view').style.display = 'block';
        loadTrackingData();
    }
};

// =================================================================
// SEGUIMIENTO DE USUARIOS
// =================================================================
let trackingData = [];

async function loadTrackingData() {
    const tbody = document.getElementById('tracking-tbody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';

    const { data: users } = await window.supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('tenant_id', currentAdmin.tenant_id)
        .order('full_name');

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">No hay usuarios</td></tr>';
        return;
    }

    const now = new Date();
    trackingData = [];

    for (const user of users) {
        const { data: assignments } = await window.supabase
            .from('user_course_assignments')
            .select('*, articles(title)')
            .eq('user_id', user.id);

        let completed = 0, inProgress = 0, expired = 0;
        const courses = [];

        (assignments || []).forEach(a => {
            let status = a.status;
            if (a.status === 'completed') {
                completed++;
            } else if (a.due_date && new Date(a.due_date) < now) {
                expired++;
                status = 'expired';
            } else {
                inProgress++;
            }
            courses.push({
                title: a.articles?.title || 'Sin título',
                progress: a.progress || 0,
                due_date: a.due_date,
                status: status
            });
        });

        const total = completed + inProgress + expired;
        const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;

        trackingData.push({
            id: user.id,
            name: user.full_name || 'Sin nombre',
            email: user.email,
            completed,
            inProgress,
            expired,
            compliance,
            courses
        });
    }

    renderTrackingTable();
}

function renderTrackingTable(filter = 'all', search = '') {
    const tbody = document.getElementById('tracking-tbody');
    
    let filtered = trackingData;

    if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(u => 
            u.name.toLowerCase().includes(s) || 
            u.email.toLowerCase().includes(s)
        );
    }

    if (filter !== 'all') {
        filtered = filtered.filter(u => {
            if (filter === 'completed') return u.completed > 0;
            if (filter === 'in_progress') return u.inProgress > 0;
            if (filter === 'expired') return u.expired > 0;
            return true;
        });
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">No se encontraron usuarios</td></tr>';
        return;
    }

    const statusLabels = {
        completed: 'Completado',
        in_progress: 'En Progreso',
        not_started: 'No Iniciado',
        expired: 'Vencido'
    };

    tbody.innerHTML = filtered.map((u, idx) => {
        const barClass = u.compliance <= 50 ? 'red' : u.compliance <= 80 ? 'yellow' : 'green';
        
        return `
        <tr class="user-row-main" onclick="toggleUserCourses(${idx})">
            <td><strong>${u.name}</strong></td>
            <td>${u.email}</td>
            <td class="text-center"><span class="stat-pill completed">${u.completed}</span></td>
            <td class="text-center"><span class="stat-pill in-progress">${u.inProgress}</span></td>
            <td class="text-center"><span class="stat-pill expired">${u.expired}</span></td>
            <td class="text-center">
                <div class="compliance-bar"><div class="compliance-bar-fill ${barClass}" style="width:${u.compliance}%"></div></div>
                ${u.compliance}%
            </td>
            <td><button class="expand-btn" id="expand-btn-${idx}"><i class="fas fa-chevron-down"></i></button></td>
        </tr>
        <tr class="user-courses-row" id="courses-row-${idx}">
            <td colspan="7">
                <div class="courses-detail">
                    <table>
                        <thead>
                            <tr>
                                <th>Curso</th>
                                <th>Progreso</th>
                                <th>Vencimiento</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${u.courses.length === 0 ? '<tr><td colspan="4">Sin cursos asignados</td></tr>' : 
                              u.courses.map(c => `
                                <tr>
                                    <td>${c.title}</td>
                                    <td>${c.progress}%</td>
                                    <td>${c.due_date ? new Date(c.due_date).toLocaleDateString() : '-'}</td>
                                    <td><span class="status-badge ${c.status}">${statusLabels[c.status] || c.status}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

window.toggleUserCourses = (idx) => {
    const row = document.getElementById(`courses-row-${idx}`);
    const btn = document.getElementById(`expand-btn-${idx}`);
    row.classList.toggle('expanded');
    btn.classList.toggle('expanded');
};

// =================================================================
// EXPORTAR A EXCEL
// =================================================================
window.exportToExcel = () => {
    if (trackingData.length === 0) {
        showToast('Alerta', 'No hay datos para exportar', 'warning');
        return;
    }

    // 1. Preparar los datos con las llaves en MAYÚSCULAS (UPPERCASE)
    const dataForExcel = [];

    trackingData.forEach(u => {
        if (u.courses.length === 0) {
            dataForExcel.push({
                "USUARIO": u.name,
                "EMAIL": u.email,
                "CURSO": "Sin cursos asignados",
                "PROGRESO": "0%",
                "VENCIMIENTO": "-",
                "ESTADO": "-"
            });
        } else {
            u.courses.forEach(c => {
                dataForExcel.push({
                    "USUARIO": u.name,
                    "EMAIL": u.email,
                    "CURSO": c.title,
                    "PROGRESO": c.progress + "%",
                    "VENCIMIENTO": c.due_date ? new Date(c.due_date).toLocaleDateString() : '-',
                    "ESTADO": c.status === 'completed' ? 'Completado' : 
                              c.status === 'expired' ? 'Vencido' : 'En Progreso'
                });
            });
        }
    });

    // 2. Crear la Hoja de Cálculo
    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);

    // 3. APLICAR ESTILO NEGRITA A LAS CABECERAS (Fila 1)
    // Obtenemos el rango de celdas de la hoja (ej: "A1:F10")
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    
    // Iteramos solo sobre la primera fila (r: 0) y todas las columnas (c)
    for (let C = range.s.c; C <= range.e.c; ++C) {
        const address = XLSX.utils.encode_cell({ r: 0, c: C }); // A1, B1, C1...
        if (!worksheet[address]) continue;
        
        // Aplicamos el objeto de estilo
        worksheet[address].s = {
            font: {
                bold: true,
                color: { rgb: "000000" } // Opcional: color negro
            },
            alignment: {
                horizontal: "center" // Opcional: centrar cabeceras
            }
        };
    }

    // 4. Ajustar ancho de columnas (Estético)
    const wscols = [
        { wch: 30 }, // USUARIO
        { wch: 35 }, // EMAIL
        { wch: 35 }, // CURSO
        { wch: 12 }, // PROGRESO
        { wch: 15 }, // VENCIMIENTO
        { wch: 15 }  // ESTADO
    ];
    worksheet['!cols'] = wscols;

    // 5. Crear libro y descargar
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Seguimiento");

    const fileName = `Reporte_Capacitacion_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    showToast('Éxito', 'Reporte Excel generado correctamente', 'success');
};

    async function renderGroups(filter = '') {
        const container = document.getElementById('groups-container');
        
        if (!currentAdmin.tenant_id) {
            container.innerHTML = `<div class="empty-state">
                <h3>⚠️ Configuración Incompleta</h3>
                <p>Tu usuario no tiene un Tenant ID asignado en la base de datos.</p>
            </div>`;
            return;
        }

        allGroups = await fetchGroups();

        const filtered = allGroups.filter(g => g.name.toLowerCase().includes(filter.toLowerCase()));

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-layer-group"></i></div>
                    <h3>No se encontraron grupos</h3>
                    <p>Crea uno nuevo para comenzar</p>
                </div>`;
            return;
        }

        const groupsHTML = await Promise.all(filtered.map(async (g) => {
            const { count } = await window.supabase
                .from('group_members')
                .select('*', { count: 'exact', head: true })
                .eq('group_id', g.id);
            
            const stats = await getGroupStats(g.id);
            
            return `
            <div class="group-card" onclick="window.viewGroupDetail('${g.id}')">
                <div class="group-header">
                    <div class="group-info">
                        <h3><i class="fas fa-folder"></i> ${g.name}</h3>
                        <div class="group-meta">
                            <span><i class="fas fa-users"></i> ${count || 0} miembros</span>
                            <span><i class="fas fa-chart-pie"></i> ${stats.completionRate}% completado</span>
                        </div>
                        <div class="group-stats">
                            <span class="group-stat completed">${stats.completed} ✓</span>
                            <span class="group-stat in-progress">${stats.inProgress} ◔</span>
                            <span class="group-stat expired">${stats.expired} ⚠</span>
                        </div>
                    </div>
                </div>
                <div class="group-actions">
                    <button class="btn btn-secondary">Ver Detalle</button>
                </div>
            </div>
            `;
        }));

        container.innerHTML = groupsHTML.join('');
    }

    window.viewGroupDetail = async (groupId) => {
        currentGroup = allGroups.find(g => g.id === groupId);
        if (!currentGroup) return;

        document.getElementById('main-view').style.display = 'none';
        document.getElementById('detail-view').classList.add('active');
        document.getElementById('detail-group-name').textContent = currentGroup.name;
        window.switchTab('users');
    };

    window.backToMain = () => {
        document.getElementById('detail-view').classList.remove('active');
        document.getElementById('main-view').style.display = 'block';
        currentGroup = null;
        renderGroups();
    };

    window.switchTab = (tabName) => {
        currentTab = tabName;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');

        document.getElementById('tab-users').style.display = 'none';
        document.getElementById('tab-courses').style.display = 'none';
        document.getElementById(`tab-${tabName}`).style.display = 'block';

        if (tabName === 'users') loadGroupMembers();
        if (tabName === 'courses') loadGroupCourses();
    };

async function loadGroupMembers() {
    const membersContainer = document.getElementById('users-list');
    const availableContainer = document.getElementById('available-users-list');
    
    membersContainer.innerHTML = '<div class="spinner"></div> Cargando...';
    availableContainer.innerHTML = '<div class="spinner"></div> Cargando...';

    // 1. Obtener miembros actuales del grupo
    const { data: members, error: membersError } = await window.supabase
        .from('group_members')
        .select('id, user_id, profiles (id, full_name, email)')
        .eq('group_id', currentGroup.id);

    if (membersError) {
        membersContainer.innerHTML = 'Error al cargar miembros';
        return;
    }
    
    groupMembers = members || [];
    const memberIds = groupMembers.map(m => m.user_id);

    // 2. Obtener todos los usuarios del tenant
    const { data: allUsers, error: usersError } = await window.supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('tenant_id', currentAdmin.tenant_id)
        .order('full_name');

    if (usersError) {
        availableContainer.innerHTML = 'Error al cargar usuarios';
        return;
    }

    // 3. Filtrar disponibles (no están en el grupo)
    const availableUsers = (allUsers || []).filter(u => !memberIds.includes(u.id));

    // 4. Renderizar miembros
    document.getElementById('members-count').textContent = groupMembers.length;
    
    if (groupMembers.length === 0) {
        membersContainer.innerHTML = '<div style="padding:1rem;color:var(--text-secondary);">Sin miembros</div>';
    } else {
        membersContainer.innerHTML = groupMembers.map(item => {
            const p = item.profiles;
            return `
            <div class="course-item" style="justify-content:space-between; cursor:pointer;" onclick="openUserDetail('${p.id}', '${p.full_name || p.email}')">
                <div class="course-details">
                    <div class="course-title">${p.full_name || 'Sin nombre'}</div>
                    <small>${p.email}</small>
                </div>
                <button class="btn btn-secondary" onclick="event.stopPropagation(); removeMember('${item.id}')" style="color:var(--danger);padding:0.3rem 0.6rem;">
                    <i class="fas fa-times"></i>
                </button>
            </div>`;
        }).join('');
    }

    // 5. Renderizar disponibles
    window.allAvailableUsers = availableUsers;
    renderAvailableUsers('');
}

function renderAvailableUsers(filter) {
    const container = document.getElementById('available-users-list');
    const filtered = window.allAvailableUsers.filter(u => 
        u.full_name?.toLowerCase().includes(filter.toLowerCase()) ||
        u.email?.toLowerCase().includes(filter.toLowerCase())
    );

    if (filtered.length === 0) {
        container.innerHTML = '<div style="padding:1rem;color:var(--text-secondary);">No hay usuarios disponibles</div>';
        return;
    }

    container.innerHTML = filtered.map(u => `
        <div class="course-item" onclick="addMemberById('${u.id}')" style="cursor:pointer;">
            <div class="course-details">
                <div class="course-title">${u.full_name || 'Sin nombre'}</div>
                <small>${u.email}</small>
            </div>
            <i class="fas fa-plus" style="color:var(--success);"></i>
        </div>
    `).join('');
}

window.addMemberByEmail = async () => {
    const email = document.getElementById('search-member-input').value.trim();
    if (!email) return showToast('Alerta', 'Ingresa un email', 'warning');

    console.log('🔍 Buscando email:', email);

    const { data: user, error } = await window.supabase
        .from('profiles')
        .select('id, tenant_id')
        .eq('email', email)
        .maybeSingle();  // 👈 Cambio aquí

    console.log('📦 Resultado:', { user, error });

    if (error) {
        console.error('❌ Error:', error);
        return showToast('Error', error.message, 'error');
    }

    if (!user) return showToast('Error', 'Usuario no encontrado o no pertenece a tu organización', 'error');
    
    if (user.tenant_id !== currentAdmin.tenant_id) {
        return showToast('Error', 'Usuario de otro tenant', 'error');
    }

    const { error: insertError } = await window.supabase
        .from('group_members')
        .insert({ group_id: currentGroup.id, user_id: user.id });

    if (insertError) {
        if (insertError.code === '23505') showToast('Info', 'El usuario ya está en el grupo', 'warning');
        else showToast('Error', insertError.message, 'error');
    } else {
        showToast('Éxito', 'Usuario agregado', 'success');
        document.getElementById('search-member-input').value = '';
        loadGroupMembers();
    }
};

    window.removeMember = async (recordId) => {
        if(!confirm('¿Quitar usuario del grupo?')) return;
        await window.supabase.from('group_members').delete().eq('id', recordId);
        loadGroupMembers();
    };

    window.addMemberById = async (userId) => {
    const { error } = await window.supabase
        .from('group_members')
        .insert({ group_id: currentGroup.id, user_id: userId });

    if (error) {
        if (error.code === '23505') showToast('Info', 'El usuario ya está en el grupo', 'warning');
        else showToast('Error', error.message, 'error');
    } else {
        showToast('Éxito', 'Usuario agregado', 'success');
        loadGroupMembers();
    }
};

    async function loadGroupCourses() {
        try {
            const { data, error } = await window.supabase
                .from('group_courses')
                .select(`
                    id,
                    course_id,
                    due_date,
                    articles (
                        id,
                        title,
                        instructor_name,
                        duration_text
                    )
                `)
                .eq('group_id', currentGroup.id);

            if (error) throw error;

            const container = document.getElementById('courses-list');
            if (!data || data.length === 0) {
                container.innerHTML = '<p style="color: var(--text-secondary); padding: 2rem; text-align: center;">No hay cursos asignados a este grupo.</p>';
                return;
            }

            container.innerHTML = data.map(gc => `
                <div class="course-item" style="justify-content: space-between;">
                    <div class="course-details">
                        <div class="course-title">${gc.articles.title}</div>
                        <small>${gc.articles.instructor_name || 'Sin instructor'} • ${gc.articles.duration_text || 'Sin duración'}</small>
                    </div>
                    <button class="btn btn-danger" onclick="removeGroupCourse('${gc.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `).join('');
        } catch (err) {
            console.error('Error cargando cursos del grupo:', err);
            showToast('Error', 'No se pudieron cargar los cursos', 'error');
        }
    }

    window.openNewGroupModal = async () => {
        if (!currentAdmin.tenant_id) return showToast('Error', 'No tienes tenant asignado', 'error');
        const name = prompt("Nombre del nuevo grupo:");
        if (!name) return;

        const { error } = await window.supabase
            .from('course_groups')
            .insert({ name: name, tenant_id: currentAdmin.tenant_id });

        if (error) showToast('Error', error.message, 'error');
        else {
            showToast('Éxito', 'Grupo creado', 'success');
            renderGroups();
        }
    };

    window.openAssignModal = async () => {
        if (!currentGroup) return;
        document.getElementById('assign-modal').classList.add('active');
        
        const { data } = await window.supabase
            .from('articles')
            .select('id, title, duration_text')
            .eq('tenant_id', currentAdmin.tenant_id)
            .eq('status', 'published');
            
        allCourses = data || [];
        selectedCoursesToAssign = [];
        renderCatalog();
        updateSelectedList();
    };

    window.closeAssignModal = () => {
        document.getElementById('assign-modal').classList.remove('active');
    };

    function renderCatalog(filter = '') {
        const container = document.getElementById('catalog-list');
        const filtered = allCourses.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()));
        
        container.innerHTML = filtered.map(c => `
            <div class="course-item" onclick="toggleSelectCourse('${c.id}')">
                <input type="checkbox" ${selectedCoursesToAssign.find(s=>s.id===c.id)?'checked':''} pointer-events:none;">
                <div class="course-details">
                    <div class="course-title">${c.title}</div>
                    <small>${c.duration_text || ''}</small>
                </div>
            </div>
        `).join('');
    }

    window.toggleSelectCourse = (id) => {
        const exists = selectedCoursesToAssign.find(s => s.id === id);
        if (exists) {
            selectedCoursesToAssign = selectedCoursesToAssign.filter(s => s.id !== id);
        } else {
            const course = allCourses.find(c => c.id === id);
            selectedCoursesToAssign.push(course);
        }
        renderCatalog(document.getElementById('search-catalog').value);
        updateSelectedList();
    };

    function updateSelectedList() {
        const container = document.getElementById('selected-list');
        document.getElementById('selected-count').textContent = selectedCoursesToAssign.length;
        container.innerHTML = selectedCoursesToAssign.map(c => `
            <div class="selected-course-item">
                <strong>${c.title}</strong>
            </div>
        `).join('');
    }

window.confirmAssignment = async () => {
        // 1. Validaciones básicas
        if (selectedCoursesToAssign.length === 0) return showToast('Alerta', 'Selecciona cursos', 'warning');
        
        if (!groupMembers || groupMembers.length === 0) {
             await loadGroupMembers();
             if (groupMembers.length === 0) return showToast('Alerta', 'El grupo no tiene miembros', 'warning');
        }

        // 2. Preparar los IDs para verificar duplicados
        const userIds = groupMembers.map(m => m.profiles.id);
        const courseIds = selectedCoursesToAssign.map(c => c.id);

        try {
            // 3. Consultar qué asignaciones ya existen en la BD
            const { data: existing, error: queryError } = await window.supabase
                .from('user_course_assignments')
                .select('user_id, course_id')
                .in('user_id', userIds)
                .in('course_id', courseIds);

            if (queryError) throw queryError;

            // Crear un Set para búsqueda rápida (formato "userId-courseId")
            const existingSet = new Set(existing.map(e => `${e.user_id}-${e.course_id}`));

            // 4. Filtrar: Solo crear asignaciones que NO estén en el Set
            const assignmentsToInsert = [];
            const now = new Date();
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 30);

            groupMembers.forEach(member => {
                selectedCoursesToAssign.forEach(course => {
                    const key = `${member.profiles.id}-${course.id}`;
                    
                    // Solo agregamos si NO existe
                    if (!existingSet.has(key)) {
                        assignmentsToInsert.push({
                            user_id: member.profiles.id,
                            course_id: course.id,
                            tenant_id: currentAdmin.tenant_id,
                            status: 'not_started',
                            progress: 0,
                            assigned_at: now.toISOString(),
                            due_date: dueDate.toISOString()
                        });
                    }
                });
            });

            // 5. Verificar si hay algo que insertar
            if (assignmentsToInsert.length === 0) {
                showToast('Info', 'Todos los usuarios seleccionados ya tienen estos cursos asignados.', 'warning');
                closeAssignModal();
                return;
            }

            // 6. Insertar solo los nuevos (usando insert normal, ya no upsert)
            const { error: insertError } = await window.supabase
                .from('user_course_assignments')
                .insert(assignmentsToInsert);

            if (insertError) throw insertError;

            showToast('Éxito', `Se asignaron ${assignmentsToInsert.length} cursos nuevos.`, 'success');
            closeAssignModal();

        } catch (error) {
            console.error(error);
            showToast('Error', 'Hubo un problema al asignar los cursos', 'error');
        }
    };

    window.removeGroupCourse = async (groupCourseId) => {
    if (!confirm('¿Eliminar este curso del grupo? Se quitará la asignación a todos los miembros.')) return;
    
    try {
        const { error } = await window.supabase
            .from('group_courses')
            .delete()
            .eq('id', groupCourseId);

        if (error) throw error;
        
        showToast('Éxito', 'Curso eliminado del grupo', 'success');
        await loadGroupCourses();
    } catch (err) {
        console.error('Error:', err);
        showToast('Error', 'No se pudo eliminar el curso', 'error');
    }
};

// Modificar openAssignModal (reemplazar desde línea ~477)
window.openAssignModal = async () => {
    if (!currentGroup) return;
    document.getElementById('assign-modal').classList.add('active');
    
    // Cargar catálogo completo
    const { data: allCoursesData } = await window.supabase
        .from('articles')
        .select('id, title, duration_text, instructor_name')
        .eq('tenant_id', currentAdmin.tenant_id)
        .eq('status', 'published');
        
    // Cargar cursos ya asignados al grupo
    const { data: assignedCourses } = await window.supabase
        .from('group_courses')
        .select('course_id')
        .eq('group_id', currentGroup.id);

    const assignedIds = assignedCourses?.map(c => c.course_id) || [];
    
    // Filtrar solo los disponibles
    allCourses = (allCoursesData || []).filter(c => !assignedIds.includes(c.id));
    selectedCoursesToAssign = [];
    
    renderCatalog();
    updateSelectedList();
};

// Modificar confirmAssignment (reemplazar desde línea ~530)
window.confirmAssignment = async () => {
    if (selectedCoursesToAssign.length === 0) {
        return showToast('Alerta', 'Selecciona al menos un curso', 'warning');
    }

    try {
        // Insertar en group_courses (el trigger se encarga de asignar a usuarios)
        const inserts = selectedCoursesToAssign.map(course => ({
            group_id: currentGroup.id,
            course_id: course.id
        }));

        const { error } = await window.supabase
            .from('group_courses')
            .insert(inserts);

        if (error) throw error;

        showToast('Éxito', `${selectedCoursesToAssign.length} curso(s) asignado(s) al grupo`, 'success');
        closeAssignModal();
        await loadGroupCourses();
    } catch (err) {
        console.error('Error:', err);
        showToast('Error', 'No se pudieron asignar los cursos', 'error');
    }
};

    function showToast(title, msg, type) {
        const container = document.getElementById('toast-container');
        const div = document.createElement('div');
        div.className = `toast ${type}`;
        div.innerHTML = `<strong>${title}</strong>: ${msg}`;
        container.appendChild(div);
        setTimeout(() => div.remove(), 3000);
    }

    // =================================================================
    // INIT
    // =================================================================
async function init() {
    try {
        console.log('🚀 Iniciando aplicación...');

        // 1. Cargar configuración
        const config = await loadTenantConfig();
        console.log('✅ Config cargada:', config);
        
        if (config.primaryColor) setStyle('--primaryColor', config.primaryColor);
        if (config.secondaryColor) setStyle('--secondaryColor', config.secondaryColor);
        
        // 2. Chequear Auth
        console.log('🔐 Verificando autenticación...');
        currentAdmin = await checkAuth(config);
        if (!currentAdmin) {
            console.error('❌ checkAuth devolvió null, deteniendo...');
            return;
        }

        // 3. FIX: "Patch" para Master sin tenant_id
        if (!currentAdmin.tenant_id && currentAdmin.role === 'master' && config.tenantUUID) {
            console.log('🔧 Asignando Tenant ID del contexto al usuario Master');
            currentAdmin.tenant_id = config.tenantUUID;
        }
        
        console.log('✅ Admin autenticado:', currentAdmin);
        
        // 4. Validar que tenant_id existe antes de cargar datos
        if (!currentAdmin.tenant_id) {
            console.error('❌ Admin sin tenant_id después del patch');
            alert('Error de configuración: Tu usuario no tiene tenant asignado');
            return;
        }

        // 5. Cargar datos
        console.log('📊 Cargando KPIs...');
        await updateKPIs();
        
        console.log('📈 Cargando compliance...');
        await updateGlobalCompliance();
        
        console.log('📁 Cargando grupos...');
        await renderGroups();

        console.log('✅ Aplicación lista');
        document.body.style.opacity = 1;

    } catch (error) {
        console.error('🔥 ERROR CRÍTICO EN INIT:', error);
        console.error('Stack:', error.stack);
        alert('Error crítico al cargar la aplicación. Ver consola (F12).');
    }
}

    document.getElementById('search-groups').addEventListener('input', (e) => renderGroups(e.target.value));
    document.getElementById('search-users-tracking')?.addEventListener('input', (e) => {
    renderTrackingTable(document.getElementById('filter-status').value, e.target.value);
    });

    document.getElementById('filter-status')?.addEventListener('change', (e) => {
        renderTrackingTable(e.target.value, document.getElementById('search-users-tracking').value);
    });
    document.getElementById('search-available')?.addEventListener('input', (e) => renderAvailableUsers(e.target.value));
    document.getElementById('search-catalog').addEventListener('input', (e) => renderCatalog(e.target.value));

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();