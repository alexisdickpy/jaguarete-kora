/* =============================================================================
   Jaguarete Kora — Oponente artificial
   -----------------------------------------------------------------------------
   Búsqueda negamax con poda alfa-beta, profundización iterativa acotada por
   tiempo, tabla de transposición y ordenación de jugadas. El juego tiene un
   espacio de estados pequeño (31 nodos, 16 piezas) y un factor de ramificación
   moderado, de modo que esta aproximación da un rival fuerte sin bibliotecas
   externas y sin bloquear el hilo del navegador más de una fracción de segundo.

   La IA nunca modifica las reglas: sólo elige entre los movimientos que genera
   el motor. Los tres niveles cambian la profundidad y la cantidad de ruido, no
   lo que está permitido.
   ========================================================================== */

(function (raiz) {
  'use strict';


  const VICTORIA = 1000000;

  const NIVELES = {
    facil:   { presupuestoMs: 40,  profundidadMax: 2,  ruido: 90,  azar: 0.45 },
    medio:   { presupuestoMs: 220, profundidadMax: 5,  ruido: 25,  azar: 0.06 },
    dificil: { presupuestoMs: 850, profundidadMax: 14, ruido: 0,   azar: 0 },
  };

  /* --- Evaluación -----------------------------------------------------------
     Puntuación siempre desde el punto de vista del Jaguarete: positiva le
     favorece, negativa favorece a los Jaguakuéra.

     Los factores que deciden este juego son las capturas conseguidas, las
     capturas disponibles, y sobre todo el espacio: los jagua sólo ganan cuando
     logran reducir a cero la región del tablero por la que el Jaguarete puede
     circular. Medir esa región, y no sólo los vecinos libres, es lo que hace
     que los jagua jueguen a cerrar el cerco en vez de limitarse a avanzar.
     -------------------------------------------------------------------------- */

  const PESO_CAPTURA = 1000;
  const PESO_AMENAZA = 120;
  const PESO_MOVILIDAD = 25;
  const PESO_ESPACIO = 45;
  const PESO_AVANCE = 14;

  /* Nodos libres a los que el Jaguarete puede llegar encadenando movimientos
     simples: es su territorio real. Cuando vale cero, está encerrado. */
  function espacio(estado) {
    const visto = new Uint8Array(Motor.NUM_NODOS);
    const pila = [estado.jaguarete];
    visto[estado.jaguarete] = 1;
    let alcanzables = 0;

    while (pila.length > 0) {
      const nodo = pila.pop();
      for (const vecino of Motor.ADJ[nodo]) {
        if (!visto[vecino] && !Motor.hayJagua(estado, vecino)) {
          visto[vecino] = 1;
          alcanzables++;
          pila.push(vecino);
        }
      }
    }
    return alcanzables;
  }

  function evaluar(estado) {
    let amenazas = 0;
    let movilidad = 0;

    for (const [medio, destino] of Motor.SALTOS[estado.jaguarete]) {
      if (Motor.hayJagua(estado, medio) && !Motor.estaOcupado(estado, destino)) amenazas++;
    }
    for (const destino of Motor.ADJ[estado.jaguarete]) {
      if (!Motor.estaOcupado(estado, destino)) movilidad++;
    }

    let avance = 0;
    let restantes = estado.jagua;
    while (restantes !== 0) {
      const nodo = 31 - Math.clz32(restantes & -restantes);
      restantes &= restantes - 1;
      avance += Motor.NIVEL[nodo];
    }

    /* Si el Jaguarete ya no puede ser cercado, la posición está ganada. Se
       comprueba sólo cuando tiene territorio suficiente para que sea posible,
       porque la prueba recorre el grafo dos veces. */
    const territorio = espacio(estado);
    if (Motor.REGLA_FUGA && territorio >= 6 && Motor.cercoImposible(estado)) {
      return VICTORIA / 2 + estado.capturas * PESO_CAPTURA;
    }

    return estado.capturas * PESO_CAPTURA
      + amenazas * PESO_AMENAZA
      + movilidad * PESO_MOVILIDAD
      + territorio * PESO_ESPACIO
      - avance * PESO_AVANCE;
  }

  /* --- Búsqueda ------------------------------------------------------------- */

  function crearContexto(presupuestoMs) {
    return {
      tabla: new Map(),
      limite: (typeof performance !== 'undefined' ? performance.now() : Date.now()) + presupuestoMs,
      agotado: false,
      nodos: 0,
    };
  }

  function tiempoAgotado(ctx) {
    if (ctx.agotado) return true;
    if ((ctx.nodos & 511) === 0) {
      const ahora = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (ahora >= ctx.limite) ctx.agotado = true;
    }
    return ctx.agotado;
  }

  function ordenar(movimientos, mejorPrevio) {
    return movimientos.sort((a, b) => prioridad(b, mejorPrevio) - prioridad(a, mejorPrevio));
  }

  function prioridad(movimiento, mejorPrevio) {
    if (mejorPrevio && movimiento.desde === mejorPrevio.desde && movimiento.hasta === mejorPrevio.hasta) {
      return 1000;
    }
    return movimiento.capturado >= 0 ? 100 : 0;
  }

  /* Negamax con poda alfa-beta. Devuelve la puntuación desde el punto de vista
     del bando al que le toca mover. */
  function negamax(estado, profundidad, alfa, beta, ctx, extensiones) {
    ctx.nodos++;
    const signo = estado.turno === Motor.JAGUARETE ? 1 : -1;

    if (estado.capturas >= Motor.CAPTURAS_PARA_GANAR) {
      return signo * (VICTORIA - (20 - profundidad));
    }

    const clave = Motor.clavePosicion(estado);
    const guardado = ctx.tabla.get(clave);
    if (guardado && guardado.profundidad >= profundidad) {
      if (guardado.bandera === 0) return guardado.valor;
      if (guardado.bandera === 1 && guardado.valor > alfa) alfa = guardado.valor;
      if (guardado.bandera === 2 && guardado.valor < beta) beta = guardado.valor;
      if (alfa >= beta) return guardado.valor;
    }

    const movimientos = Motor.movimientosLegales(estado);

    if (movimientos.length === 0) {
      if (estado.turno === Motor.JAGUARETE) {
        return -(VICTORIA - (20 - profundidad)); // encerrado: pierde el Jaguarete
      }
      // Los jagua sin movimiento pasan turno; se explora la posición resultante.
      const previo = Motor.aplicarRapido(estado, { pase: true });
      const valor = -negamax(estado, profundidad - 1, -beta, -alfa, ctx, extensiones);
      Motor.deshacerRapido(estado, previo);
      return valor;
    }

    if (profundidad <= 0 || tiempoAgotado(ctx)) return signo * evaluar(estado);

    const alfaOriginal = alfa;
    let mejorValor = -Infinity;
    let mejorMovimiento = null;

    for (const movimiento of ordenar(movimientos, guardado && guardado.movimiento)) {
      /* Una captura cambia el material: se extiende un ply para no cortar la
         búsqueda justo antes de la respuesta del rival. */
      const extension = movimiento.capturado >= 0 && extensiones > 0 ? 1 : 0;

      const previo = Motor.aplicarRapido(estado, movimiento);
      const valor = -negamax(
        estado, profundidad - 1 + extension, -beta, -alfa, ctx, extensiones - extension
      );
      Motor.deshacerRapido(estado, previo);

      if (valor > mejorValor) {
        mejorValor = valor;
        mejorMovimiento = movimiento;
      }
      if (mejorValor > alfa) alfa = mejorValor;
      if (alfa >= beta) break;
      if (ctx.agotado) break;
    }

    if (!ctx.agotado) {
      ctx.tabla.set(clave, {
        profundidad,
        valor: mejorValor,
        movimiento: mejorMovimiento,
        bandera: mejorValor <= alfaOriginal ? 2 : mejorValor >= beta ? 1 : 0,
      });
    }
    return mejorValor;
  }

  /* --- Elección de jugada ---------------------------------------------------
     Profundización iterativa: se busca a profundidad creciente hasta agotar el
     presupuesto de tiempo, conservando siempre el mejor resultado completo.
     -------------------------------------------------------------------------- */

  function elegirMovimiento(estadoOriginal, nivel = 'medio', opciones = {}) {
    const config = Object.assign({}, NIVELES[nivel] || NIVELES.medio, opciones);
    const movimientos = Motor.movimientosLegales(estadoOriginal);
    if (movimientos.length === 0) return null;
    if (movimientos.length === 1) return movimientos[0];

    if (config.azar > 0 && Math.random() < config.azar) {
      return movimientos[Math.floor(Math.random() * movimientos.length)];
    }

    /* Estado de trabajo compacto: la búsqueda no necesita historial ni repeticiones. */
    const estado = {
      jaguarete: estadoOriginal.jaguarete,
      jagua: estadoOriginal.jagua,
      turno: estadoOriginal.turno,
      capturas: estadoOriginal.capturas,
    };

    const ctx = crearContexto(config.presupuestoMs);
    const signo = estado.turno === Motor.JAGUARETE ? 1 : -1;
    let mejor = movimientos[0];

    for (let profundidad = 1; profundidad <= config.profundidadMax; profundidad++) {
      let mejorValorRonda = -Infinity;
      let mejorRonda = null;

      for (const movimiento of ordenar(movimientos.slice(), mejor)) {
        const previo = Motor.aplicarRapido(estado, movimiento);
        let valor = -negamax(estado, profundidad - 1, -Infinity, Infinity, ctx, 4);
        Motor.deshacerRapido(estado, previo);

        if (ctx.agotado) break;

        valor += config.ruido ? (Math.random() - 0.5) * config.ruido : 0;
        valor -= penalizacionRepeticion(estadoOriginal, estado, movimiento, signo);

        if (valor > mejorValorRonda) {
          mejorValorRonda = valor;
          mejorRonda = movimiento;
        }
      }

      if (mejorRonda) mejor = mejorRonda;
      if (ctx.agotado) break;
      if (Math.abs(mejorValorRonda) > VICTORIA / 2) break; // final forzado encontrado
    }

    return mejor;
  }

  /* Desincentiva repetir una posición ya vista dos veces cuando el bando que
     mueve no está peor: evita tablas accidentales por lanzadera. */
  function penalizacionRepeticion(estadoOriginal, estadoTrabajo, movimiento, signo) {
    if (!estadoOriginal.repeticiones) return 0;
    const previo = Motor.aplicarRapido(estadoTrabajo, movimiento);
    const vistas = estadoOriginal.repeticiones.get(Motor.clavePosicion(estadoTrabajo)) || 0;
    Motor.deshacerRapido(estadoTrabajo, previo);
    return vistas >= 2 ? 250 : vistas >= 1 ? 40 : 0;
  }

  const IA = { elegirMovimiento, evaluar, NIVELES };

  raiz.IA = IA;
  if (typeof module !== 'undefined' && module.exports) module.exports = IA;
})(typeof window !== 'undefined' ? window : globalThis);
