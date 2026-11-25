// --- ESTADO Y PERSISTENCIA ---
let catalogo = JSON.parse(localStorage.getItem('cookstock_catalogo')) || {
    '7790070412345': { nombre: 'Harina Tasara 40', categoria: 'solido', unidad: 'kg', compraHabitualCant: 1, compraHabitualUni: 'kg' },
    '7790070999001': { nombre: 'Harina Leudante', categoria: 'solido', unidad: 'kg', compraHabitualCant: 1, compraHabitualUni: 'kg' },
    '7791234567890': { nombre: 'Azúcar Común', categoria: 'solido', unidad: 'kg', compraHabitualCant: 1, compraHabitualUni: 'kg' },
    '7790742001234': { nombre: 'Leche Entera', categoria: 'liquido', unidad: 'L', compraHabitualCant: 1, compraHabitualUni: 'L' },
    '7790742005555': { nombre: 'Crema de Leche', categoria: 'liquido', unidad: 'ml', compraHabitualCant: 330, compraHabitualUni: 'ml' }
};

let lotes = JSON.parse(localStorage.getItem('cookstock_lotes')) || [
    { id: 1, codigo: '7790742001234', nombre: 'Leche Entera', categoria: 'liquido', unidad: 'L', cantidad: 4, vencimiento: sumarDiasHoy(18) },
    { id: 2, codigo: '7790070412345', nombre: 'Harina Tasara 40', categoria: 'solido', unidad: 'kg', cantidad: 5, vencimiento: sumarDiasHoy(65) },
    { id: 3, codigo: '7791234567890', nombre: 'Azúcar Común', categoria: 'solido', unidad: 'kg', cantidad: 2, vencimiento: sumarDiasHoy(140) }
];

let recetas = JSON.parse(localStorage.getItem('cookstock_recetas')) || [
    {
        id: 101,
        nombre: 'Muffins Base x12',
        rendimiento: '12 unidades',
        ingredientes: [
            { nombre: 'Harina', cantidad: 250, unidad: 'g' },
            { nombre: 'Harina Leudante', cantidad: 250, unidad: 'g' },
            { nombre: 'Azúcar Común', cantidad: 200, unidad: 'g' },
            { nombre: 'Leche Entera', cantidad: 250, unidad: 'ml' }
        ]
    }
];

let preparaciones = JSON.parse(localStorage.getItem('cookstock_preparaciones')) || [];
let compras = JSON.parse(localStorage.getItem('cookstock_compras')) || [];
let fechaCalendario = new Date();
let html5QrcodeScanner = null;
let camaraActiva = false;
let reenfoqueEnCurso = false;
let pedidoEnProduccionId = null;

function guardarTodo() {
    localStorage.setItem('cookstock_catalogo', JSON.stringify(catalogo));
    localStorage.setItem('cookstock_lotes', JSON.stringify(lotes));
    localStorage.setItem('cookstock_recetas', JSON.stringify(recetas));
    localStorage.setItem('cookstock_preparaciones', JSON.stringify(preparaciones));
    localStorage.setItem('cookstock_compras', JSON.stringify(compras));
}

function sumarDiasHoy(dias) {
    const f = new Date();
    f.setDate(f.getDate() + dias);
    return f.toISOString().split('T')[0];
}

function calcularDiasHastaFecha(fechaStr) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const objetivo = new Date(fechaStr + 'T00:00:00');
    return Math.ceil((objetivo - hoy) / (1000 * 60 * 60 * 24));
}

// --- CONVERSIÓN, FORMATO LEGIBLE Y COINCIDENCIA DE MARCA/INSUMO ---
function convertirUnidad(cantidad, deUnidad, aUnidad) {
    if (deUnidad === aUnidad) return cantidad;
    if (deUnidad === 'g' && aUnidad === 'kg') return cantidad / 1000;
    if (deUnidad === 'kg' && aUnidad === 'g') return cantidad * 1000;
    if (deUnidad === 'ml' && aUnidad === 'L') return cantidad / 1000;
    if (deUnidad === 'L' && aUnidad === 'ml') return cantidad * 1000;
    return cantidad;
}

function formatearCantidadDetallada(cantidad, unidad) {
    const limpia = +Number(cantidad || 0).toFixed(4);
    if (unidad === 'kg') {
        const kilos = Math.floor(limpia + 1e-9);
        const gramos = Math.round((limpia - kilos) * 1000);
        if (kilos > 0 && gramos > 0) return `${kilos} kg ${gramos} g`;
        if (kilos > 0) return `${kilos} kg`;
        return `${gramos} g`;
    }
    if (unidad === 'L') {
        const litros = Math.floor(limpia + 1e-9);
        const ml = Math.round((limpia - litros) * 1000);
        if (litros > 0 && ml > 0) return `${litros} L ${ml} ml`;
        if (litros > 0) return `${litros} L`;
        return `${ml} ml`;
    }
    return `${+limpia.toFixed(2)} ${unidad}`;
}

function normalizarNombre(str) {
    return (str || '').trim().toLowerCase();
}

