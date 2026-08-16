/* =============================================================================
   Jaguarete Kora — Batería de tests
   Cubre los criterios de aceptación del PRD §30.1 (motor), §30.2 (orientación)
   y §30.3 (IA), más la verificación de la geometría del tablero contra la
   imagen del documento de reglas.
   ========================================================================== */

const resultados = [];
let grupoActual = '';

function grupo(nombre) { grupoActual = nombre; }

function test(nombre, fn) {
  try {
    fn();
    resultados.push({ grupo: grupoActual, nombre, ok: true });
  } catch (e) {
    resultados.push({ grupo: grupoActual, nombre, ok: false, error: e.message });
  }
}

function afirmar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje || 'afirmación falsa');
}

function igual(obtenido, esperado, mensaje) {
  if (obtenido !== esperado) {
    throw new Error((mensaje || 'valor inesperado') + ': esperado ' + esperado + ', obtenido ' + obtenido);
  }
}

/* --- Utilidades de construcción de posiciones ----------------------------- */

/* Crea un estado arbitrario para probar situaciones concretas. */
function posicion({ jaguarete, jagua, turno = Motor.JAGUARETE, capturas = 0 }) {
  const estado = Motor.crearEstado();
  estado.jaguarete = jaguarete;
  estado.jagua = jagua.reduce((m, n) => m | (1 << n), 0);
  estado.turno = turno;
  estado.capturas = capturas;
  estado.repeticiones = new Map();
  estado.historial = [];
  return estado;
}

const mover = (estado, desde, hasta) => {
  const m = Motor.movimientosLegales(estado).find((x) => x.desde === desde && x.hasta === hasta);
  afirmar(m, 'no existe el movimiento ' + Motor.NOMBRES[desde] + '->' + Motor.NOMBRES[hasta]);
  return Motor.aplicarMovimiento(estado, m);
};

/* ==========================================================================
   1. Geometría del tablero
   ========================================================================== */

grupo('Geometría del tablero');

test('El tablero tiene 31 nodos: 25 del alquerque más 6 de la kora', () => {
  igual(Motor.NUM_NODOS, 31);
});

test('El tablero tiene 68 aristas: 56 del alquerque y 12 de la kora', () => {
  const total = Motor.ADJ.reduce((n, vecinos) => n + vecinos.length, 0) / 2;
  igual(total, 68);
});

test('Las diagonales existen sólo donde fila+columna es par', () => {
  for (let fila = 0; fila < 5; fila++) {
    for (let col = 0; col < 5; col++) {
      const nodo = fila * 5 + col;
      const tieneDiagonal = Motor.ADJ[nodo].some((v) => {
        if (v >= 25) return false;
        const [dx, dy] = [Math.abs(Motor.COORDS[v][0] - col), Math.abs(Motor.COORDS[v][1] - fila)];
        return dx === 1 && dy === 1;
      });
      igual(tieneDiagonal, (fila + col) % 2 === 0, 'diagonales en ' + Motor.NOMBRES[nodo]);
    }
  }
});

test('El centro del alquerque tiene ocho conexiones', () => {
  igual(Motor.ADJ[12].length, 8);
});

test('La kora cuelga sólo del nodo central de la última fila', () => {
  igual(Motor.ADJ[22].filter((v) => v >= 25).length, 3);
  for (const nodo of [20, 21, 23, 24]) {
    igual(Motor.ADJ[nodo].filter((v) => v >= 25).length, 0, 'kora conectada a ' + Motor.NOMBRES[nodo]);
  }
});

test('El vértice de la kora conecta con los cinco nodos del triángulo', () => {
  igual(Motor.ADJ[Motor.N_VERTICE].length, 5);
  for (const nodo of [25, 26, 27, 28, 30]) {
    afirmar(Motor.ADJ[Motor.N_VERTICE].includes(nodo), 'falta arista al nodo ' + Motor.NOMBRES[nodo]);
  }
});

test('Las esquinas de la base de la kora tienen sólo dos conexiones', () => {
  igual(Motor.ADJ[28].length, 2);
  igual(Motor.ADJ[30].length, 2);
});

/* ==========================================================================
   2. Posición inicial y turnos  (PRD §30.1)
   ========================================================================== */

grupo('Posición inicial y turnos');

