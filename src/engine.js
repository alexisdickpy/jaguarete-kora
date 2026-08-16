/* =============================================================================
   Jaguarete Kora — Motor de reglas
   -----------------------------------------------------------------------------
   Reglas canónicas fijadas en el PRD (v1.0) y corregidas contra la imagen del
   documento «Instrucciones o Reglas del Juego»:

     · Tablero: alquerque de 5x5 (25 nodos) + extensión triangular de la kora
       (6 nodos) = 31 nodos operativos.
     · Jaguakuéra: 15 jagua en las tres filas superiores.
     · Jaguarete: 1 ficha en el vértice central de la base de la kora. Mueve primero.
     · Jaguarete: un nodo por turno en cualquier arista. Captura saltando un jagua
       adyacente hacia el nodo vacío inmediatamente posterior en la misma línea.
       Sin capturas múltiples. Capturar no es obligatorio.
     · Jaguakuéra: un nodo por turno hacia adelante, en diagonal hacia adelante o
       en lateral. Nunca hacia atrás. Pueden entrar en la kora.
     · Victoria de Jaguarete: 8 capturas. Victoria de Jaguakuéra: el Jaguarete se
       queda sin movimientos legales.
     · Si los Jaguakuéra no tienen movimiento legal pero el Jaguarete sí, los
       jagua pasan turno. La repetición triple de la posición es tablas.

   El tablero es un retículo regular de 5 columnas x 7 filas: las coordenadas
   sirven para dibujar y para verificar la colinealidad de los saltos, pero la
   legalidad de todo movimiento la decide siempre el grafo de aristas.
   ========================================================================== */