function resolverProductoEspecifico(nombreBuscado) {
    const clave = normalizarNombre(nombreBuscado);
    if (!clave) return null;

    const loteExacto = lotes.find(l => normalizarNombre(l.nombre) === clave);
    if (loteExacto) {
        return {
            nombre: loteExacto.nombre,
            categoria: loteExacto.categoria || 'solido',
            unidad: loteExacto.unidad
        };
    }

    const loteParcial = lotes.find(l => normalizarNombre(l.nombre).includes(clave) || clave.includes(normalizarNombre(l.nombre)));
    if (loteParcial) {
        return {
            nombre: loteParcial.nombre,
            categoria: loteParcial.categoria || 'solido',
            unidad: loteParcial.unidad
        };
    }

    const itemsCatalogo = Object.values(catalogo);
    const catExacto = itemsCatalogo.find(c => normalizarNombre(c.nombre) === clave);
    if (catExacto) {
        return {
            nombre: catExacto.nombre,
            categoria: catExacto.categoria || 'solido',
            unidad: catExacto.unidad,
            compraHabitualCant: catExacto.compraHabitualCant,
            compraHabitualUni: catExacto.compraHabitualUni
        };
    }

    const catParcial = itemsCatalogo.find(c => normalizarNombre(c.nombre).includes(clave) || clave.includes(normalizarNombre(c.nombre)));
    if (catParcial) {
        return {
            nombre: catParcial.nombre,
            categoria: catParcial.categoria || 'solido',
            unidad: catParcial.unidad,
            compraHabitualCant: catParcial.compraHabitualCant,
            compraHabitualUni: catParcial.compraHabitualUni
        };
    }

    const compCoincidente = compras.find(c =>
        normalizarNombre(c.nombre) === clave ||
        normalizarNombre(c.nombre).includes(clave) ||
        clave.includes(normalizarNombre(c.nombre))
    );
    if (compCoincidente) {
        return {
            nombre: compCoincidente.nombre,
            categoria: compCoincidente.categoria || 'solido',
            unidad: compCoincidente.unidad
        };
    }

    return null;
}

function ajustarACompraHabitual(nombreEspecifico, faltanteCant, faltanteUni) {
    const resuelto = resolverProductoEspecifico(nombreEspecifico);
    const categoria = resuelto?.categoria || 'solido';

    if (resuelto?.compraHabitualCant && resuelto?.compraHabitualUni) {
        const habEnFaltanteUni = convertirUnidad(resuelto.compraHabitualCant, resuelto.compraHabitualUni, faltanteUni);
        const paquetesNecesarios = Math.max(1, Math.ceil(faltanteCant / habEnFaltanteUni));
        return {
            nombre: resuelto.nombre,
            cantidad: +(paquetesNecesarios * resuelto.compraHabitualCant).toFixed(2),
            unidad: resuelto.compraHabitualUni,
            categoria
        };
    }

    if (faltanteUni === 'g') {
        const kgRedondeado = Math.max(1, Math.ceil(faltanteCant / 1000));
        return {
            nombre: resuelto?.nombre || nombreEspecifico,
            cantidad: kgRedondeado,
            unidad: 'kg',
            categoria
        };
    }

    if (faltanteUni === 'ml') {
        const lRedondeado = Math.max(1, Math.ceil(faltanteCant / 1000));
        return {
            nombre: resuelto?.nombre || nombreEspecifico,
            cantidad: lRedondeado,
            unidad: 'L',
            categoria
        };
    }

    const cantRedondeada = Math.max(1, Math.ceil(faltanteCant));
    return {
        nombre: resuelto?.nombre || nombreEspecifico,
        cantidad: cantRedondeada,
        unidad: faltanteUni,
        categoria
    };
}

function obtenerStockDisponible(nombreIngrediente, unidadDeseada) {
    const resuelto = resolverProductoEspecifico(nombreIngrediente);
    const clave = normalizarNombre(resuelto?.nombre || nombreIngrediente);
    const lotesCoincidentes = lotes.filter(l => l.cantidad > 0 && normalizarNombre(l.nombre) === clave);
    if (lotesCoincidentes.length === 0) return 0;

    let totalEnUnidadDeseada = 0;
    lotesCoincidentes.forEach(l => {
        totalEnUnidadDeseada += convertirUnidad(l.cantidad, l.unidad, unidadDeseada);
    });
    return totalEnUnidadDeseada;
}

function descontarFEFO(nombreIngrediente, cantidadNecesaria, unidadNecesaria) {
    const resuelto = resolverProductoEspecifico(nombreIngrediente);
    const clave = normalizarNombre(resuelto?.nombre || nombreIngrediente);
    let restante = cantidadNecesaria;

    const lotesOrdenados = lotes
        .filter(l => l.cantidad > 0 && normalizarNombre(l.nombre) === clave)
        .sort((a, b) => new Date(a.vencimiento) - new Date(b.vencimiento));

    for (const lote of lotesOrdenados) {
        if (restante <= 0) break;
        const restanteEnUnidadLote = convertirUnidad(restante, unidadNecesaria, lote.unidad);
        if (lote.cantidad >= restanteEnUnidadLote) {
            lote.cantidad = +(lote.cantidad - restanteEnUnidadLote).toFixed(4);
            restante = 0;
        } else {
            const descontadoEnUnidadNecesaria = convertirUnidad(lote.cantidad, lote.unidad, unidadNecesaria);
            restante = +(restante - descontadoEnUnidadNecesaria).toFixed(4);
            lote.cantidad = 0;
        }
    }
}

// --- SEMÁFORO DE VENCIMIENTOS ---
function evaluarSemaforo(fechaStr) {
    const diffDias = calcularDiasHastaFecha(fechaStr);
    if (diffDias <= 30) return { estado: 'rojo', dias: diffDias };
    if (diffDias <= 90) return { estado: 'amarillo', dias: diffDias };
    return { estado: 'verde', dias: diffDias };
}