test('Hay 15 jagua en las tres filas superiores', () => {
  const estado = Motor.crearEstado();
  igual(Motor.contarJagua(estado), 15);
  for (let nodo = 0; nodo < 15; nodo++) afirmar(Motor.hayJagua(estado, nodo), 'falta jagua');
  for (let nodo = 15; nodo < 31; nodo++) afirmar(!Motor.hayJagua(estado, nodo), 'jagua fuera de sitio');
});

test('El Jaguarete empieza en el vértice de la kora', () => {
  igual(Motor.crearEstado().jaguarete, Motor.N_VERTICE);
});

test('El Jaguarete siempre mueve primero', () => {
  igual(Motor.crearEstado().turno, Motor.JAGUARETE);
});

test('El turno alterna tras cada jugada', () => {
  const estado = Motor.crearEstado();
  mover(estado, Motor.N_VERTICE, 26);
  igual(estado.turno, Motor.JAGUAKUERA);
  mover(estado, 10, 15);
  igual(estado.turno, Motor.JAGUARETE);
});

/* ==========================================================================
   3. Movimiento del Jaguarete  (PRD §30.1)
   ========================================================================== */

grupo('Movimiento del Jaguarete');

test('Desde el vértice puede moverse a los cinco nodos vecinos libres', () => {
  const estado = posicion({ jaguarete: Motor.N_VERTICE, jagua: [] });
  const destinos = Motor.movimientosLegales(estado).map((m) => m.hasta).sort((a, b) => a - b);
  igual(destinos.join(','), '25,26,27,28,30');
});

test('Puede retroceder: avanza y vuelve al nodo anterior', () => {
  const estado = posicion({ jaguarete: 26, jagua: [] });
  afirmar(Motor.esMovimientoLegal(estado, 26, 22), 'debería poder avanzar al cuerpo del tablero');
  mover(estado, 26, 22);
  estado.turno = Motor.JAGUARETE;
  afirmar(Motor.esMovimientoLegal(estado, 22, 26), 'debería poder retroceder a la kora');
});

test('Se mueve en diagonal donde el tablero lo permite y no donde no', () => {
  const estado = posicion({ jaguarete: 12, jagua: [] });
  afirmar(Motor.esMovimientoLegal(estado, 12, 6), 'diagonal legal en el centro');
  const estadoImpar = posicion({ jaguarete: 11, jagua: [] });
  afirmar(!Motor.esMovimientoLegal(estadoImpar, 11, 5), 'diagonal inexistente en nodo impar');
});

test('No puede moverse a un nodo ocupado', () => {
  const estado = posicion({ jaguarete: 12, jagua: [7] });
  afirmar(!Motor.esMovimientoLegal(estado, 12, 7), 'no debe entrar en nodo ocupado');
});

/* ==========================================================================
   4. Movimiento de los Jaguakuéra  (PRD §30.1)
   ========================================================================== */

grupo('Movimiento de los Jaguakuéra');

test('Un jagua no puede retroceder', () => {
  const estado = posicion({ jaguarete: Motor.N_VERTICE, jagua: [12], turno: Motor.JAGUAKUERA });
  afirmar(!Motor.esMovimientoLegal(estado, 12, 7), 'retroceso vertical prohibido');
  afirmar(!Motor.esMovimientoLegal(estado, 12, 6), 'retroceso diagonal prohibido');
  afirmar(!Motor.esMovimientoLegal(estado, 12, 8), 'retroceso diagonal prohibido');
});

test('Un jagua puede avanzar, moverse en lateral y avanzar en diagonal', () => {
  const estado = posicion({ jaguarete: Motor.N_VERTICE, jagua: [12], turno: Motor.JAGUAKUERA });
  afirmar(Motor.esMovimientoLegal(estado, 12, 17), 'avance vertical');
  afirmar(Motor.esMovimientoLegal(estado, 12, 11), 'lateral izquierda');
  afirmar(Motor.esMovimientoLegal(estado, 12, 13), 'lateral derecha');
  afirmar(Motor.esMovimientoLegal(estado, 12, 16), 'diagonal de avance');
  afirmar(Motor.esMovimientoLegal(estado, 12, 18), 'diagonal de avance');
});

