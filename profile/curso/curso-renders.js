// Función auxiliar para obtener la respuesta guardada de un simulador
async function loadSimulatorResponse(simuladorType) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const courseId = new URLSearchParams(location.search).get('id');
        if (!session || !courseId) return null;

        const { data, error } = await supabase
            .from('simulador_respuestas')
            .select('payload')
            .eq('user_id', session.user.id)
            .eq('course_id', courseId)
            .eq('simulador_type', simuladorType)
            .maybeSingle();

        if (error) throw error;
        return data?.payload || null;
    } catch (e) {
        console.error('[loadSimulatorResponse] Error:', e);
        return null;
    }
}

window.loadSimulatorResponse = async function(simuladorType) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const courseId = new URLSearchParams(location.search).get('id');
        if (!session || !courseId) return null;
        const { data, error } = await supabase
            .from('simulador_respuestas')
            .select('payload')
            .eq('user_id', session.user.id)
            .eq('course_id', courseId)
            .eq('simulador_type', simuladorType)
            .maybeSingle();
        if (error) throw error;
        return data?.payload || null;
    } catch (e) {
        console.error('[loadSimulatorResponse]', e);
        return null;
    }
};

// Exponer globalmente si se necesita desde otros contextos
window.loadSimulatorResponse = loadSimulatorResponse;

// Agrega esto una sola vez, cerca del inicio de curso-renders.js
function ejecutarScriptsEnHTML(contenedor) {
    contenedor.querySelectorAll('script').forEach(function(scriptViejo) {
        var scriptNuevo = document.createElement('script');
        scriptNuevo.textContent = scriptViejo.textContent;
        document.body.appendChild(scriptNuevo);
        scriptViejo.remove();
    });
}

function renderFillBlanks(page) {
    const data = page.payload;
    // data.text debe contener marcadores como {0}, {1} para los huecos
    // data.blanks es un array con las respuestas correctas ["Ergonomía", "Física"]
    // data.distractors son palabras extra incorrectas (opcional)

    // 1. Preparar el banco de palabras (Correctas + Distractores)
    let allWords = [...data.blanks];
    if (data.distractors) allWords = allWords.concat(data.distractors);
    // Barajar palabras
    allWords.sort(() => 0.5 - Math.random());

    // 2. Generar HTML del texto con huecos
    let contentHtml = data.text;
    data.blanks.forEach((ans, index) => {
        
        // ESTRATEGIA: El texto en JSON debe usar tokens como {{0}}, {{1}}
        contentHtml = contentHtml.replace(`{{${index}}}`, 
            `<span class="blank-space" data-index="${index}" onclick="selectBlank(this)">____</span>`
        );
    });

    pageContentEl.innerHTML = `
        <div class="fill-blanks-container">
            <h2 style="color:var(--primaryColor); text-align:center;">${page.title}</h2>
            <p style="text-align:center; font-size:0.9rem; color:#666;">
                Toca un espacio vacío para seleccionarlo y luego elige la palabra correcta.
            </p>
            
            <div class="sentence-line">
                ${contentHtml}
            </div>

            <div class="word-bank" id="wordBank">
                ${allWords.map(word => `<div class="bank-word" onclick="placeWord(this)">${word}</div>`).join('')}
            </div>

            <div class="fb-feedback" id="fbFeedback"></div>

            <div style="text-align:center; margin-top:20px;">
                <button class="btn btn-primary" onclick="checkFillBlanks()">Verificar</button>
                <button class="btn btn-secondary" onclick="resetFillBlanks()" style="margin-left:10px;">Reiniciar</button>
            </div>
        </div>
    `;

    // Estado local para esta slide
    window.fbState = {
        currentBlank: null, // El span que está seleccionado actualmente
        answers: {},        // {0: "Palabra", 1: "Palabra"}
        correctAnswers: data.blanks
    };
}

// Funciones auxiliares globales para FillBlanks
window.selectBlank = function(el) {
    // Si ya está corregido (verde), no hacer nada
    if (el.classList.contains('correct')) return;

    // Quitar activo de otros
    document.querySelectorAll('.blank-space').forEach(b => b.classList.remove('active'));
    
    // Activar este
    el.classList.add('active');
    window.fbState.currentBlank = el;
};

window.placeWord = function(wordEl) {
    if (!window.fbState.currentBlank || wordEl.classList.contains('used')) return;

    const blank = window.fbState.currentBlank;
    const wordText = wordEl.innerText;
    const blankIndex = blank.dataset.index;

    // Si había una palabra antes, liberarla en el banco visualmente
    if (window.fbState.answers[blankIndex]) {
        const prevWord = window.fbState.answers[blankIndex];
        // Buscar esa palabra en el banco y quitarle 'used'
        const bankWords = document.querySelectorAll('.bank-word');
        for(let w of bankWords) {
            if (w.innerText === prevWord && w.classList.contains('used')) {
                w.classList.remove('used');
                break; // Solo reactivar una instancia
            }
        }
    }

    // Colocar nueva palabra
    blank.innerText = wordText;
    blank.classList.remove('active');
    window.fbState.answers[blankIndex] = wordText;
    
    // Marcar palabra como usada
    wordEl.classList.add('used');
    window.fbState.currentBlank = null; // Deseleccionar
};

window.checkFillBlanks = function() {
    const state = window.fbState;
    let correctCount = 0;
    let total = state.correctAnswers.length;
    const blanks = document.querySelectorAll('.blank-space');
    
    // Limpiar estilos previos de error
    blanks.forEach(b => b.classList.remove('incorrect'));

    let allFilled = true;

    blanks.forEach(blank => {
        const idx = blank.dataset.index;
        const userWord = state.answers[idx];
        const correctWord = state.correctAnswers[idx];

        if (!userWord) {
            allFilled = false;
            return;
        }

        if (userWord === correctWord) {
            blank.classList.add('correct');
            blank.classList.remove('incorrect');
            correctCount++;
        } else {
            blank.classList.add('incorrect');
        }
    });

    const feedback = document.getElementById('fbFeedback');
    feedback.style.display = 'block';

    if (correctCount === total) {
        feedback.innerHTML = `<span style="color:#28a745"><i class="fas fa-check-circle"></i> ¡Excelente! Todo correcto.</span>`;
        // Desbloquear siguiente página
        if (currentPageIndex >= maxUnlockedIndex) {
             maxUnlockedIndex = currentPageIndex + 1;
             saveProgress(currentPageIndex, false);
             updateNavigationUI(currentPageIndex);
        }
        document.getElementById('nextPageBtn').disabled = false;
    } else {
        feedback.innerHTML = `<span style="color:#dc3545">Tienes ${total - correctCount} errores. Inténtalo de nuevo.</span>`;
    }
};

window.resetFillBlanks = function() {
};