// --- RENDERIZADO DE STOCK ---
function renderizarStock() {
    const contSolidos = document.getElementById('listaSolidos');
    const contLiquidos = document.getElementById('listaLiquidos');
    contSolidos.innerHTML = '';
    contLiquidos.innerHTML = '';

    const lotesOrdenados = [...lotes]
        .filter(l => l.cantidad > 0)
        .sort((a, b) => new Date(a.vencimiento) - new Date(b.vencimiento));

    let cSol = 0, cLiq = 0;

    lotesOrdenados.forEach(lote => {
        const infoSem = evaluarSemaforo(lote.vencimiento);
        const textoDias = infoSem.dias < 0
            ? `Vencido hace ${Math.abs(infoSem.dias)}d`
            : infoSem.dias === 0 ? 'Vence HOY' : `En ${infoSem.dias} días`;

        const stockLegible = formatearCantidadDetallada(lote.cantidad, lote.unidad);

        const card = document.createElement('div');
        card.className = `lote-card ${infoSem.estado}`;
        card.innerHTML = `
      <div class="lote-info">
        <h4>${lote.nombre}</h4>
        <div class="lote-meta">Stock: <strong>${stockLegible}</strong> · Vence: ${lote.vencimiento}</div>
      </div>
      <div class="lote-actions">
        <span class="dias-tag">${textoDias}</span>
        <button class="btn-consumir" onclick="consumirLote(${lote.id})" title="Descontar 1">-1</button>
      </div>
    `;

        if (lote.categoria === 'solido') {
            contSolidos.appendChild(card);
            cSol++;
        } else {
            contLiquidos.appendChild(card);
            cLiq++;
        }
    });

    document.getElementById('countSolidos').textContent = `${cSol} lotes`;
    document.getElementById('countLiquidos').textContent = `${cLiq} lotes`;

    actualizarContadorAlertas();
    if (!panelAlertas.classList.contains('hidden')) {
        renderizarPanelAlertas();
    }
}

window.consumirLote = function (id) {
    const lote = lotes.find(l => l.id === id);
    if (!lote) return;
    lote.cantidad = Math.max(0, +(lote.cantidad - 1).toFixed(4));
    guardarTodo();
    renderizarStock();
    renderizarPreparaciones();
};

// --- NOTIFICACIONES Y PANEL DE ALERTAS (VENCIMIENTOS + ENTREGAS A 4 DÍAS) ---
const panelAlertas = document.getElementById('panelAlertas');
const listaAlertasDetalle = document.getElementById('listaAlertasDetalle');

function obtenerLotesEnRiesgo() {
    return lotes
        .filter(l => l.cantidad > 0 && evaluarSemaforo(l.vencimiento).dias <= 30)
        .sort((a, b) => new Date(a.vencimiento) - new Date(b.vencimiento));
}

function obtenerEntregasAviso4Dias() {
    return preparaciones
        .filter(p => !p.completado && p.fecha)
        .map(p => ({ ...p, diasRestantes: calcularDiasHastaFecha(p.fecha) }))
        .filter(p => p.diasRestantes === 4)
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
}

function actualizarContadorAlertas() {
    const totalAlertas = obtenerLotesEnRiesgo().length + obtenerEntregasAviso4Dias().length;
    const badge = document.getElementById('badgeAlertas');
    badge.textContent = totalAlertas;
    badge.classList.toggle('hidden', totalAlertas === 0);
}

function renderizarPanelAlertas() {
    const enRiesgo = obtenerLotesEnRiesgo();
    const entregas4Dias = obtenerEntregasAviso4Dias();
    listaAlertasDetalle.innerHTML = '';

    if (enRiesgo.length === 0 && entregas4Dias.length === 0) {
        listaAlertasDetalle.innerHTML = '<div class="hint">No hay alertas de vencimiento ni entregas a 4 días por ahora.</div>';
        return;
    }

    entregas4Dias.forEach(prep => {
        const fila = document.createElement('div');
        fila.className = 'alerta-fila entrega';
        fila.innerHTML = `
      <div><strong>🎂 Faltan 4 días para entregar ${prep.producto}</strong> (${prep.fecha})</div>
      <span><strong>En 4 días</strong></span>
    `;
        listaAlertasDetalle.appendChild(fila);
    });

    enRiesgo.forEach(lote => {
        const info = evaluarSemaforo(lote.vencimiento);
        const txtDias = info.dias < 0
            ? `Vencido hace ${Math.abs(info.dias)} días`
            : info.dias === 0 ? 'Vence HOY' : `Vence en ${info.dias} días`;

        const fila = document.createElement('div');
        fila.className = 'alerta-fila';
        fila.innerHTML = `
      <div><strong>⚠️ ${lote.nombre}</strong> — ${formatearCantidadDetallada(lote.cantidad, lote.unidad)} (Vence: ${lote.vencimiento})</div>
      <span><strong>${txtDias}</strong></span>
    `;
        listaAlertasDetalle.appendChild(fila);
    });
}

function dispararNotificacionSistema(titulo, cuerpo) {
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(titulo, { body: cuerpo });
        } catch (_) { }
    }
}

function verificarYNotificar(forzar = false) {
    const enRiesgo = obtenerLotesEnRiesgo();
    const entregas4Dias = obtenerEntregasAviso4Dias();

    const mensajesPush = [];
    entregas4Dias.forEach(p => {
        mensajesPush.push(`Faltan 4 días para entregar ${p.producto}.`);
    });
    if (enRiesgo.length > 0) {
        mensajesPush.push(`Tenés ${enRiesgo.length} lote(s) a menos de 1 mes de vencer (ej: ${enRiesgo[0].nombre}).`);
    }

    if ('Notification' in window && mensajesPush.length > 0) {
        if (Notification.permission === 'granted') {
            mensajesPush.forEach(msg => dispararNotificacionSistema('CookStock', msg));
        } else if (forzar && Notification.permission !== 'denied') {
            Notification.requestPermission().then(perm => {
                if (perm === 'granted') {
                    mensajesPush.forEach(msg => dispararNotificacionSistema('CookStock', msg));
                }
            });
        }
    }

    if (forzar) {
        renderizarPanelAlertas();
        panelAlertas.classList.remove('hidden');
    }
}