test('Los jagua pueden entrar en la kora', () => {
  const estado = posicion({ jaguarete: Motor.N_VERTICE, jagua: [22], turno: Motor.JAGUAKUERA });
  afirmar(Motor.esMovimientoLegal(estado, 22, 25), 'entrada a la kora');
  afirmar(Motor.esMovimientoLegal(estado, 22, 26), 'entrada a la kora');
  afirmar(Motor.esMovimientoLegal(estado, 22, 27), 'entrada a la kora');
});

test('Un jagua nunca captura', () => {
  const estado = posicion({ jaguarete: 12, jagua: [7], turno: Motor.JAGUAKUERA });
  const movimientos = Motor.movimientosLegales(estado);
  afirmar(movimientos.every((m) => m.capturado === -1), 'ningún movimiento de jagua captura');
  afirmar(!movimientos.some((m) => m.hasta === 17), 'un jagua no salta sobre el Jaguarete');
});

test('Los 15 jagua iniciales generan sólo movimientos legales de avance', () => {
  const estado = Motor.crearEstado();
  estado.turno = Motor.JAGUAKUERA;
  const movimientos = Motor.movimientosLegales(estado);
  afirmar(movimientos.length > 0, 'debe haber movimientos');
  for (const m of movimientos) {
    afirmar(Motor.NIVEL[m.hasta] >= Motor.NIVEL[m.desde], 'movimiento hacia atrás generado');
    afirmar(Motor.ES_ADYACENTE[m.desde][m.hasta], 'movimiento sin arista');
  }
});

/* ==========================================================================
   5. Capturas  (PRD §30.1)
   ========================================================================== */

grupo('Capturas');

test('El Jaguarete captura saltando un jagua hacia el nodo posterior vacío', () => {
  const estado = posicion({ jaguarete: 12, jagua: [7] });
  const captura = Motor.movimientosLegales(estado).find((m) => m.capturado === 7);
  afirmar(captura, 'debe existir la captura');
  igual(captura.hasta, 2);
  Motor.aplicarMovimiento(estado, captura);
  igual(estado.capturas, 1);
  igual(Motor.contarJagua(estado), 0);
  igual(estado.jaguarete, 2);
});

test('Una captura elimina exactamente un jagua', () => {
  const estado = posicion({ jaguarete: 12, jagua: [7, 11, 13, 17] });
  const captura = Motor.movimientosLegales(estado).find((m) => m.capturado >= 0);
  Motor.aplicarMovimiento(estado, captura);
  igual(Motor.contarJagua(estado), 3);
  igual(estado.capturas, 1);
});

test('No hay captura si el nodo de aterrizaje está ocupado', () => {
  const estado = posicion({ jaguarete: 12, jagua: [7, 2] });
  afirmar(!Motor.movimientosLegales(estado).some((m) => m.capturado === 7), 'aterrizaje ocupado');
});

test('No hay captura sin línea que una los tres nodos', () => {
  // 11 es adyacente a 12, pero no existe la línea 11-10 en su prolongación.
  const estado = posicion({ jaguarete: 12, jagua: [11] });
  const captura = Motor.movimientosLegales(estado).find((m) => m.capturado === 11);
  afirmar(captura, 'la captura horizontal 12-11-10 sí existe');
  igual(captura.hasta, 10);
  // En cambio, desde el vértice de la kora sobre el nodo kora-izq no hay salida.
  const kora = posicion({ jaguarete: Motor.N_VERTICE, jagua: [25] });
  afirmar(!Motor.movimientosLegales(kora).some((m) => m.capturado === 25), 'salto sin línea de salida');
});

test('No existen capturas múltiples en un mismo turno', () => {
  const estado = posicion({ jaguarete: 12, jagua: [7, 1] });
  const captura = Motor.movimientosLegales(estado).find((m) => m.capturado === 7);
  Motor.aplicarMovimiento(estado, captura);
  igual(estado.turno, Motor.JAGUAKUERA, 'el turno pasa tras una única captura');
  igual(estado.capturas, 1);
});

test('Capturar no es obligatorio', () => {
  const estado = posicion({ jaguarete: 12, jagua: [7] });
  const movimientos = Motor.movimientosLegales(estado);
  afirmar(movimientos.some((m) => m.capturado >= 0), 'existe captura');
  afirmar(movimientos.some((m) => m.capturado === -1), 'existen también movimientos simples');
});

