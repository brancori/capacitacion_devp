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
// RECUPERACIÓN DE SESIÓN (IGUAL QUE EN users.html)
// =================================================================
async function recoverSession() {
    console.log('🔄 [SESSION] Intentando recuperar sesión...');
    
    // 1. Verificar si ya hay sesión activa
    let { data: { user }, error } = await window.supabase.auth.getUser();
    
    if (user && !error) {
        console.log('✅ [SESSION] Sesión activa encontrada:', user.email);
        return user;
    }
    
    console.warn('⚠️ [SESSION] Sesión perdida. Buscando token de respaldo...');
    
    // 2. Buscar token en localStorage
    const tokenKey = Object.keys(window.localStorage || {}).find(k => 
        k.startsWith('sb-') && k.endsWith('-auth-token')
    );
    
    if (!tokenKey) {
        console.error('❌ [SESSION] No se encontró token de respaldo');
        return null;
    }
    
    console.log('🔑 [SESSION] Token encontrado:', tokenKey);
    
    try {
        const tokenStr = window.localStorage.getItem(tokenKey);
        if (!tokenStr) {
            console.error('❌ [SESSION] Token vacío');
            return null;
        }
        
        const token = JSON.parse(tokenStr);
        console.log('📦 [SESSION] Token parseado:', {
            hasAccessToken: !!token.access_token,
            hasRefreshToken: !!token.refresh_token
        });
        
        // 3. Restaurar sesión
        const { data: recovered, error: recoverError } = await window.supabase.auth.setSession({
            access_token: token.access_token,
            refresh_token: token.refresh_token
        });
        
        if (recoverError) {
            console.error('❌ [SESSION] Error restaurando:', recoverError);
            return null;
        }
        
        if (recovered.user) {
            console.log('✅ [SESSION] ¡Sesión rescatada!:', recovered.user.email);
            return recovered.user;
        }
        
        console.error('❌ [SESSION] Sesión restaurada pero sin usuario');
        return null;
        
    } catch (e) {
        console.error('❌ [SESSION] Error en recuperación:', e);
        return null;
    }
}