document.getElementById('btnNotificaciones').addEventListener('click', () => {
    const estaAbierto = !panelAlertas.classList.contains('hidden');
    if (estaAbierto) {
        panelAlertas.classList.add('hidden');
    } else {
        verificarYNotificar(true);
    }
});

document.getElementById('btnCerrarAlertas').addEventListener('click', () => {
    panelAlertas.classList.add('hidden');
});

// --- ESCÁNER E INGRESO DE MERCADERÍA ---
const modalEscaner = document.getElementById('modalEscaner');
const inpCodigo = document.getElementById('inpCodigo');
const readerEl = document.getElementById('reader');

document.getElementById('btnAbrirEscaner').addEventListener('click', () => {
    modalEscaner.classList.remove('hidden');
    document.getElementById('inpVencimiento').value = sumarDiasHoy(30);
});
document.getElementById('btnCerrarModal').addEventListener('click', cerrarModalEscaner);

function detenerCamaraSegura() {
    camaraActiva = false;
    if (html5QrcodeScanner) {
        const instancia = html5QrcodeScanner;
        html5QrcodeScanner = null;
        try {
            const prom = instancia.stop();
            if (prom && typeof prom.catch === 'function') {
                prom.catch(() => { });
            }
        } catch (_) { }
    }
}

function cerrarModalEscaner() {
    modalEscaner.classList.add('hidden');
    detenerCamaraSegura();
}

inpCodigo.addEventListener('input', () => buscarEnCatalogo(inpCodigo.value.trim()));

function buscarEnCatalogo(codigo, avisoRecienLeido = false) {
    const prod = catalogo[codigo];
    const estado = document.getElementById('estadoCodigo');
    if (!codigo) {
        estado.textContent = 'Ingresá o escaneá un código para verificar si ya existe en tu catálogo.';
        estado.style.color = '';
        return;
    }
    if (prod) {
        document.getElementById('inpNombre').value = prod.nombre;
        document.getElementById('inpCategoria').value = prod.categoria;
        document.getElementById('inpUnidad').value = prod.unidad;
        if (prod.compraHabitualCant) {
            document.getElementById('inpCantidad').value = prod.compraHabitualCant;
        }
        estado.textContent = avisoRecienLeido
            ? '✅ Código detectado (en catálogo). Revisá cantidad/vencimiento y tocá "Guardar Lote en Stock".'
            : '✅ Producto encontrado en tu catálogo. Completá cantidad y vencimiento.';
        estado.style.color = '#2e5a42';
    } else {
        estado.textContent = avisoRecienLeido
            ? '🆕 Código detectado (nuevo). Completá nombre, cantidad y vencimiento, y tocá "Guardar Lote en Stock".'
            : '🆕 Código nuevo: guardará el producto y su paquete habitual en tu catálogo.';
        estado.style.color = '#7d5d24';
    }
}

async function iniciarCamaraEscaner(mensajeEstado = '📷 Tocá la zona de cámara para reenfocar si hace falta.') {
    if (typeof Html5Qrcode === 'undefined') {
        alert('No se cargó la librería del escáner. Verificá tu conexión a internet.');
        return;
    }

    detenerCamaraSegura();

    const formatosPermitidos = typeof Html5QrcodeSupportedFormats !== 'undefined'
        ? [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128
        ]
        : undefined;

    html5QrcodeScanner = formatosPermitidos
        ? new Html5Qrcode("reader", { formatsToSupport: formatosPermitidos, verbose: false })
        : new Html5Qrcode("reader");

    const estado = document.getElementById('estadoCodigo');
    estado.textContent = mensajeEstado;
    estado.style.color = '';

    try {
        await html5QrcodeScanner.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: (viewfinderWidth, viewfinderHeight) => {
                    const ancho = Math.min(340, Math.max(220, Math.floor(viewfinderWidth * 0.85)));
                    const alto = Math.min(180, Math.max(120, Math.floor(viewfinderHeight * 0.45)));
                    return { width: ancho, height: alto };
                },
                videoConstraints: {
                    facingMode: { ideal: "environment" },
                    focusMode: { ideal: "continuous" }
                }
            },
            (decodedText) => {
                const limpio = (decodedText || '').replace(/\D/g, '').trim() || (decodedText || '').trim();
                if (!limpio || limpio.length < 7) return;

                if (navigator.vibrate) navigator.vibrate(100);
                inpCodigo.value = limpio;
                inpCodigo.dispatchEvent(new Event('input', { bubbles: true }));
                buscarEnCatalogo(limpio, true);
                detenerCamaraSegura();
            }
        );
        camaraActiva = true;
    } catch (err) {
        camaraActiva = false;
        alert('No se pudo abrir la cámara (verificá permisos o HTTPS): ' + err);
    }
}