function renderPracticeQuiz(page) {
    const config = page.payload.config || { pool_size: 4 };
    const bank = page.payload.bank || [];
    
    const isAlreadyPassed = !window.practiceForceRetake && maxUnlockedIndex > currentPageIndex;

    // 1. VISTA: YA APROBADO (completado anteriormente)
    if (isAlreadyPassed) {
        const diagnostic = config.save_responses; // verdadero si es evaluación diagnóstica (sin reintento)

        pageContentEl.innerHTML = `
            <div class="practice-container" style="text-align:center; display:flex; flex-direction:column; justify-content:center;">
                <div class="practice-completed-card">
                    <i class="fas ${diagnostic ? 'fa-clipboard-check' : 'fa-check-circle'}" 
                       style="font-size: 4rem; color: ${diagnostic ? '#0d6efd' : '#28a745'}; margin-bottom: 20px;"></i>
                    <h3 style="color: ${diagnostic ? '#0d6efd' : '#28a745'};">
                        ${diagnostic ? 'Evaluación Diagnóstica Completada' : '¡Actividad Completada!'}
                    </h3>
                    <p>${diagnostic ? 'Tus respuestas han sido registradas para análisis del instructor.' : 'Ya has aprobado este módulo anteriormente.'}</p>
                    ${!diagnostic ? `
                        <button class="btn btn-secondary" style="margin-top:20px;" 
                                onclick="window.practiceForceRetake = true; window.renderPage(currentPageIndex)">
                            <i class="fas fa-sync"></i> Practicar de nuevo
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
        document.getElementById('nextPageBtn').disabled = false;
        return;
    }

    // 2. MODO EXAMEN
    window.startPracticeMode = function() {
        window.practiceForceRetake = false; // Reiniciamos bandera

        // Seleccionar preguntas aleatorias del banco
        const shuffledBank = [...bank].sort(() => 0.5 - Math.random());
        const selectedQuestions = shuffledBank.slice(0, config.pool_size);

        // Aleatorizar las opciones de cada pregunta y guardar el nuevo índice correcto
        const randomizedQuestions = selectedQuestions.map(q => {
            const options = [...q.options];
            // Fisher–Yates para mezclar opciones
            for (let i = options.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [options[i], options[j]] = [options[j], options[i]];
            }
            // Encontrar el nuevo índice de la respuesta correcta (basado en el texto)
            const correctText = q.options[q.answer];
            const newAnswerIdx = options.indexOf(correctText);
            return { question: q.question, options: options, answerIdx: newAnswerIdx };
        });

        // Generar HTML
        let html = `
            <div class="practice-container">
                <h2 style="color:var(--primaryColor); margin-bottom:25px;">${page.title || 'Validación de Conocimientos'}</h2>
                <div id="practiceQuestionsList">
        `;

        randomizedQuestions.forEach((q, idx) => {
            html += `
                <div class="practice-card" id="p-card-${idx}" data-answer="${q.answerIdx}">
                    <h4>${idx + 1}. ${q.question}</h4>
                    <div class="practice-options">
                        ${q.options.map((opt, optIdx) => `
                            <button type="button" class="quiz-option-btn" onclick="selectPracticeOption(${idx}, ${optIdx})">
                                ${opt}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <div id="practiceActions" style="text-align:center; margin-top:30px; margin-bottom:20px;">
                    <button type="button" class="btn btn-primary btn-lg" onclick="checkPracticeAnswers()">
                        Verificar Respuestas
                    </button>
                </div>
                <div id="practiceResult" class="practice-completed-card" style="display:none; margin-top:30px; text-align:center;"></div>
            </div>
        `;
        pageContentEl.innerHTML = html;
        if (!isAlreadyPassed) document.getElementById('nextPageBtn').disabled = true;
    };

    // 3. Maneja la selección visual de las opciones
    window.selectPracticeOption = function(cardIdx, optIdx) {
        const card = document.getElementById(`p-card-${cardIdx}`);
        if (card.querySelector('.quiz-option-btn').disabled) return;

        const options = card.querySelectorAll('.quiz-option-btn');
        options.forEach(btn => btn.classList.remove('selected'));
        options[optIdx].classList.add('selected');
        card.dataset.selected = optIdx;
    };

    // 4. Verificar respuestas
    window.checkPracticeAnswers = function() {
        const cards = document.querySelectorAll('.practice-card');
        let allCorrect = true;
        let anyUnanswered = false;
        const respuestas = [];

        cards.forEach(card => {
            const correctIdx = parseInt(card.dataset.answer);
            const selectedIdx = card.dataset.selected ? parseInt(card.dataset.selected) : null;
            const options = card.querySelectorAll('.quiz-option-btn');
            const questionText = card.querySelector('h4').innerText;

            options.forEach(btn => btn.classList.remove('correct', 'incorrect'));
            card.style.border = "";

            if (selectedIdx === null) {
                allCorrect = false;
                anyUnanswered = true;
                card.style.border = "2px solid var(--warning)";
                respuestas.push({
                    pregunta: questionText,
                    respuesta: null,
                    correcta: false
                });
            } else {
                const isCorrect = selectedIdx === correctIdx;
                if (isCorrect) {
                    options[selectedIdx].classList.add('correct');
                } else {
                    options[selectedIdx].classList.add('incorrect');
                    allCorrect = false;
                }
                respuestas.push({
                    pregunta: questionText,
                    respuesta: options[selectedIdx].innerText,
                    correcta: isCorrect
                });
            }

            if (!anyUnanswered) {
                options.forEach(btn => btn.disabled = true);
            }
        });

        if (anyUnanswered) {
            showModal('Atención', 'Responde todas las preguntas antes de verificar.', 'warning');
        }

        const resultArea = document.getElementById('practiceResult');
        const actionArea = document.getElementById('practiceActions');
        const diagnostic = config.save_responses; // ¿Es evaluación diagnóstica?

        // Guardar siempre si es diagnóstico (save_responses: true)
        if (diagnostic) {
            const payload = {
                tipo: 'diagnostico',
                pool_size: config.pool_size,
                respuestas: respuestas,
                aprobado: allCorrect,
                fecha: new Date().toISOString()
            };
            window.saveSimuladorRespuesta('practiceDiagnostico', payload);
        }

        if (allCorrect) {
            resultArea.innerHTML = `
                <i class="fas fa-check-circle" style="font-size: 3rem; color: #28a745; margin-bottom: 15px;"></i>
                <h3 style="color:#28a745">¡Excelente trabajo!</h3>
                <p>Has respondido correctamente todas las preguntas.</p>
            `;
            resultArea.style.display = 'block';
            actionArea.style.display = 'none';

            // Guardar respuestas (práctica común) si no es diagnóstico
            if (!diagnostic) {
                const payload = {
                    tipo: 'diagnostico',
                    pool_size: config.pool_size,
                    respuestas: respuestas,
                    aprobado: true,
                    fecha: new Date().toISOString()
                };
                window.saveSimuladorRespuesta('practiceDiagnostico', payload);
            }

            if (currentPageIndex >= maxUnlockedIndex) {
                maxUnlockedIndex = currentPageIndex + 1;
                saveProgress(currentPageIndex, false);
                updateNavigationUI(currentPageIndex);
            }
            document.getElementById('nextPageBtn').disabled = false;
        } else {
            if (diagnostic) {
                // Diagnóstico: aunque no sea perfecto, se desbloquea la siguiente página y no se permite reintentar
                resultArea.innerHTML = `
                    <i class="fas fa-clipboard-check" style="font-size: 3rem; color: #0d6efd; margin-bottom: 15px;"></i>
                    <h3 style="color:#0d6efd">Evaluación Finalizada</h3>
                    <p>Tus respuestas han sido registradas. Puedes continuar al siguiente tema.</p>
                `;
                resultArea.style.display = 'block';
                actionArea.style.display = 'none';

                if (currentPageIndex >= maxUnlockedIndex) {
                    maxUnlockedIndex = currentPageIndex + 1;
                    saveProgress(currentPageIndex, false);
                    updateNavigationUI(currentPageIndex);
                }
                document.getElementById('nextPageBtn').disabled = false;
            } else {
                // Práctica común: reintentar
                const btn = actionArea.querySelector('button');
                btn.innerHTML = "<i class='fas fa-sync-alt'></i> Intentar de nuevo";
                btn.classList.replace('btn-primary', 'btn-secondary');
                btn.onclick = () => window.renderPage(currentPageIndex);
            }
        }
    };

    // Inicia el modo examen
    window.startPracticeMode();
}

function renderFlipCards(page) {
    const { title, payload } = page;
    const { instruction, cards, schema } = payload;

    // Schema por defecto si no viene en el JSON
    const SCHEMA = schema || ['icon', 'title', 'content', 'action'];

    // Función para leer una tarjeta sin importar si es array o objeto legacy
    function parseCard(card, index) {
        if (Array.isArray(card)) {
            // Formato nuevo: posicional según schema
            return SCHEMA.reduce((obj, key, i) => {
                obj[key] = card[i] ?? null;
                return obj;
            }, {});
        }
        // Formato legacy: objeto con front/back — lo aplanamos
        return {
            icon:    card.front?.icon    ?? null,
            title:   card.front?.title   ?? `Tarjeta ${index + 1}`,
            color:   card.front?.color   ?? null,   // solo en legacy
            content: card.back?.content  ?? '',
            action:  card.back?.action   ?? null,
        };
    }

    const html_cards = cards.map((raw, index) => {
        const card  = parseCard(raw, index);
        // Color: legacy > paleta rotativa
        const color = card.color ?? getCardPalette()[index % getCardPalette().length];
        // Icono: limpia "fa-" si ya viene solo el nombre
        const iconClass = card.icon
            ? (card.icon.includes('<i') ? card.icon : `<i class="fas ${card.icon}"></i>`)
            : '';

        return `
        <div class="accordion-card" onclick="toggleAccordion(this)">
            <div class="accordion-header" style="display:flex; align-items:center; gap:12px; cursor:pointer;">
                <span style="
                    width:38px; height:38px; border-radius:10px;
                    background:${color}22;
                    color:${color};
                    display:flex; align-items:center; justify-content:center;
                    font-size:1rem; flex-shrink:0;">
                    ${iconClass}
                </span>
                <span style="flex:1;">${card.title}</span>
                <i class="fas fa-chevron-down" style="
                    transition:transform 0.3s;
                    color:#94a3b8; font-size:0.85rem;"></i>
            </div>
            <div class="accordion-body" style="display:none;">
                <p style="margin:0 0 ${card.action ? '12px' : '0'}; color:#475569; line-height:1.65;">
                    ${card.content}
                </p>
                ${card.action ? `
                <div style="
                    display:inline-block;
                    background:${color}15;
                    color:${color};
                    border-left:3px solid ${color};
                    padding:6px 12px;
                    border-radius:0 6px 6px 0;
                    font-size:0.82rem;
                    font-weight:600;">
                    ${card.action}
                </div>` : ''}
            </div>
        </div>`;
    }).join('');

    pageContentEl.innerHTML = `
        <div class="flip-cards" style="
            height:100%; display:flex; flex-direction:column;
            justify-content:center; max-width:800px;
            margin:0 auto; width:100%;">
            <div class="practice-card">
                <h2 style="color:var(--primaryColor); margin:0 0 20px; font-weight:600;">${title}</h2>
                ${instruction
                    ? `<p style="margin-bottom:20px; color:#666;">${instruction}</p>`
                    : ''}
                <div class="cards-list-container">${html_cards}</div>
            </div>
        </div>`;
}

function toggleAccordion(card) {
    const body    = card.querySelector('.accordion-body');
    const chevron = card.querySelector('.fa-chevron-down');
    const isOpen  = card.classList.contains('active');

    // Cierra todos
    document.querySelectorAll('.flip-cards .accordion-card.active').forEach(c => {
        c.classList.remove('active');
        c.querySelector('.accordion-body').style.display = 'none';
        c.querySelector('.fa-chevron-down').style.transform = '';
    });

    // Abre este si estaba cerrado
    if (!isOpen) {
        card.classList.add('active');
        body.style.display = 'block';
        chevron.style.transform = 'rotate(180deg)';
    }
}

function buildCardPalette(tenant) {
    const primary   = tenant.primaryColor;   // "#315D83"
    const secondary = tenant.secondaryColor; // "#214361"

    // Variaciones HSL del primary (más claro / más saturado)
    // + secondary como ancla oscura
    // Se generan mezclando opacidad sobre blanco vía hex
    return [
        primary,                          // #315D83
        secondary,                        // #214361
        primary + 'CC',                   // 80% opacidad
        secondary + 'AA',                 // 67%
        primary + '99',                   // 60%
        secondary + '88',                 // 53%
        primary + '77',                   // 47%
        secondary + '66',                 // 40%
        primary + '55',                   // 33%
        secondary + '44',                 // 27%
    ];
}

function getCardPalette() { return ["#F97316","#3B82F6","#8B5CF6","#EF4444","#10B981","#64748B","#e67e22","#28a745","#c0392b","#2e6da4"]; }

function renderGallery(page) {
    const data = page.payload;
    
    let html = `
        <div class="gallery-container" style="text-align:center;">
            <h2 style="color:var(--primaryColor);">${page.title}</h2>
            <p>${data.instruction || ''}</p>
            <div class="gallery-btn-group">`;

    data.buttons.forEach(btn => {
        const btnClass = btn.style === 'good' ? 'btn-success' : 'btn-danger';
        const icon = btn.style === 'good' ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>';
        
        html += `
            <button class="btn ${btnClass} gallery-trigger" 
                onclick="openImageModal('${btn.url}', '${btn.caption}')">
                ${icon} ${btn.label}
            </button>`;
    });

    html += `</div></div>`;
    pageContentEl.innerHTML = html;
}

window.openImageModal = function(url, caption) {
    let modal = document.getElementById('imgModalViewer');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'imgModalViewer';
        modal.className = 'course-modal-overlay';
        modal.onclick = (e) => { if(e.target === modal) modal.style.display = 'none'; };
        modal.innerHTML = `
            <div class="course-modal" style="max-width:90vh; width:auto; padding:20px;">
                <div style="text-align:right; margin-bottom:10px;">
                    <span onclick="document.getElementById('imgModalViewer').style.display='none'" 
                          style="cursor:pointer; font-size:1.5rem; color:#666;">&times;</span>
                </div>
                <img id="imgModalSrc" style="max-width:100%; max-height:70vh; border-radius:8px; display:block; margin:0 auto;">
                <p id="imgModalCap" style="margin-top:15px; font-weight:bold; color:var(--textForm); text-align:center;"></p>
            </div>`;
        document.body.appendChild(modal);
    }

    document.getElementById('imgModalSrc').src = url;
    document.getElementById('imgModalCap').innerText = caption;
    modal.style.display = 'flex';
};

// ============================================
// SIMULADOR: ACTO O CONDICIÓN INSEGURA (Actualizado con validación)
// ============================================
window.renderActoCondicion = function(page) {
    const payload = page.payload;
    const isCompleted = !payload.embedded && maxUnlockedIndex > currentPageIndex;

    if (isCompleted && !window.acForcePlay) {
        pageContentEl.innerHTML = `
            <div style="text-align:center; padding:60px 20px;">
                <div style="font-size:64px;">✅</div>
                <h2 style="color:#2e7d32;">Simulador completado</h2>
                <p style="color:#555;">Tus reportes ya fueron registrados.</p>
                <button onclick="window.acForcePlay=true; window.renderPage(currentPageIndex)" class="btn btn-secondary" style="margin-top:20px;">
                    Revisar mis respuestas
                </button>
            </div>`;
        document.getElementById('nextPageBtn').disabled = false;
        return;
    }

    window.acForcePlay = false;
    window.acState = {
        current: 0,
        scenarios: payload.scenarios || [],
        answers: new Array((payload.scenarios || []).length).fill(null).map(() => ({ type: '', detection: '', correction: '' }))
    };

    if (!isCompleted) document.getElementById('nextPageBtn').disabled = true;

    window.renderACScenario = function() {
        const state = window.acState;
        const sc = state.scenarios[state.current];
        const ans = state.answers[state.current];
        const isLast = state.current === state.scenarios.length - 1;

        let html = `
            <div style="max-width:900px; margin:0 auto; padding:20px; font-family:sans-serif;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h2 style="color:#1a3a5c; margin:0;">${payload.title || 'Identificación de Riesgos'}</h2>
                    <span style="background:#e0e0e0; padding:5px 15px; border-radius:20px; font-weight:bold; font-size:14px; color:#333;">
                        Caso ${state.current + 1} de ${state.scenarios.length}
                    </span>
                </div>

                <div style="display:flex; gap:20px; flex-wrap:wrap;">
                    <div style="flex:1; min-width:300px;">
                        <img src="${sc.image}" style="width:100%; border-radius:8px; box-shadow:0 4px 10px rgba(0,0,0,0.1); max-height:400px; object-fit:contain; background:#f0f0f0;">
                        ${sc.context ? `<p style="margin-top:10px; padding:10px; background:#f8f9fa; border-left:4px solid #1a3a5c; font-size:14px; color:#444;">${sc.context}</p>` : ''}
                    </div>

                    <div style="flex:1; min-width:300px; display:flex; flex-direction:column; gap:15px;">
                        <div>
                            <label style="font-weight:bold; display:block; margin-bottom:8px; color:#333;">1. Clasificación:</label>
                            <div style="display:flex; gap:10px;">
                                <button onclick="window.acSelectType('Acto Inseguro')" style="flex:1; padding:12px; border:2px solid ${ans.type === 'Acto Inseguro' ? '#dc3545' : '#ddd'}; background:${ans.type === 'Acto Inseguro' ? '#dc3545' : '#fff'}; color:${ans.type === 'Acto Inseguro' ? '#fff' : '#555'}; border-radius:6px; cursor:pointer; font-weight:bold; transition:all 0.2s;">Acto Inseguro</button>
                                <button onclick="window.acSelectType('Condición Insegura')" style="flex:1; padding:12px; border:2px solid ${ans.type === 'Condición Insegura' ? '#f0ad4e' : '#ddd'}; background:${ans.type === 'Condición Insegura' ? '#f0ad4e' : '#fff'}; color:${ans.type === 'Condición Insegura' ? '#fff' : '#555'}; border-radius:6px; cursor:pointer; font-weight:bold; transition:all 0.2s;">Condición Insegura</button>
                            </div>
                        </div>

                        <div>
                            <label style="font-weight:bold; display:block; margin-bottom:8px; color:#333;">2. ¿Qué se detectó claramente?</label>
                            <textarea id="ac_detection" rows="3" placeholder="Describe el acto o condición observada..." style="width:100%; box-sizing:border-box; padding:10px; border-radius:6px; border:1px solid #ccc; resize:vertical; font-family:inherit;">${ans.detection}</textarea>
                        </div>

                        <div>
                            <label style="font-weight:bold; display:block; margin-bottom:8px; color:#333;">3. Acción Correctiva:</label>
                            <textarea id="ac_correction" rows="3" placeholder="Indica cómo corregir esta situación de raíz..." style="width:100%; box-sizing:border-box; padding:10px; border-radius:6px; border:1px solid #ccc; resize:vertical; font-family:inherit;">${ans.correction}</textarea>
                        </div>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; margin-top:30px; padding-top:20px; border-top:1px solid #eee;">
                    ${state.current > 0 ? `<button onclick="window.acPrev()" class="btn btn-secondary" style="padding:10px 20px; cursor:pointer;">← Anterior</button>` : `<div></div>`}
                    ${isLast 
                        ? `<button onclick="window.acSubmit()" class="btn" style="background:#28a745; color:white; padding:10px 24px; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">✅ Enviar Reporte</button>` 
                        : `<button onclick="window.acNext()" class="btn" style="background:#1a3a5c; color:white; padding:10px 24px; border:none; border-radius:6px; cursor:pointer;">Siguiente →</button>`
                    }
                </div>
            </div>
        `;
        pageContentEl.innerHTML = html;
    };

    window.acSelectType = function(type) {
        window.acState.answers[window.acState.current].type = type;
        window.renderACScenario();
    };

    window.acSaveCurrentInputs = function() {
        const det = document.getElementById('ac_detection');
        const cor = document.getElementById('ac_correction');
        if (det) window.acState.answers[window.acState.current].detection = det.value;
        if (cor) window.acState.answers[window.acState.current].correction = cor.value;
    };

    window.acNext = function() {
        window.acSaveCurrentInputs();
        if (!window.acState.answers[window.acState.current].type) {
            showModal('Falta clasificación', 'Selecciona Acto o Condición Insegura.', 'warning');
            return;
        }
        window.acState.current++;
        window.renderACScenario();
    };

    window.acPrev = function() {
        window.acSaveCurrentInputs();
        window.acState.current--;
        window.renderACScenario();
    };

    window.acSubmit = function() {
        window.acSaveCurrentInputs();
        const currentAns = window.acState.answers[window.acState.current];
    
        // Validación: campos incompletos → modal de advertencia
        if (!currentAns.type || !currentAns.detection.trim() || !currentAns.correction.trim()) {
            showModal('Campos incompletos', 'Completa clasificación, detección y corrección.', 'warning');
            return;
        }
    
        // Confirmación con modal → si acepta, ejecutar el envío
        showConfirm(
            'Enviar reporte',
            '¿Estás seguro de enviar el reporte final?',
            () => {
                // Lógica que antes iba después del confirm
                let aciertos = 0;
                const payloadToSave = {
                    completed_at: new Date().toISOString(),
                    respuestas: window.acState.answers.map((ans, idx) => {
                        const sc = window.acState.scenarios[idx];
                        const isCorrect = ans.type === sc.correctType;
                        if (isCorrect) aciertos++;
                        return {
                            scenario_id: sc.id || (idx + 1),
                            selectedType: ans.type,
                            correctType: sc.correctType,
                            isTypeCorrect: isCorrect,
                            detection: ans.detection,
                            correction: ans.correction
                        };
                    }),
                    score: aciertos,
                    total: window.acState.scenarios.length
                };
    
                window.saveSimuladorRespuesta('actoCondicion', payloadToSave);
    
                maxUnlockedIndex = Math.max(maxUnlockedIndex, currentPageIndex + 1);
                saveProgress(currentPageIndex, false);
                document.getElementById('nextPageBtn').disabled = false;
    
                pageContentEl.innerHTML = `
                    <div style="text-align:center; padding:60px 20px;">
                        <div style="font-size:64px;">📋</div>
                        <h2 style="color:#2e7d32;">Reporte enviado con éxito</h2>
                        <p style="color:#333; font-size:1.2rem; font-weight:bold;">Clasificaste correctamente ${aciertos} de ${window.acState.scenarios.length} situaciones.</p>
                        <p style="color:#555;">El instructor revisará tu redacción de las detecciones y las acciones correctivas propuestas.</p>
                    </div>`;
            }
        );
    };

    window.renderACScenario();
};

// ============================================
// RENDER: StepByStep (Pasos numerados)
// ============================================
function renderStepByStep(page) {
    const { intro, steps, criticalNumbers, warnings } = page.payload;

    function parseStep(s, i) {
        if (Array.isArray(s)) {
            return { number: i + 1, icon: s[0], title: s[1], content: s[2], tip: s[3] ?? null };
        }
        return { number: s.number ?? i + 1, icon: s.icon, title: s.title, content: s.content, tip: s.tip ?? null };
    }

    const parsed = steps.map(parseStep);
    const total  = parsed.length;
    let active   = 0;

    function typeWriter(el, fullText) {
        // El elemento ya tiene textContent = fullText y altura calculada.
        // Solo reemplazamos el nodo de texto por spans, sin cambiar dimensiones.
        const h = el.getBoundingClientRect().height;
        el.style.height = h + 'px';
        el.style.overflow = 'hidden';
        el.textContent = '';
        fullText.split('').forEach(ch => {
            const span = document.createElement('span');
            span.textContent = ch;
            span.style.visibility = 'hidden';
            el.appendChild(span);
        });
        let i = 0;
        const spans = el.querySelectorAll('span');
        const t = setInterval(() => {
            if (i < spans.length) {
                spans[i++].style.visibility = 'visible';
            } else {
                clearInterval(t);
                el.style.height = '';
                el.style.overflow = '';
            }
        }, 14);
    }

    function render() {
        const itemsEl    = pageContentEl.querySelector('#tlItems');
        const progressEl = pageContentEl.querySelector('#tlProgress');
        if (!itemsEl) return;
        itemsEl.innerHTML = '';

        parsed.forEach((s, i) => {
            const state = i < active ? 'done' : i === active ? 'active' : 'locked';

            const item = document.createElement('div');
            item.style.cssText = 'display:flex;align-items:flex-start;min-height:72px;position:relative;';
            item.style.flexDirection = (i % 2 === 0) ? 'row' : 'row-reverse';

            const side = document.createElement('div');
            side.style.cssText = 'width:calc(50% - 28px);padding:6px 0;';
            if (i % 2 === 0) { side.style.textAlign = 'right'; side.style.paddingRight = '14px'; }
            else { side.style.textAlign = 'left'; side.style.paddingLeft = '14px'; }

            const titleEl = document.createElement('div');
            titleEl.style.cssText = 'font-size:13px;font-weight:600;color:#334155;line-height:1.3;';
            if (state === 'locked') titleEl.style.opacity = '0.35';
            titleEl.textContent = s.title;
            side.appendChild(titleEl);

            if (state === 'active') {
                const bodyEl = document.createElement('div');
                bodyEl.style.cssText = 'margin-top:6px;';
                const textEl = document.createElement('p');
                textEl.style.cssText = 'font-size:12px;color:#475569;line-height:1.65;margin:0 0 6px;';
                textEl.textContent = s.content;
                bodyEl.appendChild(textEl);
                if (s.tip) {
                    const tipEl = document.createElement('div');
                    tipEl.style.cssText = 'font-size:11px;color:#92400e;background:#fffbeb;border-left:2px solid #f59e0b;padding:5px 8px;border-radius:0 4px 4px 0;margin-top:4px;';
                    tipEl.textContent = '💡 ' + s.tip;
                    bodyEl.appendChild(tipEl);
                }
                side.appendChild(bodyEl);
                // Revelar con typewriter SIN cambiar altura
                setTimeout(() => typeWriter(textEl, s.content), 80);
            }

            const nodeWrap = document.createElement('div');
            nodeWrap.style.cssText = 'width:56px;flex-shrink:0;display:flex;justify-content:center;align-items:flex-start;padding-top:4px;position:relative;z-index:2;';

            const nodeBg = document.createElement('div');
            nodeBg.style.cssText = 'position:absolute;width:46px;height:46px;border-radius:50%;background:var(--bgPage,#F4F7F6);z-index:1;top:3px;left:5px;';

            const node = document.createElement('div');
            node.style.cssText = 'width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid transparent;flex-shrink:0;position:relative;z-index:2;transition:transform 0.3s;';

            if (state === 'done') {
                node.style.cssText += 'background:#dcfce7;color:#16a34a;border-color:#86efac;cursor:pointer;';
                node.textContent = '✓';
                node.onclick = () => { active = i; render(); };
            } else if (state === 'active') {
                node.style.cssText += 'background:var(--primaryColor,#315D83);color:#fff;border-color:var(--primaryColor,#315D83);transform:scale(1.15);';
                node.textContent = s.icon;
            } else if (i === active + 1) {
                // Siguiente inmediato: clickeable para avanzar
                node.style.cssText += 'background:#f1f5f9;color:#94a3b8;border-color:#e2e8f0;opacity:0.6;cursor:pointer;';
                node.textContent = s.icon;
                node.onclick = () => { active = i; render(); };
            } else {
                node.style.cssText += 'background:#f1f5f9;color:#94a3b8;border-color:#e2e8f0;opacity:0.35;';
                node.textContent = s.icon;
            }

            nodeWrap.appendChild(nodeBg);
            nodeWrap.appendChild(node);

            const side2 = document.createElement('div');
            side2.style.cssText = 'width:calc(50% - 28px);';

            item.appendChild(side);
            item.appendChild(nodeWrap);
            item.appendChild(side2);
            itemsEl.appendChild(item);
        });

        if (progressEl) {
            if (active === 0) {
                progressEl.style.height = '0px';
            } else {
                const items = itemsEl.querySelectorAll('div[style*="min-height:72px"]');
                let h = 0;
                for (let i = 0; i < active && i < items.length; i++) h += items[i].offsetHeight;
                progressEl.style.height = h + 'px';
            }
        }
    }

    if (!document.getElementById('tl-styles')) {
        const style = document.createElement('style');
        style.id = 'tl-styles';
        style.textContent = `
.tl-wrap{max-width:680px;margin:0 auto;padding:1rem 0 2rem;}.tl-items-wrap{position:relative;}
.tl-intro{font-size:14px;color:#555;margin-bottom:1.5rem;line-height:1.7;padding:0 8px;}
.tl-line{position:absolute;left:50%;top:0;bottom:0;transform:translateX(-50%);width:2px;pointer-events:none;z-index:0;background:repeating-linear-gradient(to bottom,#cbd5e1 0,#cbd5e1 8px,transparent 8px,transparent 16px);}
.tl-progress{position:absolute;left:50%;top:0;transform:translateX(-50%);width:2px;z-index:1;background:var(--primaryColor,#315D83);transition:height 0.4s ease;height:0;}
.tl-items{position:relative;display:flex;flex-direction:column;}
        `;
        document.head.appendChild(style);
    }

    pageContentEl.innerHTML = `
        <div class="tl-wrap">
            ${intro ? `<div class="tl-intro">${intro}</div>` : ''}
            <div class="tl-items-wrap">
                <div class="tl-line"></div>
                <div class="tl-progress" id="tlProgress"></div>
                <div class="tl-items" id="tlItems"></div>
            </div>
            ${criticalNumbers ? criticalNumbers : ''}
            ${warnings ? warnings : ''}
        </div>`;

    render();
}
// Iniciar todo al cargar la página

// ==========================================
// 6. SISTEMA DE PRE-CARGA (PERFORMANCE)
// ==========================================

// Registro en window: evita "Identifier 'preloadedUrls' has already been declared"
// si el script se carga dos veces o coincide con otro archivo en el mismo ámbito global.
if (!window.__cursoPreloadedUrls) {
    window.__cursoPreloadedUrls = new Set();
}
var PRELOAD_LOOKAHEAD = 2; // Cuántas diapositivas a futuro cargar

/**
 * Función principal que orquesta la precarga basada en la posición actual
 */
function triggerSlidingPreload(currentIndex) {
    if (!courseData || !courseData.pages) return;

    // Calculamos el rango de la ventana deslizante
    const maxIndex = Math.min(courseData.pages.length - 1, currentIndex + PRELOAD_LOOKAHEAD);

    // Iteramos desde la SIGUIENTE página hasta el límite de la ventana
    for (let i = currentIndex + 1; i <= maxIndex; i++) {
        const page = courseData.pages[i];
        if (!page) continue;

        extractAndPreloadFromPage(page);
    }
}

/**
 * Extrae recursos según el tipo de página y ejecuta la carga
 */
function extractAndPreloadFromPage(page) {
    const payload = page.payload;
    if (!payload) return;

    switch (page.type) {
        case 'image':
            // Caso directo: página tipo imagen única
            if (payload.url) preloadImage(payload.url);
            break;

        case 'text':
        case 'interactive':
        case 'comparison':
            // Caso complejo: buscar <img> dentro del HTML string
            if (payload.html) {
                // Usamos un parser ligero sin renderizar en el DOM visible
                const parser = new DOMParser();
                const doc = parser.parseFromString(payload.html, 'text/html');
                const images = doc.querySelectorAll('img');
                images.forEach(img => {
                    const src = img.getAttribute('src');
                    if (src) preloadImage(src);
                });
            }
            break;

        case 'gallery':
            // Caso galería: precargar botones/imágenes de la galería
            if (payload.buttons && Array.isArray(payload.buttons)) {
                payload.buttons.forEach(btn => {
                    if (btn.url) preloadImage(btn.url);
                });
            }
            break;
        
        case 'video':
            // Caso video: Precalentar conexión del iframe
            if (payload.url) preloadLink(payload.url, 'document');
            break;
        case 'lotoGame':
            // No hay recursos estáticos que precargar en lotoGame
            break;

        case 'fillBlanks':
             // Si hubiera imágenes en el texto del fillBlanks
             if (payload.text) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(payload.text, 'text/html');
                const images = doc.querySelectorAll('img');
                images.forEach(img => {
                    const src = img.getAttribute('src');
                    if (src) preloadImage(src);
                });
             }
             break;
    }
}

/**
 * Técnica: Image Object para forzar Browser Cache
 */
function preloadImage(url) {
    const preloadedUrls = window.__cursoPreloadedUrls;
    if (!url || preloadedUrls.has(url)) return;

    // Normalizar URL si es relativa (opcional, el navegador suele manejarlo bien)
    // Pero el Set necesita strings idénticos.
    
    preloadedUrls.add(url);

    const img = new Image();
    img.src = url;
    // No necesitamos adjuntarlo al DOM, la simple asignación de src dispara el GET
    // Opcional: escuchar onload para logs de debug
    // img.onload = () => console.log(`[PRELOAD] Cached: ${url}`);
}

/**
 * Técnica: Link Prefetch para Iframes/Videos
 */
function preloadLink(url, asType) {
    const preloadedUrls = window.__cursoPreloadedUrls;
    if (!url || preloadedUrls.has(url)) return;
    
    preloadedUrls.add(url);

    const link = document.createElement('link');
    link.rel = 'preload'; // O 'prefetch' si la prioridad es baja
    link.as = asType; // 'document' para iframes, 'video' para archivos mp4 directos
    link.href = url;
    document.head.appendChild(link);
}
// ============================================
// SIMULADOR EPP (MINI JUEGO)
// ============================================
window.renderEppGame = function(page) {
    const data = page.payload;
    const isAlreadyPassed = maxUnlockedIndex > currentPageIndex;

    // Si ya lo pasó y no forzó "jugar de nuevo"
    if (isAlreadyPassed && !window.eppForcePlay) {
        pageContentEl.innerHTML = `
            <div class="practice-container" style="text-align:center; display:flex; flex-direction:column; justify-content:center; height:100%;">
                <div class="practice-completed-card">
                    <i class="fas fa-medal" style="font-size: 4rem; color: #f39c12; margin-bottom: 20px;"></i>
                    <h3 style="color: #28a745;">¡Simulador Completado!</h3>
                    <p>Tienes el criterio para equipar a tu personal.</p>
                    <button class="btn btn-secondary" style="margin-top:20px;" onclick="window.eppForcePlay=true; window.renderPage(currentPageIndex)">
                        <i class="fas fa-gamepad"></i> Jugar de nuevo
                    </button>
                </div>
            </div>
        `;
        document.getElementById('nextPageBtn').disabled = false;
        return;
    }

    // Inicializar estado del juego
    window.eppForcePlay = false;
    window.eppState = {
        scenarios: data.scenarios,
        pool: data.eppPool,
        current: 0,
        score: 0,
        passingScore: data.passingScore || 80,
        selected: new Set(),
        results: []
    };

    if (!isAlreadyPassed) document.getElementById('nextPageBtn').disabled = true;
    renderEppScenario();
}

window.renderEppScenario = function() {
    const state = window.eppState;
    if (state.current >= state.scenarios.length) {
        finishEppGame();
        return;
    }

    const scenario = state.scenarios[state.current];
    state.selected.clear();

    let html = `
        <div class="epp-game-container">
            <div class="epp-header">
                <div class="epp-progress">Misión ${state.current + 1} de ${state.scenarios.length}</div>
                <div class="epp-score">Puntuación: ${Math.round(state.score)}</div>
            </div>
            
            <div class="epp-scenario-card">
                <h3 style="color:var(--primaryColor); margin-top:0;">${scenario.name}</h3>
                <p style="color:#555; margin:0; line-height:1.6;">${scenario.description}</p>
            </div>

            <p style="text-align:center; font-weight:bold; color:var(--textForm);">Selecciona el EPP estricto para esta tarea:</p>

            <div class="epp-grid">
                ${state.pool.map(item => `
                    <div class="epp-item" id="epp-${item.id}" onclick="toggleEpp('${item.id}')">
                        <i class="fas ${item.icon}"></i>
                        <span>${item.name}</span>
                    </div>
                `).join('')}
            </div>

            <div style="text-align:center; margin-top:30px;">
                <button id="btnCheckEpp" class="btn btn-primary btn-lg" onclick="checkEppScenario()">¡Equipar Trabajador!</button>
            </div>
            <div id="epp-feedback" class="fb-feedback" style="padding:15px; border-radius:8px; margin-top:20px;"></div>
        </div>
    `;
    pageContentEl.innerHTML = html;
};

window.toggleEpp = function(id) {
    const el = document.getElementById(`epp-${id}`);
    if (el.classList.contains('locked')) return; 

    if (window.eppState.selected.has(id)) {
        window.eppState.selected.delete(id);
        el.classList.remove('selected');
    } else {
        window.eppState.selected.add(id);
        el.classList.add('selected');
    }
};

window.checkEppScenario = function() {
    document.getElementById('btnCheckEpp').disabled = true;
    const state = window.eppState;
    const scenario = state.scenarios[state.current];
    const required = new Set(scenario.requiredEpp);
    const selected = state.selected;

    let isPerfect = true;
    const maxPointsPerScenario = 100 / state.scenarios.length;

    // Evaluamos visualmente cada ítem
    state.pool.forEach(item => {
        const el = document.getElementById(`epp-${item.id}`);
        el.classList.add('locked'); // Bloquear clics

        const isSelected = selected.has(item.id);
        const isRequired = required.has(item.id);

        if (isSelected && isRequired) {
            el.classList.add('correct');
        } else if (isSelected && !isRequired) {
            el.classList.add('error'); // Seleccionó algo que no iba
            isPerfect = false;
        } else if (!isSelected && isRequired) {
            el.classList.add('missed'); // Le faltó seleccionar esto
            isPerfect = false;
        }
    });

    if (isPerfect) state.score += maxPointsPerScenario;
    state.results.push({
        scenario: scenario.name,
        selected: Array.from(selected),
        required: Array.from(required),
        isPerfect: isPerfect,
        points: isPerfect ? Math.round(maxPointsPerScenario) : 0
    });

    const feedback = document.getElementById('epp-feedback');
    feedback.style.display = 'block';
    
    if (isPerfect) {
        feedback.style.background = '#d4edda';
        feedback.innerHTML = `<span style="color:#155724"><i class="fas fa-check-circle"></i> ¡Excelente! Selección impecable. (+${Math.round(maxPointsPerScenario)} pts)</span>`;
    } else {
        feedback.style.background = '#f8d7da';
        feedback.innerHTML = `<span style="color:#721c24"><i class="fas fa-times-circle"></i> Selección incorrecta. En seguridad, olvidar algo o usar EPP incorrecto puede ser fatal. (0 pts)</span>`;
    }

    feedback.innerHTML += `<div style="margin-top:15px;"><button class="btn btn-secondary" onclick="window.eppState.current++; renderEppScenario()">Siguiente Misión <i class="fas fa-arrow-right"></i></button></div>`;
};

window.finishEppGame = function() {
    const state = window.eppState;
    const passed = state.score >= state.passingScore;

    let html = `
        <div class="practice-container" style="text-align:center; display:flex; flex-direction:column; justify-content:center; height:100%;">
            <div class="practice-completed-card" style="border-color: ${passed ? '#28a745' : '#dc3545'}; background: ${passed ? '#f8fff9' : '#fff5f5'}">
                <i class="fas ${passed ? 'fa-medal' : 'fa-skull-crossbones'}" style="font-size: 4rem; color: ${passed ? '#f39c12' : '#dc3545'}; margin-bottom: 20px;"></i>
                <h3 style="color: ${passed ? '#28a745' : '#dc3545'};">
                    ${passed ? '¡Certificación de Equipamiento Superada!' : 'Certificación Fallida'}
                </h3>
                <p style="font-size:1.4rem; margin:15px 0;">Puntuación: <strong>${Math.round(state.score)} / 100</strong></p>
                <p style="color:#555;">${passed ? 'Has demostrado buen criterio para proteger a tu equipo.' : `Necesitas un mínimo de ${state.passingScore} puntos para avanzar. Revisa bien los requerimientos de cada tarea.`}</p>

                <button class="btn btn-secondary" style="margin-top:20px;" onclick="window.eppForcePlay=false; window.renderPage(currentPageIndex)">
                    <i class="fas fa-redo"></i> ${passed ? 'Continuar' : 'Volver a intentar'}
                </button>
            </div>
        </div>
    `;

    pageContentEl.innerHTML = html;

    if (passed) {
        if (currentPageIndex >= maxUnlockedIndex) {
            maxUnlockedIndex = currentPageIndex + 1;
            saveProgress(currentPageIndex, false);
            updateNavigationUI(currentPageIndex);
        }
        window.saveSimuladorRespuesta('eppGame', {
            score: Math.round(state.score),
            passed: passed,
            passing_score: state.passingScore,
            scenarios_results: state.results,
            completed_at: new Date().toISOString()
        });
        document.getElementById('nextPageBtn').disabled = false;
    }
};
// ============================================
// SIMULADOR DE IZAJES (CRANE SIMULATOR) - V3
// ============================================
window.renderCraneSimulator = function(page) {
    const data = page.payload;
    const isAlreadyPassed = maxUnlockedIndex > currentPageIndex;
 
    if (isAlreadyPassed && !window.craneForcePlay) {
        pageContentEl.innerHTML = `
            <div class="practice-container" style="text-align:center; display:flex; flex-direction:column; justify-content:center; height:100%;">
                <div class="cs-victory-card">
                    <div class="cs-victory-icon-sm">
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M5 14l5.5 5.5L23 8" stroke="#3B6D11" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </div>
                    <h3 class="cs-victory-title">Simulador de maniobras aprobado</h3>
                    <p class="cs-victory-sub">Sabes validar un plan de izaje con criterio técnico.</p>
                    <button class="cs-btn-replay" onclick="window.craneForcePlay=true; window.renderPage(currentPageIndex)">
                        Repasar maniobras
                    </button>
                </div>
            </div>
        `;
        document.getElementById('nextPageBtn').disabled = false;
        return;
    }
 
    window.craneForcePlay = false;
    window.craneState = {
        scenarios: data.scenarios,
        current: 0,
        completed: new Array(data.scenarios.length).fill(false)
    };
 
    if (!isAlreadyPassed) document.getElementById('nextPageBtn').disabled = true;
    window.renderCraneScenario();
};
 
window.renderCraneScenario = function() {
    const state = window.craneState;
 
    if (state.current >= state.scenarios.length) {
        window.finishCraneGame();
        return;
    }
 
    const sc = state.scenarios[state.current];
    const total = state.scenarios.length;
    const craneImageUrl = "https://www.gruasyequiposgarcia.com/wp-content/uploads/2013/08/10_Grua-izaje-de-base-para-turbina-eolica.jpg";
 
    const dots = state.scenarios.map((_, i) => {
        let cls = 'cs-dot';
        if (i < state.current) cls += ' done';
        if (i === state.current) cls += ' active';
        return `<div class="${cls}"></div>`;
    }).join('');
 
    const windClass = !sc.hideData && sc.wind > 48 ? 'cs-val-danger' : !sc.hideData ? 'cs-val-ok' : '';
 
    pageContentEl.innerHTML = `
        <div class="cs-wrap">
            <div class="cs-header">
                <p class="cs-title">Simulador de izajes</p>
                <div class="cs-progress-wrap">
                    <div class="cs-dots">${dots}</div>
                    <span class="cs-progress-label">Maniobra ${state.current + 1} / ${total}</span>
                </div>
            </div>
 
            <div class="cs-card">
                <div class="cs-scene">
                    <div class="cs-img-box">
                        <img src="${craneImageUrl}" alt="Grúa industrial en operación">
                    </div>
                    <div class="cs-context-box">
                        <p class="cs-context-label">Reporte del supervisor</p>
                        <p class="cs-context-text">${sc.context}</p>
                    </div>
                </div>
 
                <div class="cs-data-grid">
                    <div class="cs-panel">
                        <p class="cs-panel-title">Tablero de datos</p>
                        <div class="cs-data-row">
                            <span class="cs-data-label">Peso de carga</span>
                            <span class="cs-data-val">${sc.hideData ? '<span class="cs-val-hidden">Ver reporte</span>' : Number(sc.load).toLocaleString() + ' kg'}</span>
                        </div>
                        <div class="cs-data-row">
                            <span class="cs-data-label">Peso de accesorios</span>
                            <span class="cs-data-val">${sc.hideData ? '<span class="cs-val-hidden">Ver reporte</span>' : Number(sc.rigging).toLocaleString() + ' kg'}</span>
                        </div>
                        <div class="cs-data-row">
                            <span class="cs-data-label">CMU (tabla)</span>
                            <span class="cs-data-val cs-val-cmu">${sc.hideData ? '<span class="cs-val-hidden">Ver reporte</span>' : Number(sc.cmu).toLocaleString() + ' kg'}</span>
                        </div>
                        <div class="cs-data-row">
                            <span class="cs-data-label">Velocidad de viento</span>
                            <span class="cs-data-val ${windClass}">${sc.hideData ? '<span class="cs-val-hidden">Ver reporte</span>' : sc.wind + ' km/h'}</span>
                        </div>
                    </div>
 
                    <div class="cs-panel">
                        <p class="cs-panel-title">Tu validación</p>
                        <label class="cs-input-label" for="craneGross">Carga bruta calculada (kg)</label>
                        <input class="cs-input" type="number" id="craneGross" placeholder="Ej: 6500">
                        <label class="cs-input-label" for="cranePercent">Porcentaje de capacidad (%W)</label>
                        <input class="cs-input" type="number" id="cranePercent" placeholder="Ej: 68.9" step="0.1">
                    </div>
                </div>
 
                <div id="craneMathError" class="cs-math-error"></div>
 
                <div class="cs-actions">
                    <p class="cs-actions-label">Decisión del supervisor</p>
                    <div class="cs-btn-row">
                        <button class="cs-btn cs-btn-authorize" onclick="window.checkCrane('authorize')">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            Autorizar izaje
                        </button>
                        <button class="cs-btn cs-btn-reject" onclick="window.checkCrane('reject')">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                            Suspender / rechazar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
};
 
window.checkCrane = function(decision) {
    const state = window.craneState;
    const sc = state.scenarios[state.current];
 
    const grossInput = parseFloat(document.getElementById('craneGross').value);
    const percentInput = parseFloat(document.getElementById('cranePercent').value);
    const errEl = document.getElementById('craneMathError');
    const inG = document.getElementById('craneGross');
    const inP = document.getElementById('cranePercent');
 
    inG.classList.remove('input-error');
    inP.classList.remove('input-error');
 
    const realGross = sc.load + sc.rigging;
    const realPercent = parseFloat(((realGross / sc.cmu) * 100).toFixed(1));
 
    if (isNaN(grossInput) || isNaN(percentInput)) {
        errEl.style.display = 'block';
        errEl.textContent = 'Ingresa tus cálculos antes de tomar una decisión.';
        if (isNaN(grossInput)) inG.classList.add('input-error');
        if (isNaN(percentInput)) inP.classList.add('input-error');
        return;
    }
 
    if (grossInput !== realGross || Math.abs(percentInput - realPercent) > 1.0) {
        errEl.style.display = 'block';
        errEl.innerHTML = `<strong>Cálculo incorrecto.</strong> La carga bruta real es ${realGross.toLocaleString()} kg y el %W es ${realPercent}%. Revisa tus números e intenta de nuevo.`;
        if (grossInput !== realGross) inG.classList.add('input-error');
        if (Math.abs(percentInput - realPercent) > 1.0) inP.classList.add('input-error');
        return;
    }
 
    errEl.style.display = 'none';
 
    // Deshabilitar botones para evitar doble clic
    document.querySelectorAll('.cs-btn-authorize, .cs-btn-reject').forEach(b => b.disabled = true);
 
    const correct = decision === sc.correctDecision;
    window.showCraneModal(correct, sc, realGross, realPercent);
};
 
window.showCraneModal = function(correct, sc, gross, pct) {
    // Eliminar modal anterior si existe
    const existing = document.getElementById('craneModalOverlay');
    if (existing) existing.remove();
 
    const overlay = document.createElement('div');
    overlay.id = 'craneModalOverlay';
    overlay.className = 'cs-modal-overlay';
    overlay.innerHTML = `
        <div class="cs-modal" role="dialog" aria-modal="true">
            <div class="cs-modal-icon ${correct ? 'success' : 'fatal'}">
                ${correct
                    ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12l4.5 4.5L19 7" stroke="#3B6D11" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                    : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#A32D2D" stroke-width="2.5" stroke-linecap="round"/></svg>'
                }
            </div>
            <p class="cs-modal-title ${correct ? 'success' : 'fatal'}">${correct ? 'Decisión correcta' : 'Decisión incorrecta'}</p>
            <p class="cs-modal-body">${correct ? 'Tu análisis técnico es correcto.' : 'Esta decisión pone vidas en riesgo.'}</p>
            <div class="cs-modal-detail">
                <strong>Carga bruta:</strong> ${gross.toLocaleString()} kg &nbsp;|&nbsp; <strong>%W:</strong> ${pct}%<br><br>
                ${sc.explanation}
            </div>
            <button class="cs-modal-btn ${correct ? 'success' : 'fatal'}" id="craneModalActionBtn">
                ${correct ? 'Continuar a la siguiente maniobra →' : 'Reintentar esta maniobra'}
            </button>
        </div>
    `;
 
    document.body.appendChild(overlay);
 
    document.getElementById('craneModalActionBtn').addEventListener('click', function() {
        overlay.remove();
        if (correct) {
            window.craneState.completed[window.craneState.current] = true;
            window.craneState.current++;
            window.renderCraneScenario();
        } else {
            window.renderCraneScenario();
        }
    });
};
 
window.finishCraneGame = function() {
    const state = window.craneState;
    const payloadToSave = {
        completed_at: new Date().toISOString(),
        scenarios_completed: state ? state.completed : [],
        // Guardar también las decisiones por escenario si las almacenaste
        // Si no tienes registro de decisiones, omite esta parte
    };

    if (currentPageIndex >= maxUnlockedIndex) {
        maxUnlockedIndex = currentPageIndex + 1;
        saveProgress(currentPageIndex, false);
        updateNavigationUI(currentPageIndex);
    }
    window.saveSimuladorRespuesta('craneSimulator', payloadToSave);
    document.getElementById('nextPageBtn').disabled = false;
    window.craneForcePlay = false;
};

window.renderChecklistBuilder = function(page) {
    const payload = page.payload;
    const isCompleted = !payload.embedded && maxUnlockedIndex > currentPageIndex;
    const blankMode = payload.blankMode || !payload.cases || payload.cases.length === 0;

    if (blankMode) {
        if (!window.checklistBlankState) {
            window.checklistBlankState = { container: null, items: [], submitted: false };
        }
        // Asegurar que container se mantenga al reasignar (por si se creó desde el integrador)
        if (window.checklistBlankState.container === undefined) {
            window.checklistBlankState.container = null;
        }
    }

    if (isCompleted) {
        const message = blankMode ? 'Ya enviaste tu checklist para revisión.' : 'Ya enviaste tu checklist para revisión del instructor.';
        pageContentEl.innerHTML = `
            <div style="text-align:center; padding:60px 20px;">
                <div style="font-size:64px;">✅</div>
                <h2 style="color:#2e7d32;">Simulador completado</h2>
                <p style="color:#555;">${message}</p>
                <button onclick="window.renderPage(currentPageIndex)" 
                    style="margin-top:20px; padding:10px 24px; background:#1a3a5c; color:white; border:none; border-radius:6px; cursor:pointer;">
                    Revisar mis respuestas
                </button>
            </div>`;
        return;
    }

    if (blankMode) {
        function renderBlankChecklist() {
            const container = window.checklistBlankState.container || pageContentEl;
            const items = window.checklistBlankState.items;
            const categories = ['Gente', 'Equipos', 'Materiales', 'Ambiente'];
            let itemsHtml = '';
            
            items.forEach((item, idx) => {
                itemsHtml += `
                    <div style="display:flex; gap:10px; align-items:center; background:#f8f9fa; padding:10px 15px; border-radius:8px; margin-bottom:8px;">
                        <select id="blank_cat_${idx}" data-index="${idx}" class="blank-cat-select" style="width:130px; padding:8px; border:1px solid #ddd; border-radius:6px;">
                            ${categories.map(cat => `<option value="${cat}" ${item.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                        </select>
                        <input type="text" id="blank_desc_${idx}" data-index="${idx}" class="blank-desc-input" value="${item.description || ''}" placeholder="Descripción del elemento a verificar" style="flex:1; padding:8px; border:1px solid #ddd; border-radius:6px;">
                        <button onclick="window.checklistRemoveItem(${idx})" style="background:none; border:none;  cursor:pointer; color:#999;">🗑️</button>
                    </div>
                `;
            });

            pageContentEl.innerHTML = `
                <div style="max-width:900px; margin:0 auto; padding:20px;">
                    <h2 style="color:#1a3a5c;">${payload.title || 'Checklist de Seguridad'}</h2>
                    <p style="color:#555; margin-bottom:20px;">${payload.instruction || 'Identifica los elementos de verificación usando las categorías GEMA.'}</p>
                    <div style="margin-bottom:20px;">
                        <button onclick="window.checklistAddItem()" style="padding:8px 20px; background:#1a3a5c; color:white; border:none; border-radius:6px; cursor:pointer; font-size:14px;">
                            ➕ Agregar elemento
                        </button>
                    </div>
                    <div id="blankChecklistItems">
                        ${itemsHtml || '<p style="color:#999; text-align:center; padding:30px;">No hay elementos. Agrega uno usando el botón superior.</p>'}
                    </div>
                    <div style="margin-top:30px; text-align:right;">
                        <button onclick="window.checklistSubmitBlank()" style="padding:12px 30px; background:#2e7d32; color:white; border:none; border-radius:6px; cursor:pointer; font-size:16px; font-weight:600;">
                            ✅ Enviar checklist
                        </button>
                    </div>
                </div>
            `;

            document.querySelectorAll('.blank-cat-select, .blank-desc-input').forEach(el => {
                el.addEventListener('change', function() {
                    const idx = this.dataset.index;
                    const field = this.classList.contains('blank-cat-select') ? 'category' : 'description';
                    window.checklistBlankState.items[idx][field] = this.value;
                });
                el.addEventListener('input', function() {
                    const idx = this.dataset.index;
                    const field = this.classList.contains('blank-cat-select') ? 'category' : 'description';
                    window.checklistBlankState.items[idx][field] = this.value;
                });
            });
        }

        window.checklistAddItem = function() {
            window.checklistBlankState.items.push({ category: 'Gente', description: '' });
            renderBlankChecklist();
        };

        window.checklistRemoveItem = function(idx) {
            window.checklistBlankState.items.splice(idx, 1);
            renderBlankChecklist();
        };

        window.checklistSubmitBlank = function() {
            if (!confirm('¿Enviar checklist para revisión?')) return;
            const saveAs = payload.saveAs || 'checklistBuilder';
            window.saveSimuladorRespuesta(saveAs, { completed_at: new Date().toISOString(), items: window.checklistBlankState.items });
            maxUnlockedIndex = Math.max(maxUnlockedIndex, currentPageIndex + 1);
            saveProgress(currentPageIndex, false);
            nextPageBtn.disabled = false;
            pageContentEl.innerHTML = `
                <div style="text-align:center; padding:60px 20px;">
                    <div style="font-size:64px;">📋</div>
                    <h2 style="color:#2e7d32;">Checklist enviado</h2>
                    <p style="color:#555; max-width:500px; margin:0 auto;">Tu instructor revisará los elementos que identificaste.</p>
                </div>`;
        };

        renderBlankChecklist();
        return;
    }

    let currentCaseIndex = 0;

    function renderCase(index) {
        const c = payload.cases[index];
        const totalCases = payload.cases.length;

        // Estilos corregidos para forzar el scroll horizontal
        const tableStyle = `
            <style>
                .chk-scroll-wrapper { width: 100%; overflow-x: auto; padding-bottom: 15px; margin-bottom: 20px; }
                .chk-scroll-wrapper::-webkit-scrollbar { height: 12px; }
                .chk-scroll-wrapper::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 4px; border: 1px solid #ccc; }
                .chk-scroll-wrapper::-webkit-scrollbar-thumb { background: #1a3a5c; border-radius: 4px; }
                .chk-scroll-wrapper::-webkit-scrollbar-thumb:hover { background: #0d2136; }

                /* La tabla tiene un ancho fijo mínimo muy grande para que no se aplaste */
                .chk-table { width: 100%; min-width: 1400px; table-layout: fixed; border-collapse: collapse; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #fff; border: 2px solid #333; }
                .chk-table th, .chk-table td { border: 1px solid #555; padding: 6px; vertical-align: middle; word-wrap: break-word; }
                
                .chk-bg-dark { background-color: #1a3a5c; color: #fff; font-weight: bold; text-align: center; text-transform: uppercase; }
                .chk-bg-grey { background-color: #e2e6ea; font-weight: bold; color: #1a3a5c; text-transform: uppercase; }
                .chk-bg-light { background-color: #f8f9fa; text-align: center; font-weight: bold; }
                .chk-center { text-align: center; }
                
                .chk-input-text { width: 100%; border: none; background: #fffdf2; padding: 6px; box-sizing: border-box; font-size: 12px; outline: none; border-bottom: 1px solid #ccc; color: #333; }
                .chk-input-text:focus { background: #e8f0fe; border-bottom: 2px solid #1a3a5c; }
                .chk-meta-input { border: none; border-bottom: 1px solid #555; background: transparent; font-size: 12px; width: 100%; box-sizing: border-box; outline: none; text-transform: uppercase; color: #000; font-weight: 600; }
            </style>
        `;

        // Generar encabezados (Metadatos)
        let headerFieldsHTML = '';
        for (let i = 0; i < c.checklist_header.fields.length; i += 2) {
            const f1 = c.checklist_header.fields[i];
            const f2 = c.checklist_header.fields[i + 1];

            headerFieldsHTML += `<tr>`;
            headerFieldsHTML += `<td colspan="2" class="chk-bg-grey" style="text-align:right;">${f1.label}:</td>`;
            headerFieldsHTML += `<td colspan="1">
                ${f1.editable ? `<input type="text" id="header_${f1.id}" class="chk-meta-input" placeholder="${f1.placeholder || ''}">` : `<b style="font-size:12px; text-transform:uppercase;">${f1.value}</b>`}
            </td>`;
            
            if (f2) {
                headerFieldsHTML += `<td colspan="7" class="chk-bg-grey" style="text-align:right;">${f2.label}:</td>`;
                headerFieldsHTML += `<td colspan="7">
                    ${f2.editable ? `<input type="text" id="header_${f2.id}" class="chk-meta-input" placeholder="${f2.placeholder || ''}">` : `<b style="text-transform:uppercase;">${f2.value}</b>`}
                </td>`;
            } else {
                headerFieldsHTML += `<td colspan="7" class="chk-bg-grey"></td><td colspan="7"></td>`;
            }
            headerFieldsHTML += `</tr>`;
        }

        // Generar filas del cuerpo (GEMA). Forzamos 4 filas por categoría (1 título + 3 inputs).
        const numCategorias = c.gema_guide.categories.length;
        const totalBodyRows = numCategorias * 4; 

        let rowsHTML = '';
        c.gema_guide.categories.forEach((cat, catIndex) => {
            rowsHTML += `<tr>`;
            
            // La celda de la imagen solo se crea en la primera fila (GENTE) y abarca hacia abajo (rowspan)
            if (catIndex === 0) {
                rowsHTML += `<td rowspan="${totalBodyRows}" style="padding: 10px; text-align: center; background:#fff; vertical-align:middle; min-width: 120px;">
                                <img src="${c.image}" alt="${c.title}" style="max-width: 100%; height: auto; max-height: 300px; object-fit: contain;">
                             </td>`;
            }
            
            rowsHTML += `<td colspan="2" class="chk-bg-grey chk-center" title="${cat.explanation}">${cat.label}</td>`;
            for(let i = 0; i < 14; i++) rowsHTML += `<td class="chk-bg-light"></td>`;
            rowsHTML += `</tr>`;
            
            // Forzamos la creación de 3 inputs exactos
            for(let i = 0; i < 3; i++) {
                const placeholder = (cat.inputs[i] && cat.inputs[i].placeholder) ? cat.inputs[i].placeholder : `Elemento ${i+1} relacionado con ${cat.label.split('—')[1].trim()}...`;
                const inputId = cat.inputs[i] ? cat.inputs[i].id : `elem${i+1}`;
                
                rowsHTML += `<tr>`;
                rowsHTML += `<td class="chk-center" style="font-weight: bold; font-size: 12px; color: #1a3a5c;">${i + 1}</td>`;
                rowsHTML += `<td><input type="text" id="input_${c.id}_${cat.id}_${inputId}" class="chk-input-text" placeholder="${placeholder}"></td>`;
                for(let j = 0; j < 14; j++) rowsHTML += `<td></td>`;
                rowsHTML += `</tr>`;
            }
        });

        pageContentEl.innerHTML = `
            ${tableStyle}
            <div style="width: 100%; box-sizing: border-box; padding: 20px 0;">
                <h2 style="color:#1a3a5c; margin:0 0 8px;">Caso ${index + 1}/${totalCases}: Construcción de Formato</h2>
                <p style="color:#555; font-size:14px; margin-bottom:20px;">${payload.instruction}</p>
                
                <div style="background:#fff; border-left:4px solid #1a3a5c; padding:15px; margin-bottom:20px; font-size:13px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                    <strong>Contexto Técnico:</strong> ${c.description}
                </div>

                <div class="chk-scroll-wrapper">
                    <table class="chk-table">
                        <colgroup>
                            <col style="width: 10%;"> <col style="width: 3%;">  <col style="width: 45%;"> <col style="width: 3%;"><col style="width: 3%;"> <col style="width: 3%;"><col style="width: 3%;"> <col style="width: 3%;"><col style="width: 3%;"> <col style="width: 3%;"><col style="width: 3%;"> <col style="width: 3%;"><col style="width: 3%;"> <col style="width: 3%;"><col style="width: 3%;"> <col style="width: 3%;"><col style="width: 3%;"> </colgroup>

                        <tr>
                            <td colspan="3" style="text-align: center; padding: 12px;">
                                <div style="font-size: 18px; font-weight: 900; color: #2e7d32; letter-spacing: 1px;">AULA CORPORATIVA</div>
                            </td>
                            <td colspan="14" style="text-align: center; font-size: 16px; font-weight: bold; color: #1a3a5c; text-transform: uppercase;">
                                CHECK LIST DE ${c.title}
                            </td>
                        </tr>
                        
                        ${headerFieldsHTML}

                        <tr>
                            <td colspan="3" rowspan="2" class="chk-bg-grey chk-center" style="font-size: 13px;">CRITERIOS A EVALUAR</td>
                            <td colspan="14" class="chk-bg-grey chk-center">CUMPLIMIENTO</td>
                        </tr>
                        <tr>
                            <td colspan="2" class="chk-bg-light">LUN</td>
                            <td colspan="2" class="chk-bg-light">MAR</td>
                            <td colspan="2" class="chk-bg-light">MIE</td>
                            <td colspan="2" class="chk-bg-light">JUE</td>
                            <td colspan="2" class="chk-bg-light">VIE</td>
                            <td colspan="2" class="chk-bg-light">SAB</td>
                            <td colspan="2" class="chk-bg-light">DOM</td>
                        </tr>
                        <tr>
                            <td colspan="3" class="chk-bg-dark" style="font-size: 10px;">INSTRUCCIÓN: REDACTA LOS PUNTOS DE INSPECCIÓN. LAS COLUMNAS DE DÍAS ESTÁN DESHABILITADAS.</td>
                            <td class="chk-bg-light">SI</td><td class="chk-bg-light">NO</td>
                            <td class="chk-bg-light">SI</td><td class="chk-bg-light">NO</td>
                            <td class="chk-bg-light">SI</td><td class="chk-bg-light">NO</td>
                            <td class="chk-bg-light">SI</td><td class="chk-bg-light">NO</td>
                            <td class="chk-bg-light">SI</td><td class="chk-bg-light">NO</td>
                            <td class="chk-bg-light">SI</td><td class="chk-bg-light">NO</td>
                            <td class="chk-bg-light">SI</td><td class="chk-bg-light">NO</td>
                        </tr>

                        ${rowsHTML}

                        <tr>
                            <td colspan="17" class="chk-bg-grey">OBSERVACIONES:</td>
                        </tr>
                        <tr>
                            <td colspan="17" style="height: 40px;"><input type="text" class="chk-input-text" style="background:transparent; border-bottom:none;"></td>
                        </tr>
                        <tr>
                            <td colspan="5" class="chk-center" style="height: 80px; vertical-align: bottom; padding-bottom: 10px;">
                                _________________________________<br><br>FIRMA Y NOMBRE<br>TRABAJADOR
                            </td>
                            <td colspan="7" class="chk-center" style="height: 80px; vertical-align: bottom; padding-bottom: 10px;">
                                _________________________________<br><br>FIRMA Y NOMBRE<br>SUPERVISOR DE SEGURIDAD
                            </td>
                            <td colspan="5" class="chk-center" style="height: 80px; vertical-align: bottom; padding-bottom: 10px;">
                                _________________________________<br><br>FIRMA Y NOMBRE<br>ENCARGADO DE OBRA
                            </td>
                        </tr>
                    </table>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 10px;">
                    ${index > 0 ? `<button onclick="renderCase(${index - 1})" style="padding:10px 20px; background:#e0e0e0; border:none; border-radius:6px; cursor:pointer; font-size:14px; color:#333; font-weight:bold;">← Caso anterior</button>` : `<div></div>`}
                    ${index < totalCases - 1 
                        ? `<button onclick="renderCase(${index + 1})" style="padding:10px 20px; background:#1a3a5c; color:white; border:none; border-radius:6px; cursor:pointer; font-size:14px; font-weight:bold;">Siguiente caso →</button>` 
                        : `<button onclick="submitChecklist()" style="padding:12px 28px; background:#2e7d32; color:white; border:none; border-radius:6px; cursor:pointer;  font-weight:bold; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">✅ Enviar para revisión</button>`
                    }
                </div>
            </div>`;
    }

    window.submitChecklist = function() {
        maxUnlockedIndex = Math.max(maxUnlockedIndex, currentPageIndex + 1);
        saveProgress(currentPageIndex, false);
        window.saveSimuladorRespuesta('checklistBuilder', { completed_at: new Date().toISOString() });
        nextPageBtn.disabled = false;
        pageContentEl.innerHTML = `
            <div style="text-align:center; padding:60px 20px;">
                <div style="font-size:64px;">📋</div>
                <h2 style="color:#2e7d32;">Checklist enviado</h2>
                <p style="color:#555; max-width:500px; margin:0 auto;">Tu instructor revisará los elementos que identificaste y te dará retroalimentación. Puedes continuar.</p>
            </div>`;
    };

    renderCase(0);
};

window.renderAccidentInvestigation = function(page) {
    const payload = page.payload;
    const isCompleted = !payload.embedded && maxUnlockedIndex > currentPageIndex;

    // ⭐ Determinar modo vacío
    const blankMode = payload.blankMode || !payload.scenarios || payload.scenarios.length === 0;

    // Estado para modo vacío
    if (blankMode) {
        if (!window.aiBlankState) {
            window.aiBlankState = {
                currentSheet: 0,
                hechos: {
                    fecha: '', hora: '', lugar: '', involucrado: '', puesto: '', antiguedad: '',
                    testigos: '', lesion: '', atencion: '', actividad: '', secuencia: ''
                },
                cincoPorques: {
                    hechoCentral: '',
                    porque1: '', porque2: '', porque3: '', porque4: '', porque5: '',
                    causaRaizResumen: ''
                },
                entrega: {
                    quePaso: '', causasInmediatas: '', causasBasicas: '', causaRaiz: '', planAccion: ''
                },
                submitted: false
            };
        }
    }

    if (isCompleted) {
        const message = blankMode
            ? 'Ya enviaste tu investigación para revisión del instructor.'
            : 'Ya enviaste tu investigación para revisión del instructor.';
        pageContentEl.innerHTML = `
            <div style="text-align:center; padding:60px 20px;">
                <div style="font-size:64px;">✅</div>
                <h2 style="color:#2e7d32;">Simulación completada</h2>
                <p style="color:#555;">${message}</p>
                <button onclick="window.renderPage(currentPageIndex)"
                    style="margin-top:20px; padding:10px 24px; background:#1a3a5c; color:white; border:none; border-radius:6px; cursor:pointer;">
                    Revisar mis respuestas
                </button>
            </div>`;
        return;
    }

    // ========== MODO VACÍO ==========
    if (blankMode) {
        const state = window.aiBlankState;

        function renderBlankSheet() {
            const container = window.aiBlankState.container || pageContentEl;
            const sheetIndex = state.currentSheet;
            const sheetNames = ['Hechos', '5 Porqués', 'Entrega'];
            const sheetId = ['hechos', 'cincoPorques', 'entrega'][sheetIndex];

            const progressDots = sheetNames.map((name, i) => `
                <div style="flex:1; height:4px; border-radius:2px;
                    background:${i <= sheetIndex ? '#1a3a5c' : '#e0e0e0'};"></div>
            `).join('');

            let contentHtml = '';
            if (sheetId === 'hechos') {
                contentHtml = `
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        ${['fecha','hora','lugar','involucrado','puesto','antiguedad','testigos','lesion','atencion'].map(field => `
                            <div>
                                <label style="font-weight:600; font-size:0.8rem;">${field.charAt(0).toUpperCase()+field.slice(1)}</label>
                                <input type="text" id="ai_hechos_${field}" value="${state.hechos[field] || ''}" placeholder="${field}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px;">
                            </div>
                        `).join('')}
                        <div style="grid-column:span 2;">
                            <label style="font-weight:600;">Actividad que realizaba</label>
                            <textarea id="ai_hechos_actividad" rows="2" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px;">${state.hechos.actividad || ''}</textarea>
                        </div>
                        <div style="grid-column:span 2;">
                            <label style="font-weight:600;">Secuencia de hechos</label>
                            <textarea id="ai_hechos_secuencia" rows="3" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px;">${state.hechos.secuencia || ''}</textarea>
                        </div>
                    </div>
                `;
            } else if (sheetId === 'cincoPorques') {
                contentHtml = `
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <div><label>Hecho central</label><textarea id="ai_cp_hechoCentral" rows="2" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px;">${state.cincoPorques.hechoCentral || ''}</textarea></div>
                        ${[1,2,3,4,5].map(n => `
                            <div><label>¿Por qué? (${n})</label><textarea id="ai_cp_porque${n}" rows="2" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px;">${state.cincoPorques['porque'+n] || ''}</textarea></div>
                        `).join('')}
                        <div><label>Causa raíz (resumen)</label><textarea id="ai_cp_causaRaizResumen" rows="2" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px;">${state.cincoPorques.causaRaizResumen || ''}</textarea></div>
                    </div>
                `;
            } else {
                contentHtml = `
                    <div style="display:flex; flex-direction:column; gap:16px;">
                        <div><label>1. ¿Qué pasó?</label><textarea id="ai_ent_quePaso" rows="3" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px;">${state.entrega.quePaso || ''}</textarea></div>
                        <div><label>2. Causas inmediatas</label><textarea id="ai_ent_causasInmediatas" rows="3" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px;">${state.entrega.causasInmediatas || ''}</textarea></div>
                        <div><label>3. Causas básicas</label><textarea id="ai_ent_causasBasicas" rows="3" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px;">${state.entrega.causasBasicas || ''}</textarea></div>
                        <div><label>4. Causa raíz</label><textarea id="ai_ent_causaRaiz" rows="2" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px;">${state.entrega.causaRaiz || ''}</textarea></div>
                        <div><label>5. Plan de acción</label><textarea id="ai_ent_planAccion" rows="4" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px;">${state.entrega.planAccion || ''}</textarea></div>
                    </div>
                `;
            }

            pageContentEl.innerHTML = `
                <div style="max-width:800px; margin:0 auto; padding:20px;">
                    <h2 style="color:#1a3a5c;">${payload.title || 'Investigación de Accidente'}</h2>
                    <p style="color:#555; margin-bottom:20px;">${payload.instruction || 'Completa las tres hojas de investigación basándote en la evidencia disponible.'}</p>

                    <div style="display:flex; gap:6px; margin-bottom:24px;">
                        ${progressDots}
                    </div>

                    <h3 style="color:#1a3a5c; margin:0 0 16px;">${sheetNames[sheetIndex]}</h3>

                    <div style="background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:24px; margin-bottom:24px;">
                        ${contentHtml}
                    </div>

                    <div style="display:flex; justify-content:space-between;">
                        ${sheetIndex > 0
                            ? `<button onclick="window.aiBlankPrev()" style="padding:10px 20px; background:#e0e0e0; border:none; border-radius:6px; cursor:pointer;">← Anterior</button>`
                            : `<div></div>`
                        }
                        ${sheetIndex < 2
                            ? `<button onclick="window.aiBlankNext()" style="padding:10px 24px; background:#1a3a5c; color:white; border:none; border-radius:6px; cursor:pointer;">Siguiente →</button>`
                            : `<button onclick="window.aiBlankSubmit()" style="padding:10px 24px; background:#2e7d32; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">✅ Enviar investigación</button>`
                        }
                    </div>
                </div>
            `;

            // Sincronizar eventos de guardado
            if (sheetId === 'hechos') {
                ['fecha','hora','lugar','involucrado','puesto','antiguedad','testigos','lesion','atencion','actividad','secuencia'].forEach(field => {
                    const el = document.getElementById(`ai_hechos_${field}`);
                    if (el) {
                        el.addEventListener('input', () => { state.hechos[field] = el.value; });
                    }
                });
            } else if (sheetId === 'cincoPorques') {
                ['hechoCentral','porque1','porque2','porque3','porque4','porque5','causaRaizResumen'].forEach(field => {
                    const el = document.getElementById(`ai_cp_${field}`);
                    if (el) {
                        el.addEventListener('input', () => { state.cincoPorques[field] = el.value; });
                    }
                });
            } else {
                ['quePaso','causasInmediatas','causasBasicas','causaRaiz','planAccion'].forEach(field => {
                    const el = document.getElementById(`ai_ent_${field}`);
                    if (el) {
                        el.addEventListener('input', () => { state.entrega[field] = el.value; });
                    }
                });
            }
        }

        window.aiBlankPrev = function() {
            if (window.aiBlankState.currentSheet > 0) {
                window.aiBlankState.currentSheet--;
                renderBlankSheet();
                window.scrollTo(0, 0);
            }
        };

        window.aiBlankNext = function() {
            if (window.aiBlankState.currentSheet < 2) {
                window.aiBlankState.currentSheet++;
                renderBlankSheet();
                window.scrollTo(0, 0);
            }
        };

        window.aiBlankSubmit = function() {
            if (!confirm('¿Enviar investigación para revisión?')) return;

            const saveAs = payload.saveAs || 'accidentInvestigation';
            window.saveSimuladorRespuesta(saveAs, {
                completed_at: new Date().toISOString(),
                hechos: window.aiBlankState.hechos,
                cincoPorques: window.aiBlankState.cincoPorques,
                entrega: window.aiBlankState.entrega
            });

            maxUnlockedIndex = Math.max(maxUnlockedIndex, currentPageIndex + 1);
            saveProgress(currentPageIndex, false);
            nextPageBtn.disabled = false;

            pageContentEl.innerHTML = `
                <div style="text-align:center; padding:60px 20px;">
                    <div style="font-size:64px;">📋</div>
                    <h2 style="color:#2e7d32;">Investigación enviada</h2>
                    <p style="color:#555;">Tu instructor revisará tu análisis.</p>
                </div>`;
        };

        renderBlankSheet();
        return;
    }

    // ========== MODO ORIGINAL (CON ESCENARIOS Y AUDIO) ==========
    let currentScenarioIndex = 0;
    let currentSheetIndex = 0;

    window.aiGoNext = function() {
        const scenario = payload.scenarios[currentScenarioIndex];
        if (currentSheetIndex < scenario.sheets.length - 1) {
            currentSheetIndex++;
        } else if (currentScenarioIndex < payload.scenarios.length - 1) {
            currentScenarioIndex++;
            currentSheetIndex = 0;
        }
        renderSheet();
        window.scrollTo(0, 0);
    };

    window.aiGoBack = function() {
        if (currentSheetIndex > 0) {
            currentSheetIndex--;
        } else if (currentScenarioIndex > 0) {
            currentScenarioIndex--;
            const prevScenario = payload.scenarios[currentScenarioIndex];
            currentSheetIndex = prevScenario.sheets.length - 1;
        }
        renderSheet();
        window.scrollTo(0, 0);
    };

    window.aiSubmit = function() {
        const respuestas = payload.scenarios.map(scenario => {
            const sheetsData = {};
            scenario.sheets.forEach(sheet => {
                sheetsData[sheet.id] = {};
                sheet.fields.forEach(field => {
                    const input = document.getElementById(`field_${scenario.id}_${field.id}`);
                    sheetsData[sheet.id][field.id] = input ? input.value : '';
                });
            });
            return {
                scenario_id: scenario.id,
                scenario_title: scenario.title,
                sheets: sheetsData
            };
        });
    
        const payloadToSave = {
            completed_at: new Date().toISOString(),
            respuestas: respuestas
        };
    
        maxUnlockedIndex = Math.max(maxUnlockedIndex, currentPageIndex + 1);
        saveProgress(currentPageIndex, false);
        window.saveSimuladorRespuesta('accidentInvestigation', payloadToSave);
        nextPageBtn.disabled = false;
    
        pageContentEl.innerHTML = `
            <div style="text-align:center; padding:60px 20px;">
                <div style="font-size:64px;">📋</div>
                <h2 style="color:#2e7d32;">Investigación enviada</h2>
                <p style="color:#555; max-width:500px; margin:0 auto; line-height:1.6;">
                    Tu instructor revisará la redacción de hechos y el análisis de causa raíz
                    de ambos escenarios. Puedes continuar con la siguiente sección.
                </p>
            </div>`;
    };

    function renderSheet() {
        const scenario = payload.scenarios[currentScenarioIndex];
        const sheet = scenario.sheets[currentSheetIndex];
        const totalScenarios = payload.scenarios.length;
        const totalSheets = scenario.sheets.length;
        const isLastSheet = currentSheetIndex === totalSheets - 1;
        const isLastScenario = currentScenarioIndex === totalScenarios - 1;
        const isFirstSheet = currentSheetIndex === 0;
        const isFirstScenario = currentScenarioIndex === 0;

        const fieldsHTML = sheet.fields.map(f => `
            <div style="margin-bottom:20px;">
                <label style="display:block; font-weight:600; color:#1a3a5c; margin-bottom:4px; font-size:14px;">
                    ${f.label}
                </label>
                ${f.guide_note ? `
                    <div style="font-size:13px; color:#555; background:#fff8e1; border-left:3px solid #f9a825;
                        padding:8px 12px; border-radius:4px; margin-bottom:8px; line-height:1.5;">
                        ${f.guide_note}
                    </div>` : ''}
                ${f.type === 'textarea'
                    ? `<textarea id="field_${scenario.id}_${f.id}" rows="4" placeholder="${f.placeholder || ''}"
                        style="width:100%; box-sizing:border-box; border:1px solid #ddd; border-radius:4px;
                        padding:10px; font-size:14px; font-family:sans-serif; resize:vertical;"></textarea>`
                    : `<input type="text" id="field_${scenario.id}_${f.id}" placeholder="${f.placeholder || ''}"
                        style="width:100%; box-sizing:border-box; border:1px solid #ddd; border-radius:4px;
                        padding:10px; font-size:14px;">`
                }
            </div>
        `).join('');

        pageContentEl.innerHTML = `
            <div style="max-width:800px; margin:0 auto; font-family:sans-serif; padding:20px;">

                <div style="display:flex; gap:8px; margin-bottom:20px; flex-wrap:wrap;">
                    ${payload.scenarios.map((s, i) => `
                        <div style="padding:6px 14px; border-radius:20px; font-size:13px; font-weight:600;
                            background:${i === currentScenarioIndex ? '#1a3a5c' : '#e0e0e0'};
                            color:${i === currentScenarioIndex ? 'white' : '#555'};">
                            ${s.title}
                        </div>
                    `).join('')}
                </div>

                <div style="display:flex; gap:6px; margin-bottom:24px;">
                    ${scenario.sheets.map((s, i) => `
                        <div style="flex:1; height:4px; border-radius:2px;
                            background:${i <= currentSheetIndex ? '#1a3a5c' : '#e0e0e0'};"></div>
                    `).join('')}
                </div>

                <h2 style="color:#1a3a5c; margin:0 0 4px;">${scenario.title}</h2>
                <h3 style="color:#555; font-weight:400; margin:0 0 16px;">${sheet.title}</h3>

                <div style="background:#e3f2fd; border-left:4px solid #1565c0; padding:12px 16px;
                    border-radius:4px; margin-bottom:20px; font-size:14px; color:#333; line-height:1.6;">
                    ${sheet.instruction}
                </div>

                ${sheet.guide ? `
                    <div style="background:#f3e5f5; border-left:4px solid #7b1fa2; padding:12px 16px;
                        border-radius:4px; margin-bottom:20px; font-size:13px; color:#555; line-height:1.5;">
                        ${sheet.guide}
                    </div>` : ''}

                    ${sheet.id.includes('hoja_hechos') ? `
                        <div style="background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:20px; margin-bottom:20px;">
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
                                <span style="font-size:24px;">🎧</span>
                                <div>
                                    <div style="font-weight:600; color:#1a3a5c; font-size:14px;">Testimonio del trabajador</div>
                                    <div style="font-size:12px; color:#888;">Escucha antes de completar esta hoja</div>
                                </div>
                            </div>
                            <audio id="testimonioAudio_${scenario.id}" controls style="width:100%; margin-bottom:8px;">
                                <source src="${scenario.audio.src}" type="audio/mpeg">
                                Tu navegador no soporta audio.
                            </audio>
                            <div id="subtitulosContainer_${scenario.id}" style="background:#f0f7ff; border-radius:4px; padding:10px; 
                                margin-bottom:8px;  color:#1a3a5c; min-height:28px; font-style:normal; 
                                text-align:center; border-left:3px solid #1565c0;">
                                🎤 Haz clic en reproducir para ver los subtítulos
                            </div>
                        </div>
                    ` : ''}
                    
                    <div style="background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:24px; margin-bottom:24px;">
                        ${fieldsHTML}
                    </div>
                    
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        ${(!isFirstSheet || !isFirstScenario)
                            ? `<button onclick="window.aiGoBack()"
                                style="padding:10px 20px; background:#e0e0e0; border:none; border-radius:6px;
                                cursor:pointer; font-size:14px;">
                                ← Anterior
                              </button>`
                            : `<div></div>`
                        }
                        ${isLastSheet && isLastScenario
                            ? `<button onclick="window.aiSubmit()"
                                style="padding:10px 24px; background:#2e7d32; color:white; border:none;
                                border-radius:6px; cursor:pointer; font-size:14px; font-weight:600;">
                                ✅ Enviar investigación
                              </button>`
                            : `<button onclick="window.aiGoNext()"
                                style="padding:10px 24px; background:#1a3a5c; color:white; border:none;
                                border-radius:6px; cursor:pointer; font-size:14px;">
                                Siguiente →
                              </button>`
                        }
                    </div>
                    </div>`;
                        
        // Inicializar audio y subtítulos después de renderizar
        if (sheet.id.includes('hoja_hechos')) {
            setTimeout(() => initAudioSubtitles(scenario), 50);
        }
    }
                    
    // Función para inicializar audio y subtítulos
    function initAudioSubtitles(scenario) {
        const audioId = `testimonioAudio_${scenario.id}`;
        const subtitleId = `subtitulosContainer_${scenario.id}`;
        
        const audio = document.getElementById(audioId);
        const subtitleDiv = document.getElementById(subtitleId);
        
        if (!audio || !subtitleDiv) {
            console.error('❌ Elementos de audio no encontrados');
            return;
        }
        
        console.log('✅ Inicializando subtítulos para', scenario.id);
        
        let subtitles = [];
        const subtitlesUrl = scenario.audio.subtitles_url || "Guión A — Caída de Escalera_clean.json";
        
        fetch(subtitlesUrl)
            .then(response => response.json())
            .then(data => {
                subtitles = data;
                console.log('✅ Subtítulos cargados:', subtitles.length);
            })
            .catch(err => {
                console.error('❌ Error cargando subtítulos:', err);
            });
        
        audio.addEventListener('timeupdate', function() {
            const currentTime = this.currentTime;
            const currentSub = subtitles.find(sub => 
                currentTime >= sub.start && currentTime <= sub.end
            );
            subtitleDiv.textContent = currentSub ? currentSub.text : '';
        });
        
        audio.addEventListener('ended', function() {
            subtitleDiv.textContent = '';
        });
        
        audio.addEventListener('pause', function() {
            subtitleDiv.textContent = '';
        });
        
        audio.addEventListener('play', function() {
            const currentTime = this.currentTime;
            const currentSub = subtitles.find(sub => 
                currentTime >= sub.start && currentTime <= sub.end
            );
            subtitleDiv.textContent = currentSub ? currentSub.text : '';
        });
        
        audio.addEventListener('seeked', function() {
            const currentTime = this.currentTime;
            const currentSub = subtitles.find(sub => 
                currentTime >= sub.start && currentTime <= sub.end
            );
            subtitleDiv.textContent = currentSub ? currentSub.text : '';
        });
    }
                    
    renderSheet();
};

window.renderDragDrop = function(page) {
    const { instrucciones, categorias, normas } = page.payload;
    const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);

    let draggingId = null;
    let placed = {};
    let correctCount = 0;
    let totalAttempts = 0;

    if (!document.getElementById('dd-ux-styles')) {
        const styles = document.createElement('style');
        styles.id = 'dd-ux-styles';
        styles.innerHTML = `
            .dd-dashboard { display: flex; justify-content: center; gap: 2rem; margin-bottom: 2rem; }
            .dd-metric { text-align: center; padding: 1rem 2rem; background: #fff; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #f0f0f0; min-width: 120px; }
            .dd-metric-val { font-size: 28px; font-weight: 700; color: #1a1a1a; }
            .dd-metric-lbl { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; margin-top: 4px; }
            .dd-tray { display: flex; flex-wrap: wrap; gap: 10px; padding: 20px; background: #f8f9fa; border-radius: 16px; border: 2px dashed #e2e8f0; min-height: 100px; margin-bottom: 2rem; transition: all 0.3s ease; }
            .dd-tray.drag-over { background: #edf2f7; border-color: #cbd5e1; }
            .dd-zone { border-radius: 16px; padding: 16px; min-height: 100px; transition: all 0.3s ease; border: 1px solid transparent; display: flex; flex-direction: column; gap: 12px; }
            .dd-zone.drag-over { transform: scale(1.01); filter: brightness(0.97); box-shadow: 0 8px 20px rgba(0,0,0,0.08); }
            .dd-zone-header { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,0.05); }
            .dd-card { padding: 8px 14px; border-radius: 10px; font-weight: 500; cursor: grab; background: #fff; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); transition: all 0.2s ease; user-select: none; display: inline-flex; align-items: center; justify-content: center; color: #334155; }
            .dd-card:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.08); border-color: #cbd5e1; }
            .dd-card:active { cursor: grabbing; transform: scale(0.98); }
            .dd-card.placed { cursor: default; transform: none; box-shadow: none; border: none; font-weight: 600; }
            .dd-shake { animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both; background: #fee2e2 !important; border-color: #f87171 !important; color: #991b1b !important; }
            @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
            .dd-tooltip-ui { position: fixed; background: #1e293b; color: #f8fafc; padding: 12px 16px; border-radius: 8px; max-width: 320px; line-height: 1.5; z-index: 9999; pointer-events: none; box-shadow: 0 10px 25px rgba(0,0,0,0.15); opacity: 0; transition: opacity 0.2s ease; transform: translateY(-10px); }
            .dd-tooltip-ui.visible { opacity: 1; transform: translateY(0); }
        `;
        document.head.appendChild(styles);
    }

    const catStyle = {
        seguridad:    { bg: '#f0f7ff', border: '#bae6fd', title: '#0369a1' },
        salud:        { bg: '#f0fdf4', border: '#bbf7d0', title: '#15803d' },
        organizacion: { bg: '#fffbeb', border: '#fde68a', title: '#b45309' },
        especificas:  { bg: '#fff1f2', border: '#fecdd3', title: '#be123c' },
        producto:     { bg: '#faf5ff', border: '#e9d5ff', title: '#6b21a8' },
    };

    const catsHtml = categorias.map(c => {
        const st = catStyle[c.id];
        return `
        <div id="drop-${c.id}" class="dd-zone" style="background:${st.bg}; border-color:${st.border};"
            ondragover="window._ddDragOver(event,'${c.id}')"
            ondragleave="window._ddDragLeave('${c.id}')"
            ondrop="window._ddDrop(event,'${c.id}')">
            <div class="dd-zone-header">
                <span style="font-size:18px;">${c.icono}</span>
                <span style=" font-weight:700; color:${st.title};">${c.label}</span>
                <span id="cnt-${c.id}" style="margin-left:auto; font-size:12px; font-weight:600; padding:4px 10px; border-radius:20px; background:#fff; color:${st.title}; box-shadow:0 1px 3px rgba(0,0,0,0.05);">0 / ${c.total}</span>
            </div>
            <div id="cards-${c.id}" style="display:flex; flex-wrap:wrap; gap:8px;"></div>
        </div>`;
    }).join('');

    pageContentEl.innerHTML = `
        <div style="max-width:800px; margin:0 auto; padding:2rem 0; font-family: system-ui, -apple-system, sans-serif;">
            <p style=" color:#475569; margin-bottom:24px; text-align:center; font-weight:500;">${instrucciones}</p>
            
            <div class="dd-dashboard">
                <div class="dd-metric">
                    <div id="dd-correct" class="dd-metric-val" style="color:#10b981;">0</div>
                    <div class="dd-metric-lbl">Correctas</div>
                </div>
                <div class="dd-metric">
                    <div id="dd-total" class="dd-metric-val" style="color:#64748b;">0</div>
                    <div class="dd-metric-lbl">Intentos</div>
                </div>
                <div class="dd-metric">
                    <div id="dd-pct" class="dd-metric-val" style="color:#3b82f6;">0%</div>
                    <div class="dd-metric-lbl">Precisión</div>
                </div>
            </div>

            <div id="dd-pool" class="dd-tray"
                ondragover="window._ddDragOver(event,'pool')"
                ondragleave="window._ddDragLeave('pool')"
                ondrop="window._ddDrop(event,'pool')">
            </div>

            <div style="display:flex; flex-direction:column; gap:16px;">
                ${catsHtml}
            </div>

            <div id="dd-win" style="display:none; text-align:center; margin-top:32px; padding:32px; background:#f8fafc; border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 10px 25px rgba(0,0,0,0.05);">
                <div style="font-size:48px; margin-bottom:16px;">🏆</div>
                <h3 id="dd-win-title" style="font-size:24px; font-weight:700; color:#0f172a; margin-bottom:8px;"></h3>
                <p id="dd-win-msg" style="font-size:16px; color:#64748b; margin-bottom:24px;"></p>
                <button onclick="window.renderDragDrop(page)" style="padding:12px 24px; border-radius:12px; border:none; background:#3b82f6; color:#fff;  font-weight:600; cursor:pointer; box-shadow:0 4px 12px rgba(59, 130, 246, 0.3); transition:all 0.2s ease;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">Jugar de nuevo</button>
            </div>
        </div>`;

    let activeTooltip = null;

    const makeCard = (norm, correct) => {
        const el = document.createElement('div');
        el.dataset.id = norm.id;
        el.dataset.cat = norm.cat;
        el.textContent = norm.label;
        el.className = 'dd-card' + (correct ? ' placed' : '');
        
        if (correct) {
            const st = catStyle[norm.cat];
            el.style.background = st.border;
            el.style.color = st.title;
        } else {
            el.draggable = true;
            el.addEventListener('dragstart', e => { 
                draggingId = norm.id; 
                e.target.style.opacity = '0.4'; 
                if(activeTooltip) activeTooltip.classList.remove('visible');
            });
            el.addEventListener('dragend', e => { e.target.style.opacity = '1'; });
            
            el.addEventListener('mouseenter', e => {
                if(draggingId) return;
                document.getElementById('dd-tooltip')?.remove();
                activeTooltip = document.createElement('div');
                activeTooltip.id = 'dd-tooltip';
                activeTooltip.className = 'dd-tooltip-ui';
                activeTooltip.innerHTML = `<strong style="display:block;margin-bottom:4px;color:#94a3b8;">${norm.label}</strong>${norm.nombre}`;
                document.body.appendChild(activeTooltip);
                
                const r = e.target.getBoundingClientRect();
                activeTooltip.style.left = Math.max(10, r.left + (r.width/2) - 160) + 'px';
                activeTooltip.style.top = (r.top - activeTooltip.offsetHeight - 12) + 'px';
                
                requestAnimationFrame(() => activeTooltip.classList.add('visible'));
            });
            el.addEventListener('mouseleave', () => {
                if(activeTooltip) {
                    activeTooltip.classList.remove('visible');
                    setTimeout(() => activeTooltip?.remove(), 200);
                }
            });
        }
        return el;
    };

    const updateScore = () => {
        const pct = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;
        document.getElementById('dd-correct').textContent = correctCount;
        document.getElementById('dd-total').textContent = totalAttempts;
        document.getElementById('dd-pct').textContent = pct + '%';
    };

    const checkWin = () => {
        if (correctCount < normas.length) return;
        const pct = Math.round((correctCount / totalAttempts) * 100);
        document.getElementById('dd-win-title').textContent = pct === 100 ? '¡Perfección Absoluta!' : pct >= 80 ? '¡Excelente Trabajo!' : '¡Completado!';
        document.getElementById('dd-win-msg').textContent = pct === 100 ? 'Clasificaste todas las normas sin un solo error.' : `Lograste una precisión del ${pct}%.`;
        document.getElementById('dd-win').style.display = 'block';
        document.getElementById('dd-pool').style.display = 'none';
        if (typeof window.saveSimuladorRespuesta === 'function') {
            window.saveSimuladorRespuesta('dragDrop', { correctCount, totalAttempts, pct });
        }
    };

    window._ddDragOver = (e, zone) => { 
        e.preventDefault(); 
        const el = zone === 'pool' ? document.getElementById('dd-pool') : document.getElementById('drop-' + zone); 
        if (el && !el.classList.contains('drag-over')) el.classList.add('drag-over'); 
    };
    
    window._ddDragLeave = zone => { 
        const el = zone === 'pool' ? document.getElementById('dd-pool') : document.getElementById('drop-' + zone); 
        if (el) el.classList.remove('drag-over'); 
    };
    
    window._ddDrop = (e, zone) => {
        e.preventDefault();
        window._ddDragLeave(zone);
        if (!draggingId || zone === 'pool') return;

        const norm = normas.find(n => n.id === draggingId);
        if (!norm || placed[draggingId]) return;

        totalAttempts++;
        const cardEl = document.querySelector(`[data-id="${draggingId}"]`);

        if (norm.cat === zone) {
            correctCount++;
            placed[draggingId] = true;
            if (cardEl) {
                if(activeTooltip) activeTooltip.remove();
                cardEl.remove();
            }
            document.getElementById('cards-' + zone).appendChild(makeCard(norm, true));
            const cnt = document.getElementById('cnt-' + zone);
            cnt.textContent = `${parseInt(cnt.textContent)} / ${categorias.find(c => c.id === zone).total}`;
        } else {
            if (cardEl) {
                // Reinicia la animación de error
                cardEl.classList.remove('dd-shake');
                void cardEl.offsetWidth; 
                cardEl.classList.add('dd-shake');
            }
        }
        updateScore();
        checkWin();
        draggingId = null;
    };

    shuffle(normas).forEach(n => document.getElementById('dd-pool').appendChild(makeCard(n, false)));
};

// ============================================================
// EJERCICIO INTEGRADOR (ART + Checklist + Investigación)
// ============================================================
window.renderIntegratedExercise = async function(page) {
    const payload = page.payload;

    // Verificar en Supabase si ya fue enviado
    let isCompleted = false;
    let savedPayload = null;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const courseId = new URLSearchParams(location.search).get('id');
        if (session && courseId) {
            const { data } = await supabase
                .from('simulador_respuestas')
                .select('payload')
                .eq('user_id', session.user.id)
                .eq('course_id', courseId)
                .eq('simulador_type', 'integratedExercise')
                .maybeSingle();
            if (data) { isCompleted = true; savedPayload = data.payload; }
        }
    } catch(e) { console.warn('[integrated] Error verificando BD:', e); }

    if (isCompleted) {
        renderIntegratedReadonly(savedPayload);
        document.getElementById('nextPageBtn').disabled = false;
        return;
    }

    delete window.artState;
    delete window.checklistBlankState;
    delete window.aiBlankState;

            // Inicializar estados mínimos para que tengan la propiedad 'container'
        window.artState = { container: null };
        window.checklistBlankState = { container: null, items: [], submitted: false };
        window.aiBlankState = {
            container: null,
            currentSheet: 0,
            hechos: { fecha: '', hora: '', lugar: '', involucrado: '', puesto: '', antiguedad: '', testigos: '', lesion: '', atencion: '', actividad: '', secuencia: '' },
            cincoPorques: { hechoCentral: '', porque1: '', porque2: '', porque3: '', porque4: '', porque5: '', causaRaizResumen: '' },
            entrega: { quePaso: '', causasInmediatas: '', causasBasicas: '', causaRaiz: '', planAccion: '' },
            submitted: false
        };

    // Estado para la pestaña activa
    window.integratedActiveTab = 'art'; // 'art', 'checklist', 'investigacion'

    // Construir layout
    let html = `
        <div style="display:flex; gap:24px; height:100%; min-height:600px; font-family:inherit;">
            <!-- COLUMNA IZQUIERDA: IMAGEN E INSTRUCCIÓN -->
            <div style="flex:1; display:flex; flex-direction:column;">
                <div style="background:#fff; border-radius:12px; border:1px solid #dee2e6; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                    <img src="${payload.imageUrl}" alt="Escena a analizar" style="width:100%; display:block; object-fit:cover; max-height:300px;"
                        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div style="display:none; align-items:center; justify-content:center; height:200px; background:#f5f5f5; color:#999;">
                        📷 Imagen no disponible
                    </div>
                    <div style="padding:16px;">
                        <p style="margin:0; color:#333; line-height:1.6;">${payload.instructionText}</p>
                    </div>
                </div>
            </div>

            <!-- COLUMNA DERECHA: PESTAÑAS Y CONTENIDO -->
            <div style="flex:2; display:flex; flex-direction:column; min-width:0;">
                <!-- Botones de pestañas -->
                <div style="display:flex; gap:8px; margin-bottom:16px; border-bottom:2px solid #e9ecef; padding-bottom:8px;">
                    <button class="integrated-tab-btn active" data-tab="art" onclick="window.integratedSwitchTab('art')">
                        📋 ART
                    </button>
                    <button class="integrated-tab-btn" data-tab="checklist" onclick="window.integratedSwitchTab('checklist')">
                        ✅ Checklist
                    </button>
                    <button class="integrated-tab-btn" data-tab="investigacion" onclick="window.integratedSwitchTab('investigacion')">
                        🔍 Investigación
                    </button>
                </div>

                <!-- Contenedor del contenido de la pestaña activa -->
                <div id="integratedTabContent" style="flex:1; overflow-y:auto; padding-right:4px;">
                    <!-- Se llenará dinámicamente -->
                </div>

                <!-- Botón ENVIAR (abajo) -->
                <div style="margin-top:20px; text-align:right; border-top:1px solid #e9ecef; padding-top:16px;">
                    <button id="integratedSubmitBtn" class="btn btn-primary" style="padding:10px 30px;" onclick="window.integratedSubmit()">
                        Enviar análisis completo
                    </button>
                </div>
            </div>
        </div>
    `;

    pageContentEl.innerHTML = html;

    // Aplicar estilos a los botones de pestaña (si no existen)
    if (!document.getElementById('integrated-styles')) {
        const style = document.createElement('style');
        style.id = 'integrated-styles';
        style.textContent = `
            .integrated-tab-btn {
                background: transparent;
                border: none;
                padding: 8px 16px;
                
                font-weight: 600;
                color: #6c757d;
                cursor: pointer;
                border-radius: 6px;
                transition: all 0.2s;
            }
            .integrated-tab-btn:hover {
                background: #f1f3f5;
            }
            .integrated-tab-btn.active {
                background: var(--primaryColor, #1a3a5c);
                color: white;
            }
        `;
        document.head.appendChild(style);
    }

    // Función para cambiar de pestaña
    window.integratedSwitchTab = function(tabId) {
        window.integratedActiveTab = tabId;
        // Actualizar clases activas
        document.querySelectorAll('.integrated-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        renderIntegratedSubmodule(tabId);
    };

    // Renderiza el submódulo correspondiente dentro del contenedor
    function renderIntegratedSubmodule(tabId) {
        const container = document.getElementById('integratedTabContent');
        container.innerHTML = '';
    
        // Construimos el fakePage con blankMode y saveAs específico
        const fakePage = {
            type: tabId,
            title: tabId === 'art' ? 'ART' : (tabId === 'checklist' ? 'Checklist' : 'Investigación'),
            payload: {
                embedded: true,
                blankMode: true,
                saveAs: tabId === 'art' ? 'artGame' : (tabId === 'checklist' ? 'checklistBuilder' : 'accidentInvestigation'),
                title: tabId === 'art' ? (payload.artTitle || 'ART') : (tabId === 'checklist' ? 'Checklist' : (payload.investigationTitle || 'Investigación')),
                contexto: payload.artContexto || '',
                instruction: payload.checklistInstruction || ''
            }
        };
    
        // Guardamos la referencia global original
        const originalContentEl = pageContentEl;
        // Apuntamos temporalmente al contenedor de la pestaña
        pageContentEl = container;
    
        // Llamamos al render correspondiente
        if (tabId === 'art') {
            window.artState.container = container;
            window.renderArtGame(fakePage);
        } else if (tabId === 'checklist') {
            window.checklistBlankState.container = container;
            window.renderChecklistBuilder(fakePage);
        } else {
            window.aiBlankState.container = container;
            window.renderAccidentInvestigation(fakePage);
        }
    
        // Restauramos la variable global
        pageContentEl = originalContentEl;
    }

    function renderIntegratedReadonly(savedPayload) {
        const art = savedPayload.art;
        const checklist = savedPayload.checklist;
        const investigation = savedPayload.investigation;
    
        // Generar HTML del ART
        let artHtml = '';
        if (art) {
            if (art.blankMode) {
                // Modo blanco: mostrar tabla con los pasos que el usuario creó
                const answers = art.answers?.[0] || [];
                artHtml = `
                  <table style="width:100%; border-collapse:collapse; margin-top:10px;">
                    <thead>
                      <tr style="background:#1a3a5c; color:#fff;">
                        <th>Paso</th><th>Peligro</th><th>Riesgo</th>
                        <th>Nivel sin control</th><th>Control</th><th>Nivel con control</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${answers.map((ans, idx) => `
                        <tr>
                          <td>${idx + 1}</td>
                          <td>${ans.peligro || '-'}</td>
                          <td>${ans.riesgo || '-'}</td>
                          <td>${ans.nivelSinControl || '-'}</td>
                          <td>${ans.control || '-'}</td>
                          <td>${ans.nivelConControl || '-'}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>`;
            } else {
                // Casos predefinidos (si se usaran)
                artHtml = `<table>...`;
            }
        } else {
            artHtml = '<p>No se realizó ART.</p>';
        }
    
        // Para checklist e investigación hacemos algo similar
        let checklistHtml = checklist ? generarHtmlChecklist(checklist) : '<p>Sin checklist.</p>';
        let investigacionHtml = investigation ? generarHtmlInvestigacion(investigation) : '<p>Sin investigación.</p>';
    
        // Insertamos todo en pageContentEl
        pageContentEl.innerHTML = `
            <div class="completed-exercise">
                <h2>Ejercicio completado</h2>
                <details open><summary>ART</summary>${artHtml}</details>
                <details><summary>Checklist</summary>${checklistHtml}</details>
                <details><summary>Investigación</summary>${investigacionHtml}</details>
            </div>`;
    }

    function generarHtmlChecklist(data) {
        if (!data.items || data.items.length === 0) return '<p>No hay elementos.</p>';
        return `<ul>${data.items.map(i => `<li><b>${i.category}:</b> ${i.description}</li>`).join('')}</ul>`;
    }

    function generarHtmlInvestigacion(data) {
        if (!data) return '<p>Sin investigación.</p>';
        let html = '';
        if (data.hechos) {
            html += '<h4>Hechos</h4><ul>';
            for (const [key, value] of Object.entries(data.hechos)) {
                html += `<li><strong>${key}:</strong> ${value || '-'}</li>`;
            }
            html += '</ul>';
        }
        // Puedes repetir lo mismo para cincoPorques y entrega si quieres
        return html || `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    }

    window.integratorReplay = function() {
        // Limpia los estados de los submódulos
        delete window.artState;
        delete window.checklistBlankState;
        delete window.aiBlankState;
        // Vuelve a renderizar la página actual (el integrador se reiniciará)
        window.renderPage(currentPageIndex);
    };

    // Inicializar con la pestaña ART
    renderIntegratedSubmodule('art');

    // Deshabilitar botón siguiente hasta enviar
    document.getElementById('nextPageBtn').disabled = true;

    // Función de envío
    window.integratedSubmit = function() {
        // --- Validación previa ---
        const artData = window.artState ? {
            cases: window.artState.cases,
            answers: window.artState.answers,
            submitted: window.artState.submitted,
            blankMode: window.artState.blankMode 
        } : null;
        const checklistData = window.checklistBlankState ? {
            items: window.checklistBlankState.items
        } : null;
        const investigationData = window.aiBlankState ? {
            hechos: window.aiBlankState.hechos,
            cincoPorques: window.aiBlankState.cincoPorques,
            entrega: window.aiBlankState.entrega
        } : null;
    
        const artVacio = !artData || !artData.answers?.[0]?.length;
        const checklistVacio = !checklistData || !checklistData.items?.length;
        // Para investigación, podemos considerar vacío si no hay datos en ninguna hoja
        const investigacionVacia = !investigationData || !investigationData.answers?.some(hoja => hoja && Object.keys(hoja).length > 0);
    
        if (artVacio || checklistVacio || investigacionVacia) {
            alert('Debes completar al menos un paso en cada sección antes de enviar.');
            return;
        }
    
        // --- Confirmación ---
        if (!confirm('¿Estás seguro de enviar el análisis? Una vez enviado no podrás modificarlo.')) return;
    
        // --- Construir payload ---
        const payloadToSave = {
            completed_at: new Date().toISOString(),
            art: artData,
            checklist: checklistData,
            investigation: investigationData
        };
    
        // --- Guardar en Supabase ---
        window.saveSimuladorRespuesta('integratedExercise', payloadToSave);
    
        // --- Actualizar progreso y desbloquear siguiente página ---
        if (currentPageIndex >= maxUnlockedIndex) {
            maxUnlockedIndex = currentPageIndex + 1;
            saveProgress(currentPageIndex, false);
            updateNavigationUI(currentPageIndex);
        }
        document.getElementById('nextPageBtn').disabled = false;
    
        // --- Mostrar vista de solo lectura con los datos recién guardados ---
        renderIntegratedReadonly(payloadToSave);
    };
};

function renderModuleIntro(page) {
    const payload = page.payload;
    const badgesHTML = payload.badges.map(function(text) {
        return '<span class="module-badge">' + text + '</span>';
    }).join('');

    pageContentEl.innerHTML = 
        '<div class="module-intro">' +
            '<div class="module-intro-icon">' + payload.icon + '</div>' +
            '<div class="module-intro-label">' + payload.label + '</div>' +
            '<h2 class="module-intro-title">' + payload.heading + '</h2>' +
            '<p class="module-intro-desc">' + payload.description + '</p>' +
            '<div class="module-intro-badges">' + badgesHTML + '</div>' +
        '</div>';
}