test('El Jaguarete puede capturar entrando y saliendo de la kora', () => {
  const entrada = posicion({ jaguarete: 22, jagua: [26] });
  const salto = Motor.movimientosLegales(entrada).find((m) => m.capturado === 26);
  afirmar(salto, 'salto desde el cuerpo hacia la base de la kora');
  igual(salto.hasta, Motor.N_VERTICE);

  const salida = posicion({ jaguarete: Motor.N_VERTICE, jagua: [26] });
  const salto2 = Motor.movimientosLegales(salida).find((m) => m.capturado === 26);
  afirmar(salto2, 'salto desde la base hacia el cuerpo');
  igual(salto2.hasta, 22);
});

/* ==========================================================================
   6. Condiciones de final  (PRD §30.1)
   ========================================================================== */

grupo('Condiciones de final');

test('El Jaguarete gana al capturar ocho jagua', () => {
  const estado = posicion({ jaguarete: 12, jagua: [7], capturas: 7 });
  afirmar(Motor.resultado(estado) === null, 'con 7 capturas la partida sigue');
  Motor.aplicarMovimiento(estado, Motor.movimientosLegales(estado).find((m) => m.capturado === 7));
  const fin = Motor.resultado(estado);
  afirmar(fin, 'debe haber resultado');
  igual(fin.ganador, Motor.JAGUARETE);
  igual(fin.motivo, 'capturas');
});

test('Un Jaguarete rodeado no está encerrado si todavía puede saltar', () => {
  // Vecinos ocupados pero con los nodos de aterrizaje libres: hay capturas.
  const estado = posicion({ jaguarete: 28, jagua: [25, 29] });
  igual(Motor.movimientosLegales(estado).length, 2, 'debe poder capturar en dos direcciones');
  afirmar(Motor.resultado(estado) === null, 'la partida no ha terminado');
});

test('Los Jaguakuéra ganan si el Jaguarete se queda sin movimientos', () => {
  // Esquina de la base: vecinos ocupados y aterrizajes de salto también tapados.
  const estado = posicion({ jaguarete: 28, jagua: [25, 29, 22, 30] });
  igual(Motor.movimientosLegales(estado).length, 0, 'sin movimientos legales');
  const fin = Motor.resultado(estado);
  afirmar(fin, 'debe haber resultado');
  igual(fin.ganador, Motor.JAGUAKUERA);
  igual(fin.motivo, 'encierro');
});

test('El encierro sólo se declara en el turno del Jaguarete', () => {
  const estado = posicion({ jaguarete: 28, jagua: [25, 29, 22, 30], turno: Motor.JAGUAKUERA });
  afirmar(Motor.resultado(estado) === null, 'en turno de los jagua la partida sigue');
});

test('Los Jaguakuéra pasan turno si no tienen ningún movimiento legal', () => {
  // Un único jagua en la base, sin nodos de avance ni laterales libres.
  const estado = posicion({ jaguarete: 28, jagua: [30], turno: Motor.JAGUAKUERA });
  estado.jagua |= (1 << 29);
  igual(Motor.movimientosLegales(estado).length, 0, 'los jagua no tienen movimientos');
  afirmar(Motor.debePasar(estado), 'deben pasar turno');
  Motor.pasarTurno(estado);
  igual(estado.turno, Motor.JAGUARETE);
});

test('El Jaguarete gana si alcanza una zona que ningún jagua puede pisar', () => {
  // Jaguarete arriba del todo; todos los jagua han quedado por debajo y no
  // pueden retroceder, de modo que jamás podrán cercarlo.
  const estado = posicion({ jaguarete: 0, jagua: [15, 16, 17, 18, 19] });
  afirmar(Motor.cercoImposible(estado), 'el cerco debe ser imposible');
  const fin = Motor.resultado(estado);
  afirmar(fin, 'debe declararse resultado');
  igual(fin.ganador, Motor.JAGUARETE);
  igual(fin.motivo, 'fuga');
});

test('No hay fuga mientras algún jagua pueda todavía alcanzar al Jaguarete', () => {
  const estado = posicion({ jaguarete: 12, jagua: [5, 6, 7] });
  afirmar(!Motor.cercoImposible(estado), 'los jagua aún pueden avanzar hacia él');
  afirmar(Motor.resultado(estado) === null, 'la partida continúa');
});

