/* Lógica del Portal EH&S */

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let safeDays = [];
let agendaData = {}; 
let selectedDateForModal = null; 

// Cargar datos persistentes
try {
    safeDays = JSON.parse(localStorage.getItem('safeDays') || '[]');
    agendaData = JSON.parse(localStorage.getItem('agendaData') || '{}');
} catch (e) {
    console.error("Error al leer localStorage:", e);
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// ---  FUNCIÓN CRÍTICA: Esperar a que Supabase cargue ---
function waitForSupabase() {
    return new Promise((resolve) => {
        // 1. Si ya existe, devolver inmediatamente
        if (typeof window.supabase !== 'undefined' && typeof window.supabase.auth !== 'undefined') {
            return resolve(window.supabase);
        }
        console.log(" Esperando a Supabase...");
        // 2. Si no, revisar cada 100ms hasta que aparezca
        const check = setInterval(() => {
            if (typeof window.supabase !== 'undefined' && typeof window.supabase.auth !== 'undefined') {
                clearInterval(check);
                console.log(" Supabase cargado.");
                resolve(window.supabase);
            }
        }, 100);
    });
}

document.addEventListener('DOMContentLoaded', async () => {

    const sb = await waitForSupabase();
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');

    if (urlToken && typeof supabase !== 'undefined') {
        console.log(" Recuperando sesión desde URL (Mobile fix)");
        await sb.auth.setSession({
                    access_token: urlToken,
                    refresh_token: 'dummy-refresh-token'
                });
        // Limpiar URL
        window.history.replaceState({}, '', window.location.pathname);
    }

    renderCalendar();
    updateAccidentFreeDays();
    updateDateDisplay();
    loadTrainingKPIs();

    try {
        if (window.tenantManager) {
            const config = await window.tenantManager.loadFromJson({ path: './tenants/tenants.json' });
            window.tenantManager.applyStyles(config);
            if (config && config.logoText) document.title = `${config.logoText} - Portal EH&S`;
        }
    } catch (err) { console.warn("Error Tenant:", err); }

    try {
        if (typeof supabase !== 'undefined') {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) loadUserInfo(user);
        }
    } catch (err) {}

    document.getElementById('markSafeDay')?.addEventListener('click', markSafeDay);
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        if(typeof supabase !== 'undefined') await supabase.auth.signOut();
        window.location.href = 'index.html';
    });
});

// --- UI Calendar & Modal ---

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const display = document.getElementById('monthDisplay');
    if (!grid || !display) return;

    grid.innerHTML = '';
    display.textContent = `${MONTHS[currentMonth]} ${currentYear}`;

    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    let padding = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    for(let i=0; i<padding; i++) {
        grid.appendChild(createCell('empty'));
    }

    const today = new Date();
    for(let i=1; i<=daysInMonth; i++) {
        const cell = createCell('day', i);
        const dStr = formatDateStr(currentYear, currentMonth + 1, i);
        
        if (safeDays.includes(dStr)) cell.classList.add('safe');
        if (i === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()) cell.classList.add('today');
        
        if (agendaData[dStr] && agendaData[dStr].length > 0) {
            const dot = document.createElement('div');
            dot.className = 'agenda-dot';
            cell.appendChild(dot);
        }

        cell.onclick = () => openDayModal(i);
        grid.appendChild(cell);
    }
}

function createCell(type, content) {
    const div = document.createElement('div');
    div.className = `day-cell ${type}`;
    if(content) div.textContent = content;
    return div;
}

function openDayModal(day) {
    selectedDateForModal = formatDateStr(currentYear, currentMonth + 1, day);
    document.getElementById('dayModalTitle').textContent = `Gestión: ${day} de ${MONTHS[currentMonth]}`;
    renderAgendaList();
    document.getElementById('dayActionModal').style.display = 'flex';
}

function closeDayModal() {
    document.getElementById('dayActionModal').style.display = 'none';
}

function renderAgendaList() {
    const list = document.getElementById('agendaList');
    list.innerHTML = '';
    const items = agendaData[selectedDateForModal] || [];
    
    if (items.length === 0) {
        list.innerHTML = '<li style="color:#999; padding:0.5rem;">Sin compromisos agendados.</li>';
        return;
    }

    items.forEach(task => {
        const li = document.createElement('li');
        li.className = 'agenda-item';
        li.innerHTML = `<span>${task}</span> <i class="fas fa-check-circle" style="color:#ccc;"></i>`;
        list.appendChild(li);
    });
}

function addCommitment() {
    const input = document.getElementById('newCommitmentInput');
    const text = input.value.trim();
    if (!text) return;

    if (!agendaData[selectedDateForModal]) {
        agendaData[selectedDateForModal] = [];
    }
    
    agendaData[selectedDateForModal].push(text);
    localStorage.setItem('agendaData', JSON.stringify(agendaData));
    
    input.value = '';
    renderAgendaList();
    renderCalendar();
}