(function (raiz) {
  'use strict';


  /* --- Identificadores ------------------------------------------------------ */

  const JAGUARETE = 0;
  const JAGUAKUERA = 1;

  const CAPTURAS_PARA_GANAR = 8;
  const TOTAL_JAGUA = 15;

  /* Regla propuesta, pendiente de confirmación por el propietario del proyecto:
     si los jagua ya no pueden cerrar el cerco de ninguna manera, se declara
     vencedor al Jaguarete. Es la misma lógica que el documento de reglas aplica
     a las ocho capturas («ya se le considera vencedor pues es imposible
     encerrarlo»). Con esta constante a false la partida seguiría hasta tablas
     por repetición. */
  const REGLA_FUGA = true;

  /* --- Nodos ----------------------------------------------------------------
     0..24  cuerpo alquerque, índice = fila * 5 + columna (fila 0 = fila superior)
     25..27 fila interior de la kora
     28..30 base de la kora (29 es el vértice donde comienza el Jaguarete)
     -------------------------------------------------------------------------- */

  const N_KORA_IZQ = 25, N_KORA_CEN = 26, N_KORA_DER = 27;
  const N_BASE_IZQ = 28, N_VERTICE = 29, N_BASE_DER = 30;

  const COORDS = (() => {
    const c = [];
    for (let fila = 0; fila < 5; fila++) {
      for (let col = 0; col < 5; col++) c.push([col, fila]);
    }
    c[N_KORA_IZQ] = [1, 5];
    c[N_KORA_CEN] = [2, 5];
    c[N_KORA_DER] = [3, 5];
    c[N_BASE_IZQ] = [0, 6];
    c[N_VERTICE]  = [2, 6];
    c[N_BASE_DER] = [4, 6];
    return c;
  })();

  const NUM_NODOS = COORDS.length; // 31

  /* Nombre legible de cada nodo, útil en tests y en el registro de jugadas. */
  const NOMBRES = COORDS.map(([x, y], i) => {
    if (i < 25) return String.fromCharCode(65 + x) + (5 - y); // A5..E1
    return 'K' + (i - 24);   // K1..K6, como en la lámina de referencia
  });

  /* --- Aristas --------------------------------------------------------------
     Cuerpo alquerque: todo nodo conecta en ortogonal; las diagonales existen sólo
     en los nodos donde (fila + columna) es par, que es el patrón visible en el
     tablero suministrado. Las aristas de la kora se declaran explícitamente.
     -------------------------------------------------------------------------- */

  const ARISTAS_KORA = [
    [22, N_KORA_IZQ], [22, N_KORA_CEN], [22, N_KORA_DER],
    [N_KORA_IZQ, N_KORA_CEN], [N_KORA_CEN, N_KORA_DER],
    [N_KORA_IZQ, N_BASE_IZQ], [N_KORA_IZQ, N_VERTICE],
    [N_KORA_CEN, N_VERTICE],
    [N_KORA_DER, N_VERTICE], [N_KORA_DER, N_BASE_DER],
    [N_BASE_IZQ, N_VERTICE], [N_VERTICE, N_BASE_DER],
  ];

  const ADJ = (() => {
    const adj = Array.from({ length: NUM_NODOS }, () => []);
    const conectar = (a, b) => {
      if (!adj[a].includes(b)) adj[a].push(b);
      if (!adj[b].includes(a)) adj[b].push(a);
    };

    for (let fila = 0; fila < 5; fila++) {
      for (let col = 0; col < 5; col++) {
        const nodo = fila * 5 + col;
        if (col < 4) conectar(nodo, nodo + 1);
        if (fila < 4) conectar(nodo, nodo + 5);
        if ((fila + col) % 2 === 0) {
          if (col < 4 && fila < 4) conectar(nodo, nodo + 6);
          if (col > 0 && fila < 4) conectar(nodo, nodo + 4);
        }
      }
    }
    for (const [a, b] of ARISTAS_KORA) conectar(a, b);

    return adj.map((l) => l.sort((a, b) => a - b));
  })();

  const ES_ADYACENTE = (() => {
    const m = Array.from({ length: NUM_NODOS }, () => new Uint8Array(NUM_NODOS));
    ADJ.forEach((vecinos, a) => vecinos.forEach((b) => { m[a][b] = 1; }));
    return m;
  })();

  /* --- Saltos ---------------------------------------------------------------
     Un salto es legal si el nodo intermedio y el de aterrizaje son adyacentes
     entre sí y están alineados con el nodo de origen (aterrizaje = 2*medio - origen).
     Se precalcula como lista de tríos [medio, aterrizaje] por nodo de origen.
     -------------------------------------------------------------------------- */

  const SALTOS = (() => {
    const porCoord = new Map();
    COORDS.forEach(([x, y], i) => porCoord.set(x + ',' + y, i));

    return COORDS.map(([x0, y0], origen) =>
      ADJ[origen].reduce((saltos, medio) => {
        const [xm, ym] = COORDS[medio];
        const destino = porCoord.get((2 * xm - x0) + ',' + (2 * ym - y0));
        if (destino !== undefined && ES_ADYACENTE[medio][destino]) {
          saltos.push([medio, destino]);
        }
        return saltos;
      }, [])
    );
  })();

  /* --- Avance de los jagua --------------------------------------------------
     «No retroceder» se define sobre el nivel del nodo, es decir su fila en el
     retículo (0 arriba .. 6 en la base de la kora). Un jagua puede moverse a un
     vecino de nivel igual (lateral) o mayor (avance y diagonal de avance).
     -------------------------------------------------------------------------- */

  const NIVEL = COORDS.map(([, y]) => y);

  const MOVS_JAGUA = ADJ.map((vecinos, origen) =>
    vecinos.filter((destino) => NIVEL[destino] >= NIVEL[origen])
  );

  /* --- Estado ---------------------------------------------------------------
     Los jagua se guardan como máscara de bits de 31 posiciones, lo que permite
     comparar y hashear posiciones a coste constante durante la búsqueda.
     -------------------------------------------------------------------------- */

  const POSICION_INICIAL_JAGUA = (() => {
    let mascara = 0;
    for (let nodo = 0; nodo < 15; nodo++) mascara |= (1 << nodo); // tres filas superiores
    return mascara;
  })();

  function crearEstado() {
    const estado = {
      jaguarete: N_VERTICE,
      jagua: POSICION_INICIAL_JAGUA,
      turno: JAGUARETE,
      capturas: 0,
      /* Historial de repeticiones: clave de posición -> veces vista. */
      repeticiones: new Map(),
      /* Jugadas aplicadas, para deshacer y para la interfaz. */
      historial: [],
    };
    registrarRepeticion(estado);
    return estado;
  }

  function clonarEstado(e) {
    return {
      jaguarete: e.jaguarete,
      jagua: e.jagua,
      turno: e.turno,
      capturas: e.capturas,
      repeticiones: new Map(e.repeticiones),
      historial: e.historial.slice(),
    };
  }

  function hayJagua(estado, nodo) {
    return (estado.jagua & (1 << nodo)) !== 0;
  }

  function estaOcupado(estado, nodo) {
    return nodo === estado.jaguarete || hayJagua(estado, nodo);
  }

  /* Clave única de posición: máscara de jagua + nodo del jaguarete + turno.
     Se mantiene por debajo de 2^37, dentro del rango exacto de un número JS. */
  function clavePosicion(estado) {
    return (estado.jagua >>> 0) * 64 + estado.jaguarete * 2 + estado.turno;
  }

  /* --- Generación de movimientos -------------------------------------------- */

  /* Un movimiento es {desde, hasta, capturado} donde capturado es -1 si no hay captura. */
  function movimientosJaguarete(estado) {
    const movimientos = [];
    const desde = estado.jaguarete;

    for (const [medio, destino] of SALTOS[desde]) {
      if (hayJagua(estado, medio) && !estaOcupado(estado, destino)) {
        movimientos.push({ desde, hasta: destino, capturado: medio });
      }
    }
    for (const destino of ADJ[desde]) {
      if (!estaOcupado(estado, destino)) {
        movimientos.push({ desde, hasta: destino, capturado: -1 });
      }
    }
    return movimientos;
  }

  function movimientosJaguakuera(estado) {
    const movimientos = [];
    let restantes = estado.jagua;

    while (restantes !== 0) {
      const desde = 31 - Math.clz32(restantes & -restantes);
      restantes &= restantes - 1;
      for (const destino of MOVS_JAGUA[desde]) {
        if (!estaOcupado(estado, destino)) {
          movimientos.push({ desde, hasta: destino, capturado: -1 });
        }
      }
    }
    return movimientos;
  }

  function movimientosLegales(estado) {
    return estado.turno === JAGUARETE
      ? movimientosJaguarete(estado)
      : movimientosJaguakuera(estado);
  }

  function esMovimientoLegal(estado, desde, hasta) {
    return movimientosLegales(estado).some((m) => m.desde === desde && m.hasta === hasta);
  }

  /* --- Aplicar y deshacer --------------------------------------------------- */

  function aplicarMovimiento(estado, movimiento) {
    const { desde, hasta, capturado } = movimiento;

    if (estado.turno === JAGUARETE) {
      estado.jaguarete = hasta;
      if (capturado >= 0) {
        estado.jagua &= ~(1 << capturado);
        estado.capturas++;
      }
    } else {
      estado.jagua = (estado.jagua & ~(1 << desde)) | (1 << hasta);
    }

    estado.turno = 1 - estado.turno;
    registrarRepeticion(estado);
    estado.historial.push(movimiento);
    return estado;
  }

  /* El pase de turno se registra como jugada nula: sólo ocurre cuando el bando
     Jaguakuéra no tiene ningún movimiento legal y el Jaguarete no está encerrado. */
  function pasarTurno(estado) {
    estado.turno = 1 - estado.turno;
    registrarRepeticion(estado);
    estado.historial.push({ desde: -1, hasta: -1, capturado: -1, pase: true });
    return estado;
  }

  /* Variante sin historial ni repeticiones, para la búsqueda de la IA: aplica el
     movimiento sobre el propio estado y devuelve lo necesario para deshacerlo. */
  function aplicarRapido(estado, movimiento) {
    const previo = { jaguarete: estado.jaguarete, jagua: estado.jagua, capturas: estado.capturas };
    if (movimiento.pase) {
      estado.turno = 1 - estado.turno;
      return previo;
    }
    if (estado.turno === JAGUARETE) {
      estado.jaguarete = movimiento.hasta;
      if (movimiento.capturado >= 0) {
        estado.jagua &= ~(1 << movimiento.capturado);
        estado.capturas++;
      }
    } else {
      estado.jagua = (estado.jagua & ~(1 << movimiento.desde)) | (1 << movimiento.hasta);
    }
    estado.turno = 1 - estado.turno;
    return previo;
  }

  function deshacerRapido(estado, previo) {
    estado.jaguarete = previo.jaguarete;
    estado.jagua = previo.jagua;
    estado.capturas = previo.capturas;
    estado.turno = 1 - estado.turno;
  }

  function registrarRepeticion(estado) {
    const clave = clavePosicion(estado);
    estado.repeticiones.set(clave, (estado.repeticiones.get(clave) || 0) + 1);
  }

  /* --- Cerco imposible ------------------------------------------------------
     Los jagua nunca retroceden. Si el Jaguarete cruza su línea y se instala en
     la zona que ellos ya han dejado atrás, no existe ninguna secuencia de
     jugadas que permita encerrarlo: la partida está muerta.

     La comprobación es exacta y conservadora. Primero se calcula qué nodos
     podría llegar a pisar algún jagua en algún momento futuro, recorriendo el
     grafo sólo con movimientos de avance y laterales e ignorando el bloqueo
     entre ellos. El resto de nodos quedará vacío para siempre. Si el Jaguarete
     está en uno de esos nodos y tiene al lado otro igual, puede moverse entre
     ambos indefinidamente y ningún jagua podrá acercarse: el cerco es
     imposible.
     -------------------------------------------------------------------------- */

  function regionJaguarete(estado) {
    const visto = new Uint8Array(NUM_NODOS);
    const pila = [estado.jaguarete];
    visto[estado.jaguarete] = 1;
    while (pila.length > 0) {
      const nodo = pila.pop();
      for (const vecino of ADJ[nodo]) {
        if (!visto[vecino] && !hayJagua(estado, vecino)) { visto[vecino] = 1; pila.push(vecino); }
      }
    }
    return visto;
  }

  /* Nodos que ningún jagua podrá ocupar nunca. */
  function nodosInalcanzables(estado) {
    const alcanzable = new Uint8Array(NUM_NODOS);
    const pila = [];
    for (let nodo = 0; nodo < NUM_NODOS; nodo++) {
      if (hayJagua(estado, nodo)) { alcanzable[nodo] = 1; pila.push(nodo); }
    }
    while (pila.length > 0) {
      const nodo = pila.pop();
      for (const destino of MOVS_JAGUA[nodo]) {
        if (!alcanzable[destino]) { alcanzable[destino] = 1; pila.push(destino); }
      }
    }
    return alcanzable;
  }

  function cercoImposible(estado) {
    const alcanzable = nodosInalcanzables(estado);
    if (alcanzable[estado.jaguarete]) return false;
    return ADJ[estado.jaguarete].some((vecino) => !alcanzable[vecino]);
  }

  /* --- Resultado ------------------------------------------------------------
     Devuelve null si la partida continúa, o {ganador, motivo}. El ganador es
     JAGUARETE, JAGUAKUERA o null en caso de tablas.

     El encierro sólo se declara en el turno del Jaguarete: si le toca a los jagua
     y el Jaguarete está momentáneamente inmóvil, la jugada de los jagua todavía
     puede liberarlo, de modo que la partida no ha terminado.
     -------------------------------------------------------------------------- */

  function resultado(estado) {
    if (estado.capturas >= CAPTURAS_PARA_GANAR) {
      return { ganador: JAGUARETE, motivo: 'capturas' };
    }
    if (estado.repeticiones && (estado.repeticiones.get(clavePosicion(estado)) || 0) >= 3) {
      return { ganador: null, motivo: 'repeticion' };
    }
    if (estado.turno === JAGUARETE && movimientosJaguarete(estado).length === 0) {
      return { ganador: JAGUAKUERA, motivo: 'encierro' };
    }
    if (REGLA_FUGA && cercoImposible(estado)) {
      return { ganador: JAGUARETE, motivo: 'fuga' };
    }
    return null;
  }

  /* Indica si el bando en turno debe pasar: sólo aplica a Jaguakuéra sin
     movimientos, con la partida aún viva. */
  function debePasar(estado) {
    return estado.turno === JAGUAKUERA
      && resultado(estado) === null
      && movimientosJaguakuera(estado).length === 0;
  }

  /* --- Utilidades ----------------------------------------------------------- */

  function contarJagua(estado) {
    let n = 0, m = estado.jagua;
    while (m !== 0) { m &= m - 1; n++; }
    return n;
  }

  function nodosConJagua(estado) {
    const nodos = [];
    for (let nodo = 0; nodo < NUM_NODOS; nodo++) if (hayJagua(estado, nodo)) nodos.push(nodo);
    return nodos;
  }

  const Motor = {
    REGLA_FUGA, cercoImposible, regionJaguarete,
    JAGUARETE, JAGUAKUERA, NUM_NODOS, COORDS, NOMBRES, ADJ, SALTOS, NIVEL,
    MOVS_JAGUA, ES_ADYACENTE, CAPTURAS_PARA_GANAR, TOTAL_JAGUA, N_VERTICE,
    crearEstado, clonarEstado, hayJagua, estaOcupado, clavePosicion,
    movimientosJaguarete, movimientosJaguakuera, movimientosLegales, esMovimientoLegal,
    aplicarMovimiento, aplicarRapido, deshacerRapido, pasarTurno, resultado, debePasar,
    contarJagua, nodosConJagua,
  };

  raiz.Motor = Motor;
  if (typeof module !== 'undefined' && module.exports) module.exports = Motor;
})(typeof window !== 'undefined' ? window : globalThis);