async function intentarReenfocarEnToque() {
    if (!camaraActiva || reenfoqueEnCurso || !readerEl) return;
    reenfoqueEnCurso = true;
    const estado = document.getElementById('estadoCodigo');
    estado.textContent = '🎯 Reenfocando cámara...';

    let aplicoConstraint = false;
    try {
        const video = readerEl.querySelector('video');
        const track = video && video.srcObject && typeof video.srcObject.getVideoTracks === 'function'
            ? video.srcObject.getVideoTracks()[0]
            : null;

        if (track && typeof track.applyConstraints === 'function') {
            try {
                await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });
                aplicoConstraint = true;
            } catch (_) { }

            try {
                await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
                aplicoConstraint = true;
            } catch (_) { }
        }
    } catch (_) { }

    // En varios teléfonos el navegador no expone control de foco por constraints:
    // reiniciar el flujo de cámara dispara un nuevo ciclo de enfoque del dispositivo.
    if (!aplicoConstraint && html5QrcodeScanner) {
        try {
            await html5QrcodeScanner.stop();
            html5QrcodeScanner = null;
            camaraActiva = false;
            await iniciarCamaraEscaner('🎯 Reenfocando cámara... mantené el código firme.');
        } catch (_) { }
    } else if (camaraActiva) {
        estado.textContent = '📷 Mantené el código estable dentro del recuadro para leerlo.';
    }

    reenfoqueEnCurso = false;
}

if (readerEl) {
    readerEl.style.cursor = 'pointer';
    readerEl.addEventListener('click', () => {
        intentarReenfocarEnToque();
    });
}

document.getElementById('btnIniciarCamara').addEventListener('click', () => {
    iniciarCamaraEscaner('📷 Tocá la zona de cámara para reenfocar y acercá/alejá hasta que se vea nítido.');
});

document.getElementById('btnSimularScan').addEventListener('click', () => {
    const demos = Object.keys(catalogo).concat(['7798888999900']);
    const elegido = demos[Math.floor(Math.random() * demos.length)];
    inpCodigo.value = elegido;
    buscarEnCatalogo(elegido, true);
});

document.querySelectorAll('.atajos-fecha button').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('inpVencimiento').value = sumarDiasHoy(parseInt(btn.dataset.dias, 10));
    });
});

document.getElementById('formIngreso').addEventListener('submit', (e) => {
    e.preventDefault();
    const codigo = inpCodigo.value.trim();
    const nombre = document.getElementById('inpNombre').value.trim();
    const categoria = document.getElementById('inpCategoria').value;
    const unidad = document.getElementById('inpUnidad').value;
    const cantidad = parseFloat(document.getElementById('inpCantidad').value);
    const vencimiento = document.getElementById('inpVencimiento').value;

    if (!codigo || !nombre || !(cantidad > 0) || !vencimiento) {
        alert('Completá código, nombre, cantidad mayor a 0 y fecha de vencimiento.');
        return;
    }

    catalogo[codigo] = {
        nombre,
        categoria,
        unidad,
        compraHabitualCant: cantidad,
        compraHabitualUni: unidad
    };
    lotes.push({ id: Date.now(), codigo, nombre, categoria, unidad, cantidad, vencimiento });

    guardarTodo();
    renderizarStock();
    renderizarPreparaciones();
    e.target.reset();
    document.getElementById('estadoCodigo').textContent = '✅ Lote guardado en stock.';
    cerrarModalEscaner();
});

// --- RECETARIO BASE ---
const recEditor = document.getElementById('recetaIngredientesEditor');

function crearFilaIngrediente(container, datos = {}) {
    const row = document.createElement('div');
    row.className = 'ing-row';
    row.innerHTML = `
    <input type="text" class="ing-nombre" placeholder="Insumo (ej: Harina)" value="${datos.nombre || ''}" required>
    <input type="number" class="ing-cant" step="0.01" min="0.01" placeholder="Cant." value="${datos.cantidad ?? ''}" required>
    <select class="ing-uni">
      <option value="g" ${datos.unidad === 'g' ? 'selected' : ''}>g</option>
      <option value="kg" ${datos.unidad === 'kg' ? 'selected' : ''}>kg</option>
      <option value="ml" ${datos.unidad === 'ml' ? 'selected' : ''}>ml</option>
      <option value="L" ${datos.unidad === 'L' ? 'selected' : ''}>L</option>
      <option value="un" ${datos.unidad === 'un' ? 'selected' : ''}>un</option>
    </select>
    <button type="button" class="btn-icon" onclick="this.parentElement.remove(); actualizarPreviewPedido();">✕</button>
  `;
    row.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', actualizarPreviewPedido);
        el.addEventListener('change', actualizarPreviewPedido);
    });
    container.appendChild(row);
    actualizarPreviewPedido();
}

function leerIngredientesDeContenedor(container) {
    const items = [];
    container.querySelectorAll('.ing-row').forEach(row => {
        const nombre = row.querySelector('.ing-nombre').value.trim();
        const cantidad = parseFloat(row.querySelector('.ing-cant').value);
        const unidad = row.querySelector('.ing-uni').value;
        if (nombre && cantidad > 0) {
            items.push({ nombre, cantidad, unidad });
        }
    });
    return items;
}

document.getElementById('btnAddIngReceta').addEventListener('click', () => crearFilaIngrediente(recEditor));

document.getElementById('formReceta').addEventListener('submit', (e) => {
    e.preventDefault();
    const nombre = document.getElementById('recNombre').value.trim();
    const rendimiento = document.getElementById('recRendimiento').value.trim();
    const ingredientes = leerIngredientesDeContenedor(recEditor);

    if (ingredientes.length === 0) {
        alert('Agregá al menos un ingrediente a la receta.');
        return;
    }

    recetas.push({ id: Date.now(), nombre, rendimiento, ingredientes });
    guardarTodo();
    recEditor.innerHTML = '';
    crearFilaIngrediente(recEditor);
    e.target.reset();
    renderizarRecetas();
    cargarSelectRecetas();
});