function triggerReportFromDay(type) {
    closeDayModal();
    const reportModal = document.getElementById('recordFormModal');
    const dateInput = document.getElementById('eventDateInput');
    if (dateInput) dateInput.value = selectedDateForModal;
    
    const typeSelect = document.getElementById('eventType');
    if (typeSelect) {
        if (type === 'unsafe_act') {
             let opt = Array.from(typeSelect.options).find(o => o.value === 'unsafe_act');
             if(!opt) {
                 opt = document.createElement('option');
                 opt.value = 'unsafe_act'; opt.text = 'Acto Inseguro';
                 typeSelect.add(opt);
             }
             typeSelect.value = 'unsafe_act';
        } else {
            typeSelect.value = type;
        }
    }
    reportModal.style.display = 'flex';
}

// --- Nueva Función Top: Exportar PDF Simulado ---
function exportExecutiveReport() {
    const btn = document.querySelector('.manager-card .btn-primary-outline');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
    btn.disabled = true;

    setTimeout(() => {
        alert("Reporte Ejecutivo Mensual generado exitosamente.\n(La descarga comenzará automáticamente)");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }, 1500);
}

// --- Utils ---

function formatDateStr(y, m, d) {
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function changeMonth(delta) {
    currentMonth += delta;
    if(currentMonth > 11) { currentMonth=0; currentYear++; }
    if(currentMonth < 0) { currentMonth=11; currentYear--; }
    renderCalendar();
}

function updateDateDisplay() {
    const d = new Date();
    const str = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    document.getElementById('dateDisplay').textContent = str.charAt(0).toUpperCase() + str.slice(1);
}

function updateAccidentFreeDays() {
    document.getElementById('accident-free-days').textContent = safeDays.length;
}

function markSafeDay() {
    const todayStr = formatDateStr(new Date().getFullYear(), new Date().getMonth()+1, new Date().getDate());
    if (!safeDays.includes(todayStr)) {
        if(confirm("¿Confirmar día seguro?")) {
            safeDays.push(todayStr);
            localStorage.setItem('safeDays', JSON.stringify(safeDays));
            renderCalendar();
            updateAccidentFreeDays();
        }
    } else alert("Ya registrado.");
}

function loadUserInfo(user) {
    const el = document.getElementById('welcomeMsg');
    if(el) el.innerHTML = `Hola, <strong>${user.email.split('@')[0]}</strong>`;
}

function toggleRecordForm() {
    const modal = document.getElementById('recordFormModal');
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}
window.onclick = function(ev) {
    if (ev.target == document.getElementById('recordFormModal')) toggleRecordForm();
    if (ev.target == document.getElementById('dayActionModal')) closeDayModal();
}

async function loadTrainingKPIs() {
    try {
        const { data: { user } } = await window.supabase.auth.getUser();
        if (!user) return;

        // 1. Obtener Tenant
        const { data: profile } = await window.supabase
            .from('profiles')
            .select('tenant_id')
            .eq('id', user.id)
            .single();

        if (!profile) return;

        // 2. Consultas
        const [usersReq, coursesReq, assignsReq] = await Promise.all([
            window.supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('tenant_id', profile.tenant_id),
            window.supabase.from('articles').select('*', { count: 'exact', head: true }).eq('tenant_id', profile.tenant_id),
            window.supabase.from('user_course_assignments').select('status').eq('tenant_id', profile.tenant_id)
        ]);

        // 3. Cálculos
        const userCount = usersReq.count || 0;
        const courseCount = coursesReq.count || 0;
        const assignments = assignsReq.data || [];
        
        const total = assignments.length;
        const completed = assignments.filter(a => a.status === 'completed').length;
        const requests = assignments.filter(a => a.status === 'not_started' || a.status === 'pending').length; 

        // AQUÍ SE DEFINE PERCENT
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

        // 4. Renderizar Textos
        const elUsers = document.getElementById('train-users');
        if(elUsers) elUsers.textContent = userCount;
        
        const elCourses = document.getElementById('train-courses');
        if(elCourses) elCourses.textContent = courseCount;
        
        const elReq = document.getElementById('train-requests');
        if(elReq) elReq.textContent = requests;
        
        const elComp = document.getElementById('train-compliance');
        if(elComp) elComp.textContent = `${percent}%`;

        // 5. Estilos Dinámicos (Badge y Barra)
        const badge = document.getElementById('train-badge');
        const progressBar = document.getElementById('train-progress-bar');
        
        let colorTheme = '#2ecc71'; // Color por defecto (Verde)

        if (percent <= 50) { 
            colorTheme = '#c0392b'; // Rojo
            if(badge) {
                badge.style.backgroundColor = 'rgba(255, 90, 90, 0.1)';
                badge.style.borderColor = 'rgb(255, 119, 119)';
                badge.style.color = colorTheme;
            }
        } else if (percent <= 80) { 
            colorTheme = '#d35400'; // Naranja
            if(badge) {
                badge.style.backgroundColor = 'rgba(255, 193, 7, 0.1)';
                badge.style.borderColor = 'rgb(255, 193, 7)';
                badge.style.color = colorTheme;
            }
        } else { 
            // Verde se mantiene
            if(badge) {
                badge.style.backgroundColor = 'rgba(46, 204, 113, 0.1)';
                badge.style.borderColor = 'rgb(46, 204, 113)';
                badge.style.color = colorTheme;
            }
        }

        // Aplicar a la barra de progreso (Usando la variable percent correctamente)
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
            progressBar.style.backgroundColor = colorTheme;
        }

    } catch (err) {
        console.error('Error cargando KPIs Capacitación:', err);
    }
}