async function checkAuth(config) {
    try {
        console.log('🔐 [1/5] Obteniendo usuario autenticado...');
        
        // ═══════════════════════════════════════════════════════════
        // 🔥 NUEVO: Intentar recuperar sesión ANTES de verificar
        // ═══════════════════════════════════════════════════════════
        let user = await recoverSession();
        
        if (!user) {
            console.error('❌ [1/5] No se pudo recuperar sesión');
            alert('Sesión expirada. Redirigiendo al login...');
            setTimeout(() => window.location.href = '../../index.html', 2000);
            return null;
        }
        

        console.log('✅ [1/5] Usuario autenticado:', user.email);
        console.log('📋 User ID:', user.id);

        // 2. Obtener perfil
        console.log('🔐 [2/5] Consultando perfil en BD...');
        
        const { data: rawData, error: profileError } = await window.supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id);

        console.log('📦 [2/5] Respuesta cruda:', { rawData, profileError });

        if (profileError) {
            console.error('❌ [2/5] Error obteniendo perfil:', profileError);
            console.error('Código de error:', profileError.code);
            console.error('Mensaje:', profileError.message);
            console.error('Detalles:', profileError.details);
            alert('ERROR PERFIL: ' + JSON.stringify(profileError, null, 2));
            // ⚠️ COMENTADO TEMPORALMENTE PARA DEBUG
            // window.location.href = '../../index.html';
            return null;
        }

        // 3. Procesar respuesta
        console.log('🔐 [3/5] Procesando respuesta...');
        console.log('¿Es array?:', Array.isArray(rawData));
        console.log('Longitud:', rawData?.length);
        
        const profile = Array.isArray(rawData) ? rawData[0] : rawData;

        console.log('📋 [3/5] Perfil procesado:', profile);

        if (!profile) {
            console.error('❌ [3/5] Perfil vacío o null');
            alert('ERROR: Perfil no encontrado en BD');
            // ⚠️ COMENTADO TEMPORALMENTE PARA DEBUG
            // window.location.href = '../../index.html';
            return null;
        }

        console.log('✅ [3/5] Perfil encontrado');
        console.log('   - Role:', profile.role);
        console.log('   - Tenant ID:', profile.tenant_id);
        console.log('   - Email:', profile.email);

        // 4. Verificar rol
        console.log('🔐 [4/5] Verificando permisos...');
        
        const allowedRoles = ['master', 'admin', 'supervisor'];
        const hasPermission = allowedRoles.includes(profile.role);
        
        console.log('   - Rol del usuario:', profile.role);
        console.log('   - Roles permitidos:', allowedRoles);
        console.log('   - ¿Tiene permiso?:', hasPermission);

        if (!hasPermission) {
            console.error('❌ [4/5] Rol insuficiente:', profile.role);
            alert('ACCESO DENEGADO: Tu rol es "' + profile.role + '". Se requiere: admin, supervisor o master');
            // ⚠️ COMENTADO TEMPORALMENTE PARA DEBUG
            // window.location.href = '../../profile/profile.html';
            return null;
        }

        console.log('✅ [4/5] Permisos verificados correctamente');
        console.log('✅ [5/5] Acceso autorizado:', profile.role);
        
        return profile;

    } catch (error) {
        console.error('🔥 [ERROR CATCH] Error inesperado:', error);
        console.error('Stack:', error.stack);
        alert('ERROR CRÍTICO: ' + error.message);
        return null;
    }
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
        .select('status, due_date')
        .eq('group_id', groupId)
        .eq('assignment_status', 'active');

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
        .eq('user_id', userId)
        .eq('assignment_status', 'active');

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
    document.getElementById('analytics-view').style.display = 'none'; // NUEVO
    document.getElementById('detail-view').classList.remove('active');

    if (tabName === 'groups') {
        document.getElementById('main-view').style.display = 'block';
    } else if (tabName === 'tracking') {
        document.getElementById('tracking-view').style.display = 'block';
        loadTrackingData();
    } else if (tabName === 'analytics') { // NUEVO BLOQUE
        document.getElementById('analytics-view').style.display = 'block';
        loadCourseAnalytics();
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

        const { data: memberships } = await window.supabase
        .from('group_members')
        .select('user_id, course_groups(name)') // Join con course_groups
        .not('course_groups', 'is', null);

        const userGroupsMap = {};
    if(memberships) {
        memberships.forEach(m => {
            if(!userGroupsMap[m.user_id]) userGroupsMap[m.user_id] = [];
            if(m.course_groups) userGroupsMap[m.user_id].push(m.course_groups.name);
        });
    }

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
            .eq('user_id', user.id)
            .eq('assignment_status', 'active');

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
            groups: userGroupsMap[user.id] || [],
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

    // Filtro de texto
    if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(u => 
            u.name.toLowerCase().includes(s) || 
            u.email.toLowerCase().includes(s)
        );
    }

    // Filtro de estado
    if (filter !== 'all') {
        filtered = filtered.filter(u => {
            if (filter === 'completed') return u.completed > 0;
            if (filter === 'in_progress') return u.inProgress > 0;
            if (filter === 'expired') return u.expired > 0;
            return true;
        });
    }

    if (filtered.length === 0) {
        // NOTA: colspan="8" porque agregamos la columna de grupos
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">No se encontraron usuarios</td></tr>';
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
        
        // Generamos los badges de los grupos
        const groupsHtml = u.groups && u.groups.length > 0
            ? u.groups.map(g => `<span class="group-badge">${g}</span>`).join('')
            : '<span style="color:#ccc;font-size:0.8rem;">Sin grupo</span>';

        return `
        <tr class="user-row-main" onclick="toggleUserCourses(${idx})">
            <td><strong>${u.name}</strong></td>
            <td>${u.email}</td>
            
            <td>
                <div class="group-tags">
                    ${groupsHtml}
                </div>
            </td>
            
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
            <td colspan="8"> <div class="courses-detail">
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
                    
            // ... (tu lógica existente de conteo y stats se mantiene igual) ...
            const { data: memberData } = await window.supabase
                .from('group_members')
                .select('id')
                .eq('group_id', g.id);
            const memberCount = memberData ? memberData.length : 0; 
            const stats = await getGroupStats(g.id);
            
            // --- NUEVO: Lógica para mostrar botón eliminar ---
            // Permitir a master, admin y supervisor
            const canDelete = ['master', 'admin', 'supervisor'].includes(currentAdmin.role);
            
            const deleteBtnHTML = canDelete ? `
                <button class="btn-delete-group" 
                        onclick="event.stopPropagation(); window.deleteGroup('${g.id}', '${g.name}')" 
                        title="Eliminar Grupo">
                    <i class="fas fa-trash-alt"></i>
                </button>
            ` : '';
            // ------------------------------------------------

            return `
            <div class="group-card" onclick="window.viewGroupDetail('${g.id}')">
                <div class="group-header">
                    <div class="group-info">
                        <h3><i class="fas fa-folder"></i> ${g.name}</h3>
                        <div class="group-meta">
                            <span><i class="fas fa-users"></i> ${memberCount} miembros</span>
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
                    ${deleteBtnHTML}
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

window.toggleDateInput = (type) => {
    document.getElementById('opt-days').classList.toggle('active', type === 'days');
    document.getElementById('opt-date').classList.toggle('active', type === 'date');
    
    document.getElementById('input-days-container').style.display = type === 'days' ? 'flex' : 'none';
    document.getElementById('input-date-container').style.display = type === 'date' ? 'flex' : 'none';
};

window.confirmAssignment = async () => {
    if (selectedCoursesToAssign.length === 0) {
        return showToast('Alerta', 'Selecciona al menos un curso', 'warning');
    }

    // 1. Calcular Fecha de Vencimiento
    const dateMode = document.querySelector('input[name="dueDateType"]:checked').value;
    let finalDueDate = null;

    if (dateMode === 'days') {
        const days = parseInt(document.getElementById('due-days').value) || 15;
        const d = new Date();
        d.setDate(d.getDate() + days);
        finalDueDate = d.toISOString();
    } else {
        const pickedDate = document.getElementById('due-date-picker').value;
        if (!pickedDate) return showToast('Alerta', 'Selecciona una fecha válida', 'warning');
        finalDueDate = new Date(pickedDate).toISOString();
    }

    try {
        // 2. Insertar en group_courses INCLUYENDO due_date
        const inserts = selectedCoursesToAssign.map(course => ({
            group_id: currentGroup.id,
            course_id: course.id,
            due_date: finalDueDate // <--- Aquí va la fecha calculada
        }));

        const { error } = await window.supabase
            .from('group_courses')
            .insert(inserts);

        if (error) throw error;

        showToast('Éxito', `${selectedCoursesToAssign.length} curso(s) asignado(s) con vencimiento actualizado`, 'success');
        closeAssignModal();
        await loadGroupCourses();
    } catch (err) {
        console.error('Error:', err);
        // Manejo específico de llave duplicada
        if (err.code === '23505') {
            showToast('Info', 'Algunos cursos ya estaban asignados a este grupo (se ignora duplicado)', 'warning');
            closeAssignModal();
        } else {
            showToast('Error', 'No se pudieron asignar los cursos', 'error');
        }
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

// Función para eliminar grupo
window.deleteGroup = async (groupId, groupName) => {
    // 1. Confirmación de seguridad
    if (!confirm(`⚠️ ¿Estás seguro de eliminar el grupo "${groupName}"?\n\nEsta acción eliminará todas las asignaciones y desvinculará a los miembros permanentemente.`)) {
        return;
    }

    try {
        // 2. Eliminar de course_groups (El CASCADE de SQL limpiará members y courses)
        const { error } = await window.supabase
            .from('course_groups')
            .delete()
            .eq('id', groupId);

        if (error) throw error;

        // 3. Feedback y recarga
        showToast('Éxito', 'Grupo eliminado correctamente', 'success');
        
        // Si estábamos viendo el detalle de ese grupo, volver al inicio
        if (currentGroup && currentGroup.id === groupId) {
            backToMain();
        } else {
            renderGroups(); // Recargar la lista
        }

    } catch (err) {
        console.error('Error eliminando grupo:', err);
        showToast('Error', 'No se pudo eliminar el grupo', 'error');
    }
};

    // =================================================================
    // INIT
    // =================================================================
async function init() {
    try {
        console.log('⏳ Esperando cliente Supabase...');
        let attempts = 0;
        
        // Esperamos a supabase Y a la configuración global (APP_CONFIG)
        while (!window.supabase || !window.APP_CONFIG) {
            if (attempts > 50) { 
                console.error('❌ Timeout esperando dependencias');
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        console.log('🚀 Iniciando aplicación de cursos...');

        // 1. USAR CONFIGURACIÓN GLOBAL
        const config = window.APP_CONFIG;
        
        // 2. Actualizar título visualmente (Usando la config global)
        const companyNameEl = document.getElementById('companyName');
        if(companyNameEl) {
            companyNameEl.innerHTML = `<i class="fas fa-graduation-cap"></i> ${config.companyName || 'Admin Cursos'}`;
        }

        // 3. Chequear Auth
        console.log('🔐 Verificando autenticación...');
        // Pasamos config a checkAuth por si lo necesita para validar tenantUUID
        currentAdmin = await checkAuth(config); 
        
        if (!currentAdmin) return;
        
        window.currentAdmin = currentAdmin;

        // 4. Lógica de Tenant para Master
        const isMaster = currentAdmin.role === 'master';
        if (!isMaster && !currentAdmin.tenant_id) {
            // Usamos showToast en lugar de alert para ser consistentes
            if(window.showToast) showToast('Error', 'Tu cuenta no tiene tenant asignado', 'error');
            return;
        }

        // Master usa el tenant del subdomain actual (si aplica)
        if (isMaster && config.tenantUUID) {
            currentAdmin.tenant_id = config.tenantUUID;
        }

        // 5. Cargar datos iniciales
        await updateKPIs();
        await updateGlobalCompliance();
        await renderGroups();

        console.log('✅ Aplicación de cursos lista');
        
        // Mostrar contenido suavemente
        document.body.style.opacity = 1;

    } catch (error) {
        console.error('🔥 ERROR CRÍTICO EN INIT:', error);
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

async function loadCourseAnalytics() {
    // Usamos window.currentAdmin para evitar el error de "not defined"
    const admin = window.currentAdmin; 
    
    const tbody = document.getElementById('analytics-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center"><i class="fas fa-spinner fa-spin"></i> Analizando datos...</td></tr>';

    if (!admin || !admin.tenant_id) {
        console.error("No hay usuario administrador activo");
        return;
    }

    try {
        // 1. Obtener todos los cursos del tenant
        const { data: courses } = await window.supabase
            .from('articles')
            .select('id, title, instructor_name')
            .eq('tenant_id', admin.tenant_id);

        // 2. Obtener todas las asignaciones
        const { data: assignments } = await window.supabase
            .from('user_course_assignments')
            .select('course_id, status, score, assigned_at, completed_at, progress')
            .eq('tenant_id', admin.tenant_id); // Usamos admin.tenant_id

        if (!courses || !assignments) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No hay datos disponibles</td></tr>';
            return;
        }

        // 3. Procesar Métricas
        const stats = {};
        
        courses.forEach(c => {
            stats[c.id] = {
                title: c.title,
                instructor: c.instructor_name || '-',
                assigned: 0,
                completed: 0,
                totalScore: 0,
                scoreCount: 0,
                totalTimeMs: 0,
                timeCount: 0
            };
        });

        assignments.forEach(a => {
            if (stats[a.course_id]) {
                stats[a.course_id].assigned++;
                
                if (a.status === 'completed' || (a.score && a.score >= 8)) {
                    stats[a.course_id].completed++;
                    if (a.score) {
                        stats[a.course_id].totalScore += Number(a.score);
                        stats[a.course_id].scoreCount++;
                    }
                    if (a.completed_at && a.assigned_at) {
                        const diff = new Date(a.completed_at) - new Date(a.assigned_at);
                        if (diff > 0) {
                            stats[a.course_id].totalTimeMs += diff;
                            stats[a.course_id].timeCount++;
                        }
                    }
                }
            }
        });

        // 4. Renderizar
        const rows = Object.values(stats).map(s => {
            const completionRate = s.assigned > 0 ? Math.round((s.completed / s.assigned) * 100) : 0;
            const avgScore = s.scoreCount > 0 ? (s.totalScore / s.scoreCount).toFixed(1) : '-';
            
            let avgTimeStr = '-';
            if (s.timeCount > 0) {
                const ms = s.totalTimeMs / s.timeCount;
                const hours = Math.round(ms / (1000 * 60 * 60));
                avgTimeStr = hours > 24 ? `${Math.round(hours/24)} días` : `${hours} hrs`;
            }

            let scoreClass = '';
            if (avgScore !== '-') scoreClass = avgScore >= 9 ? 'score-good' : avgScore >= 8 ? 'score-avg' : 'score-bad';

            return `
            <tr>
                <td><strong>${s.title}</strong></td>
                <td><small>${s.instructor}</small></td>
                <td class="text-center">${s.assigned}</td>
                <td class="text-center">
                    <div class="compliance-bar"><div class="compliance-bar-fill ${completionRate >= 80 ? 'green' : 'yellow'}" style="width:${completionRate}%"></div></div>
                    ${completionRate}%
                </td>
                <td class="text-center ${scoreClass}">${avgScore}</td>
                <td class="text-center">${avgTimeStr}</td>
                <td class="text-center">
                    ${completionRate >= 80 && avgScore >= 9 ? ' Excelente' : 
                      completionRate < 50 ? '<i class="fas fa-exclamation-circle" style="color:var(--danger)"></i> Revisar' : 'Normal'}
                </td>
            </tr>`;
        });

        tbody.innerHTML = rows.join('');
        
        // Reinicializar listener de búsqueda para evitar duplicados
        const searchInput = document.getElementById('search-analytics');
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        
        newSearchInput.addEventListener('keyup', (e) => {
            const term = e.target.value.toLowerCase();
            const trs = tbody.querySelectorAll('tr');
            trs.forEach(tr => {
                tr.style.display = tr.innerText.toLowerCase().includes(term) ? '' : 'none';
            });
        });

    } catch (e) {
        console.error('Error analítica:', e);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error cargando datos</td></tr>';
    }
}