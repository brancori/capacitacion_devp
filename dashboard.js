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

document.addEventListener('DOMContentLoaded', async () => {
    renderCalendar();
    updateAccidentFreeDays();
    updateDateDisplay();

    try {
        if (window.tenantManager) {
            const config = await window.tenantManager.loadFromJson({ path: './tenants/tenants.json' });
            window.tenantManager.applyStyles(config);
            if (config && config.companyName) document.title = `${config.companyName} - Portal EH&S`;
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