test('No hay fuga si el Jaguarete está en zona segura pero sin vecino seguro', () => {
  // Los jagua no alcanzan el nodo 2, pero sí todos sus vecinos: no podría
  // moverse sin volver a territorio alcanzable.
  const estado = posicion({ jaguarete: 2, jagua: [1, 3, 6, 7, 8] });
  afirmar(!Motor.cercoImposible(estado), 'no hay bolsa segura donde sostenerse');
});

test('La repetición triple de la posición es tablas', () => {
  const estado = posicion({ jaguarete: 26, jagua: [], turno: Motor.JAGUARETE });
  estado.repeticiones = new Map();
  // El Jaguarete oscila entre dos nodos con el tablero vacío de jagua.
  for (let i = 0; i < 3; i++) {
    estado.turno = Motor.JAGUARETE;
    mover(estado, 26, 22);
    estado.turno = Motor.JAGUARETE;
    mover(estado, 22, 26);
  }
  const fin = Motor.resultado(estado);
  afirmar(fin, 'debe declararse tablas');
  igual(fin.ganador, null);
  igual(fin.motivo, 'repeticion');
});

test('Un movimiento ilegal no puede modificar el estado', () => {
  const estado = Motor.crearEstado();
  const antes = JSON.stringify([estado.jaguarete, estado.jagua, estado.turno, estado.capturas]);
  afirmar(!Motor.esMovimientoLegal(estado, Motor.N_VERTICE, 12), 'salto a distancia no es legal');
  afirmar(!Motor.esMovimientoLegal(estado, 0, 5), 'no es el turno de los jagua');
  const despues = JSON.stringify([estado.jaguarete, estado.jagua, estado.turno, estado.capturas]);
  igual(despues, antes, 'el estado no debe cambiar');
});

/* ==========================================================================
   7. Orientación  (PRD §30.2)
   ========================================================================== */

grupo('Orientación del tablero');

test('Jugando con Jaguarete la kora queda del lado del jugador', () => {
  const kora = Vista.puntoDeNodo(Motor.N_VERTICE, false);
  const jagua = Vista.puntoDeNodo(0, false);
  afirmar(kora.y > jagua.y, 'la kora debe quedar abajo, frente al jugador');
});

test('Jugando con Jaguakuéra el tablero se invierte y los jagua quedan delante', () => {
  const kora = Vista.puntoDeNodo(Motor.N_VERTICE, true);
  const jagua = Vista.puntoDeNodo(0, true);
  afirmar(kora.y < jagua.y, 'la kora debe subir al fondo');
  afirmar(jagua.y > Vista.puntoDeNodo(0, false).y, 'la zona de los jagua baja hacia el jugador');
});

test('La rotación es un reflejo exacto respecto del centro del lienzo', () => {
  for (let nodo = 0; nodo < Motor.NUM_NODOS; nodo++) {
    const normal = Vista.puntoDeNodo(nodo, false);
    const invertido = Vista.puntoDeNodo(nodo, true);
    igual(normal.x + invertido.x, Vista.ANCHO, 'eje X del nodo ' + nodo);
    igual(normal.y + invertido.y, Vista.ALTO, 'eje Y del nodo ' + nodo);
  }
});

test('La misma posición lógica produce dos orientaciones sin alterar el estado', () => {
  const estado = Motor.crearEstado();
  const antes = Motor.clavePosicion(estado);
  Vista.puntoDeNodo(estado.jaguarete, false);
  Vista.puntoDeNodo(estado.jaguarete, true);
  igual(Motor.clavePosicion(estado), antes, 'dibujar no puede tocar el estado');
});

test('Tras rotar, cada punto sigue apuntando a su propio nodo', () => {
  for (const rotado of [false, true]) {
    for (let nodo = 0; nodo < Motor.NUM_NODOS; nodo++) {
      const p = Vista.puntoDeNodo(nodo, rotado);
      igual(Vista.nodoMasCercano(p.x, p.y, rotado), nodo, 'nodo ' + Motor.NOMBRES[nodo]);
    }
  }
});

test('Un toque lejos de cualquier nodo no selecciona nada', () => {
  igual(Vista.nodoMasCercano(4, 4, false), -1);
});