function renderizarRecetas() {
    const cont = document.getElementById('listaRecetas');
    cont.innerHTML = '';
    document.getElementById('countRecetas').textContent = `${recetas.length} recetas`;

    recetas.forEach(r => {
        const card = document.createElement('div');
        card.className = 'receta-card';
        const detalleIng = r.ingredientes.map(i => `${i.cantidad} ${i.unidad} ${i.nombre}`).join(' · ');
        card.innerHTML = `
      <div>
        <strong>${r.nombre}</strong> ${r.rendimiento ? `<small>(${r.rendimiento})</small>` : ''}<br>
        <span style="color:var(--muted)">${detalleIng}</span>
      </div>
      <button class="btn-icon" onclick="eliminarReceta(${r.id})">✕</button>
    `;
        cont.appendChild(card);
    });
}

window.eliminarReceta = function (id) {
    recetas = recetas.filter(r => r.id !== id);
    guardarTodo();
    renderizarRecetas();
    cargarSelectRecetas();
};

function cargarSelectRecetas() {
    const sel = document.getElementById('prepRecetaSelect');
    sel.innerHTML = '<option value="">-- Sin receta base (a medida) --</option>';
    recetas.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.nombre;
        sel.appendChild(opt);
    });
}

// --- PREPARACIONES CON RECETA, EXTRAS Y FALTANTES ---
const pedidoEditor = document.getElementById('pedidoIngredientesEditor');
const selReceta = document.getElementById('prepRecetaSelect');
const inpMult = document.getElementById('prepMultiplicador');

function cargarIngredientesDesdeReceta() {
    const mult = parseFloat(inpMult.value) || 1;
    pedidoEditor.innerHTML = '';
    const receta = recetas.find(r => String(r.id) === selReceta.value);
    if (!receta) {
        crearFilaIngrediente(pedidoEditor);
        return;
    }
    receta.ingredientes.forEach(ing => {
        crearFilaIngrediente(pedidoEditor, {
            nombre: ing.nombre,
            cantidad: +(ing.cantidad * mult).toFixed(2),
            unidad: ing.unidad
        });
    });
}

selReceta.addEventListener('change', cargarIngredientesDesdeReceta);
inpMult.addEventListener('input', cargarIngredientesDesdeReceta);
document.getElementById('btnAddIngPedido').addEventListener('click', () => crearFilaIngrediente(pedidoEditor));

function calcularFaltantesDeIngredientes(listaIng) {
    const faltantes = [];
    listaIng.forEach(ing => {
        const disponible = obtenerStockDisponible(ing.nombre, ing.unidad);
        if (disponible < ing.cantidad) {
            const resuelto = resolverProductoEspecifico(ing.nombre);
            const nombreEspecifico = resuelto?.nombre || ing.nombre;
            const diferenciaExacta = +(ing.cantidad - disponible).toFixed(4);
            const compraSugerida = ajustarACompraHabitual(nombreEspecifico, diferenciaExacta, ing.unidad);
            faltantes.push(compraSugerida);
        }
    });
    return faltantes;
}

function actualizarPreviewPedido() {
    const box = document.getElementById('pedidoFaltantesPreview');
    const items = leerIngredientesDeContenedor(pedidoEditor);
    if (items.length === 0) {
        box.classList.add('hidden');
        return;
    }
    const faltantes = calcularFaltantesDeIngredientes(items);
    box.classList.remove('hidden');
    if (faltantes.length === 0) {
        box.className = 'faltantes-box ok';
        box.textContent = '✅ Tenés stock suficiente para los insumos cargados.';
    } else {
        box.className = 'faltantes-box warn';
        box.innerHTML = '⚠️ Comprar: ' + faltantes.map(f => `${formatearCantidadDetallada(f.cantidad, f.unidad)} de ${f.nombre}`).join(', ');
    }
}

document.getElementById('formPreparacion').addEventListener('submit', (e) => {
    e.preventDefault();
    const ingredientes = leerIngredientesDeContenedor(pedidoEditor);
    preparaciones.push({
        id: Date.now(),
        producto: document.getElementById('prepProducto').value.trim(),
        tipo: document.getElementById('prepTipo').value,
        fecha: document.getElementById('prepFecha').value,
        notas: document.getElementById('prepNotas').value.trim(),
        ingredientes,
        completado: false
    });
    guardarTodo();
    renderizarPreparaciones();
    renderizarCalendario();
    actualizarContadorAlertas();
    if (!panelAlertas.classList.contains('hidden')) {
        renderizarPanelAlertas();
    }
    pedidoEditor.innerHTML = '';
    crearFilaIngrediente(pedidoEditor);
    selReceta.value = '';
    inpMult.value = 1;
    e.target.reset();
    actualizarPreviewPedido();
});

function renderizarPreparaciones() {
    const lista = document.getElementById('listaPreparaciones');
    lista.innerHTML = '';
    const ordenadas = [...preparaciones].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    ordenadas.forEach(p => {
        const faltantes = p.completado ? [] : calcularFaltantesDeIngredientes(p.ingredientes || []);
        const estadoHtml = p.completado
            ? `<span class="estado-pill hecho">✓ Stock descontado / Listo</span>`
            : faltantes.length === 0
                ? `<span class="estado-pill ok">✓ Stock completo</span>`
                : `<span class="estado-pill faltan">Falta comprar: ${faltantes.map(f => `${formatearCantidadDetallada(f.cantidad, f.unidad)} ${f.nombre}`).join(', ')}</span>`;

        const div = document.createElement('div');
        div.className = `prep-item ${p.completado ? 'listo' : ''}`;
        div.innerHTML = `
      <div>
        <strong>${p.producto}</strong> <small>(${p.tipo})</small><br>
        <span style="color:var(--muted)">📅 ${p.fecha} ${p.notas ? '· ' + p.notas : ''}</span><br>
        ${estadoHtml}
      </div>
      <div class="topbar-actions">
        ${!p.completado ? `<button class="btn-mini" onclick="abrirModalProducir(${p.id})">Producir</button>` : ''}
        ${!p.completado && faltantes.length > 0 ? `<button class="btn-icon" onclick="mandarFaltantesACompras(${p.id})" title="Mandar faltantes a Compras">🛒</button>` : ''}
        <button class="btn-icon" onclick="eliminarPrep(${p.id})" title="Eliminar">✕</button>
      </div>
    `;
        lista.appendChild(div);
    });
}