/* ==========================================================================
   8. IA  (PRD §30.3)
   ========================================================================== */

grupo('Inteligencia artificial');

test('La IA nunca devuelve un movimiento ilegal, en ambos bandos y tres niveles', () => {
  for (const nivel of ['facil', 'medio', 'dificil']) {
    for (const bando of [Motor.JAGUARETE, Motor.JAGUAKUERA]) {
      const estado = Motor.crearEstado();
      estado.turno = bando;
      const jugada = IA.elegirMovimiento(estado, nivel);
      afirmar(jugada, 'la IA debe devolver jugada (' + nivel + ')');
      afirmar(
        Motor.movimientosLegales(estado).some(
          (m) => m.desde === jugada.desde && m.hasta === jugada.hasta && m.capturado === jugada.capturado
        ),
        'jugada ilegal de la IA en nivel ' + nivel
      );
    }
  }
});

test('La IA respeta las reglas de captura', () => {
  const estado = posicion({ jaguarete: 12, jagua: [7, 11] });
  const jugada = IA.elegirMovimiento(estado, 'dificil');
  afirmar(jugada.capturado === -1 || Motor.hayJagua(estado, jugada.capturado), 'sólo captura jagua reales');
  const jagua = posicion({ jaguarete: 12, jagua: [7, 11], turno: Motor.JAGUAKUERA });
  igual(IA.elegirMovimiento(jagua, 'dificil').capturado, -1, 'los jagua nunca capturan');
});

test('El nivel difícil aprovecha una captura inmediata evidente', () => {
  const estado = posicion({ jaguarete: 12, jagua: [7], capturas: 7 });
  const jugada = IA.elegirMovimiento(estado, 'dificil');
  igual(jugada.capturado, 7, 'debe capturar para ganar la partida');
});

test('El nivel difícil evita el encierro inmediato cuando existe escapatoria', () => {
  // El Jaguarete puede quedar encerrado si entra en la esquina de la base.
  const estado = posicion({ jaguarete: Motor.N_VERTICE, jagua: [25, 27, 22] });
  const jugada = IA.elegirMovimiento(estado, 'dificil');
  afirmar(jugada.hasta !== 28 || jugada.capturado >= 0, 'no debe encerrarse voluntariamente');
});

test('Una partida completa entre IAs termina en un resultado legal', () => {
  const estado = Motor.crearEstado();
  let jugadas = 0;
  while (Motor.resultado(estado) === null && jugadas < 400) {
    if (Motor.debePasar(estado)) { Motor.pasarTurno(estado); jugadas++; continue; }
    const jugada = IA.elegirMovimiento(estado, 'medio', { presupuestoMs: 12, profundidadMax: 3 });
    afirmar(
      Motor.movimientosLegales(estado).some((m) => m.desde === jugada.desde && m.hasta === jugada.hasta),
      'jugada ilegal en la partida automática'
    );
    Motor.aplicarMovimiento(estado, jugada);
    jugadas++;
  }
  const fin = Motor.resultado(estado);
  afirmar(fin, 'la partida debe terminar en menos de 400 jugadas (llegó a ' + jugadas + ')');
  afirmar(Motor.contarJagua(estado) + estado.capturas === Motor.TOTAL_JAGUA, 'se conservan las 15 fichas');
});

test('Los tres niveles producen comportamientos diferenciables', () => {
  // El nivel fácil no debería encontrar sistemáticamente la mejor jugada táctica.
  const construir = () => posicion({ jaguarete: 12, jagua: [7, 17, 11], capturas: 7 });
  let aciertosFacil = 0;
  for (let i = 0; i < 20; i++) {
    if (IA.elegirMovimiento(construir(), 'facil').capturado >= 0) aciertosFacil++;
  }
  igual(IA.elegirMovimiento(construir(), 'dificil').capturado >= 0, true, 'el difícil captura para ganar');
  afirmar(aciertosFacil < 20, 'el nivel fácil no debe ser perfecto (' + aciertosFacil + '/20)');
});

/* --- Ejecución ------------------------------------------------------------ */

function ejecutar() {
  const fallos = resultados.filter((r) => !r.ok);
  return { total: resultados.length, fallos: fallos.length, resultados };
}