window.mandarFaltantesACompras = function (id) {
    const prep = preparaciones.find(p => p.id === id);
    if (!prep) return;
    const faltantes = calcularFaltantesDeIngredientes(prep.ingredientes || []);
    faltantes.forEach(f => {
        const yaExiste = compras.find(c => !c.comprado && normalizarNombre(c.nombre) === normalizarNombre(f.nombre) && c.unidad === f.unidad);
        if (yaExiste) {
            yaExiste.cantidad = +(yaExiste.cantidad + f.cantidad).toFixed(2);
        } else {
            compras.push({
                id: Date.now() + Math.random(),
                nombre: f.nombre,
                cantidad: f.cantidad,
                unidad: f.unidad,
                categoria: f.categoria || 'solido',
                comprado: false
            });
        }
    });
    guardarTodo();
    renderizarCompras();
    alert('Faltantes agregados a la pestaña Compras.');
};

window.eliminarPrep = function (id) {
    preparaciones = preparaciones.filter(p => p.id !== id);
    guardarTodo();
    renderizarPreparaciones();
    renderizarCalendario();
    actualizarContadorAlertas();
    if (!panelAlertas.classList.contains('hidden')) {
        renderizarPanelAlertas();
    }
};

// --- MODAL PRODUCCIÓN CON AJUSTE REAL Y DESCUENTO FEFO ---
const modalProducir = document.getElementById('modalProducir');
const listaConsumoReal = document.getElementById('listaConsumoReal');

window.abrirModalProducir = function (id) {
    const prep = preparaciones.find(p => p.id === id);
    if (!prep) return;
    pedidoEnProduccionId = id;
    document.getElementById('tituloModalProducir').textContent = `Producir: ${prep.producto}`;
    listaConsumoReal.innerHTML = '';

    const baseIng = (prep.ingredientes && prep.ingredientes.length > 0)
        ? prep.ingredientes
        : [{ nombre: '', cantidad: 0, unidad: 'g' }];

    baseIng.forEach(ing => agregarFilaConsumoReal(ing));
    modalProducir.classList.remove('hidden');
};

function agregarFilaConsumoReal(ing = {}) {
    const row = document.createElement('div');
    row.className = 'ing-row';
    row.innerHTML = `
    <input type="text" class="cons-nombre" placeholder="Insumo gastado" value="${ing.nombre || ''}">
    <input type="number" class="cons-cant" step="0.01" min="0" value="${ing.cantidad ?? 0}">
    <select class="cons-uni">
      <option value="g" ${ing.unidad === 'g' ? 'selected' : ''}>g</option>
      <option value="kg" ${ing.unidad === 'kg' ? 'selected' : ''}>kg</option>
      <option value="ml" ${ing.unidad === 'ml' ? 'selected' : ''}>ml</option>
      <option value="L" ${ing.unidad === 'L' ? 'selected' : ''}>L</option>
      <option value="un" ${ing.unidad === 'un' ? 'selected' : ''}>un</option>
    </select>
    <button type="button" class="btn-icon" onclick="this.parentElement.remove()">✕</button>
  `;
    listaConsumoReal.appendChild(row);
}

document.getElementById('btnAddExtraConsumo').addEventListener('click', () => agregarFilaConsumoReal());
document.getElementById('btnCerrarProducir').addEventListener('click', () => modalProducir.classList.add('hidden'));

document.getElementById('btnConfirmarDescuentoFEFO').addEventListener('click', () => {
    const prep = preparaciones.find(p => p.id === pedidoEnProduccionId);
    if (!prep) return;

    listaConsumoReal.querySelectorAll('.ing-row').forEach(row => {
        const nombre = row.querySelector('.cons-nombre').value.trim();
        const cant = parseFloat(row.querySelector('.cons-cant').value);
        const uni = row.querySelector('.cons-uni').value;
        if (nombre && cant > 0) {
            descontarFEFO(nombre, cant, uni);
        }
    });

    prep.completado = true;
    guardarTodo();
    renderizarStock();
    renderizarPreparaciones();
    modalProducir.classList.add('hidden');
});

// --- CALENDARIO ---
function renderizarCalendario() {
    const grid = document.getElementById('calGrid');
    grid.innerHTML = '';
    const anio = fechaCalendario.getFullYear();
    const mes = fechaCalendario.getMonth();
    const nombresMes = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    document.getElementById('calMesTitulo').textContent = `${nombresMes[mes]} ${anio}`;

    const primerDia = new Date(anio, mes, 1).getDay();
    const diasEnMes = new Date(anio, mes + 1, 0).getDate();
    const hoyStr = new Date().toISOString().split('T')[0];

    for (let i = 0; i < primerDia; i++) {
        grid.appendChild(document.createElement('div'));
    }

    for (let dia = 1; dia <= diasEnMes; dia++) {
        const fechaStr = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const eventosDia = preparaciones.filter(p => p.fecha === fechaStr);

        const celda = document.createElement('div');
        celda.className = 'cal-day';
        if (fechaStr === hoyStr) celda.classList.add('hoy');
        if (eventosDia.length > 0) celda.classList.add('con-evento');
        celda.textContent = dia;

        celda.addEventListener('click', () => {
            const detalle = document.getElementById('calDetalleDia');
            if (eventosDia.length === 0) {
                detalle.innerHTML = `<strong>${fechaStr}:</strong> Sin entregas programadas.`;
            } else {
                detalle.innerHTML = `<strong>Entregas para ${fechaStr}:</strong><br>` +
                    eventosDia.map(e => `• ${e.producto} (${e.tipo}) ${e.notas ? '- ' + e.notas : ''}`).join('<br>');
            }
        });

        grid.appendChild(celda);
    }
}

document.getElementById('prevMes').addEventListener('click', () => { fechaCalendario.setMonth(fechaCalendario.getMonth() - 1); renderizarCalendario(); });
document.getElementById('nextMes').addEventListener('click', () => { fechaCalendario.setMonth(fechaCalendario.getMonth() + 1); renderizarCalendario(); });

// --- LISTA DE COMPRAS ---
document.getElementById('formCompraManual').addEventListener('submit', (e) => {
    e.preventDefault();
    compras.push({
        id: Date.now(),
        nombre: document.getElementById('compProducto').value.trim(),
        cantidad: parseFloat(document.getElementById('compCantidad').value),
        unidad: document.getElementById('compUnidad').value,
        categoria: document.getElementById('compCategoria').value,
        comprado: false
    });
    guardarTodo();
    renderizarCompras();
    e.target.reset();
});

document.getElementById('btnSincronizarFaltantes').addEventListener('click', () => {
    let agregados = 0;
    preparaciones.filter(p => !p.completado).forEach(p => {
        const faltantes = calcularFaltantesDeIngredientes(p.ingredientes || []);
        faltantes.forEach(f => {
            const yaExiste = compras.some(c => !c.comprado && normalizarNombre(c.nombre) === normalizarNombre(f.nombre) && c.unidad === f.unidad);
            if (!yaExiste) {
                compras.push({
                    id: Date.now() + Math.random(),
                    nombre: f.nombre,
                    cantidad: f.cantidad,
                    unidad: f.unidad,
                    categoria: f.categoria || 'solido',
                    comprado: false
                });
                agregados++;
            }
        });
    });
    guardarTodo();
    renderizarCompras();
    alert(agregados > 0 ? `Se sumaron ${agregados} faltante(s) a compras.` : 'No hay faltantes nuevos para agregar.');
});

const btnLimpiarComprados = document.getElementById('btnLimpiarComprados');
if (btnLimpiarComprados) {
    btnLimpiarComprados.addEventListener('click', () => {
        const hayComprados = compras.some(c => c.comprado);
        if (!hayComprados) {
            alert('No hay ítems marcados como comprados para limpiar.');
            return;
        }
        compras = compras.filter(c => !c.comprado);
        guardarTodo();
        renderizarCompras();
    });
}

function renderizarCompras() {
    const cont = document.getElementById('listaCompras');
    cont.innerHTML = '';

    const pendientes = compras.filter(c => !c.comprado).length;
    const badge = document.getElementById('badgeCompras');
    badge.textContent = pendientes;
    badge.classList.toggle('hidden', pendientes === 0);

    if (compras.length === 0) {
        cont.innerHTML = '<p class="hint">Tu lista de compras está vacía.</p>';
        return;
    }

    compras.forEach(item => {
        const row = document.createElement('div');
        row.className = `compra-item ${item.comprado ? 'comprado' : ''}`;
        row.innerHTML = `
      <div>
        <input type="checkbox" ${item.comprado ? 'checked' : ''} onchange="toggleComprado(${item.id})">
        <strong>${item.nombre}</strong> — ${formatearCantidadDetallada(item.cantidad, item.unidad)}
      </div>
      <div class="topbar-actions">
        <button class="btn-mini" onclick="pasarCompraAStock(${item.id})">+ A Stock</button>
        <button class="btn-icon" onclick="eliminarCompra(${item.id})">✕</button>
      </div>
    `;
        cont.appendChild(row);
    });
}

window.toggleComprado = function (id) {
    const item = compras.find(c => c.id === id);
    if (!item) return;
    item.comprado = !item.comprado;
    guardarTodo();
    renderizarCompras();
};

window.pasarCompraAStock = function (id) {
    const item = compras.find(c => c.id === id);
    if (!item) return;
    const venc = sumarDiasHoy(60);
    lotes.push({
        id: Date.now(),
        codigo: 'MANUAL-' + Date.now().toString().slice(-5),
        nombre: item.nombre,
        categoria: item.categoria || 'solido',
        unidad: item.unidad,
        cantidad: item.cantidad,
        vencimiento: venc
    });
    compras = compras.filter(c => c.id !== id);
    guardarTodo();
    renderizarStock();
    renderizarPreparaciones();
    renderizarCompras();
};

window.eliminarCompra = function (id) {
    compras = compras.filter(c => c.id !== id);
    guardarTodo();
    renderizarCompras();
};

// --- NAVEGACIÓN DE PESTAÑAS ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
});

// --- INICIALIZACIÓN ---
crearFilaIngrediente(recEditor);
crearFilaIngrediente(pedidoEditor);
cargarSelectRecetas();
renderizarStock();
renderizarRecetas();
renderizarPreparaciones();
renderizarCalendario();
renderizarCompras();
verificarYNotificar(false);