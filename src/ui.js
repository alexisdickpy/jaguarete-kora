/* =============================================================================
   Jaguarete Kora — Controlador de la interfaz
   -----------------------------------------------------------------------------
   Une el motor de reglas, la IA, la capa visual, el sonido y las métricas. No
   contiene ninguna regla del juego: todo lo que decide qué es legal vive en el
   motor, y la orientación del tablero es sólo una transformación de dibujo.
   ========================================================================== */

(function () {
  'use strict';

  const raiz = document.getElementById('jaguarete-kora');
  if (!raiz) return;

  const CLAVE_PARTIDA = 'jk.partida';

  /* --- Estado de la aplicación -------------------------------------------- */

  const app = {
    pantalla: 'inicio',
    partida: null,
    bandoHumano: Motor.JAGUARETE,
    dificultad: 'medio',
    seleccion: -1,
    destinos: [],
    ultimaJugada: null,
    pensando: false,
    inicioPartida: 0,
    finalizada: false,
    capas: null,
    piezas: new Map(),   // nodo -> elemento SVG de un jagua
    jaguarete: null,     // elemento SVG del jaguarete
  };

  const rotado = () => app.bandoHumano === Motor.JAGUAKUERA;

  /* --- Referencias del documento ------------------------------------------ */

  const el = (id) => raiz.querySelector('#' + id);
  const svg = el('jk-tablero');
  const dom = {
    inicio: el('jk-inicio'),
    juego: el('jk-juego'),
    estado: el('jk-estado'),
    marcador: el('jk-marcador'),
    capturas: el('jk-capturas'),
    restantes: el('jk-restantes'),
    turno: el('jk-turno'),
    fin: el('jk-fin'),
    finTitulo: el('jk-fin-titulo'),
    finTexto: el('jk-fin-texto'),
    silencio: el('jk-silencio'),
    pie: el('jk-pie'),
    dialogo: el('jk-dialogo'),
    dialogoTitulo: el('jk-dialogo-titulo'),
    dialogoCuerpo: el('jk-dialogo-cuerpo'),
  };

  /* --- Textos -------------------------------------------------------------
     Centralizados para que añadir otro idioma no exija tocar la lógica.
     ------------------------------------------------------------------------ */

  const T = {
    turnoJaguarete: 'Turno del Jaguarete',
    turnoJaguakuera: 'Turno de los Jaguakuéra',
    turnoTuyo: 'Es tu turno',
    pensando: 'La máquina está pensando…',
    pase: 'Los Jaguakuéra no tienen movimiento: pasan turno',
    ganasteCapturas: 'El Jaguarete ha capturado ocho jaguakuéra: ya no es posible encerrarlo',
    ganasteEncierro: 'El Jaguarete se ha quedado sin ningún movimiento legal',
    ganasteFuga: 'El Jaguarete ha cruzado la línea de los jaguakuéra. Como no pueden retroceder, ya nunca podrán cercarlo',
    tablas: 'Tablas por repetición de la posición',
    victoria: '¡Victoria!',
    derrota: 'Derrota',
    empate: 'Tablas',
  };

  /* ======================================================================
     Pantallas
     ====================================================================== */

  function mostrarPantalla(nombre) {
    app.pantalla = nombre;
    dom.inicio.hidden = nombre !== 'inicio';
    dom.juego.hidden = nombre !== 'juego';
    dom.pie.hidden = nombre !== 'inicio';
    /* Durante la partida el marco se ciñe al panel y al tablero, en vez de
       ocupar todo el ancho: si no, queda un cuerpo oscuro enorme alrededor de
       un tablero pequeño. */
    raiz.classList.toggle('jk-en-partida', nombre === 'juego');
  }

  function nuevaPartida(bando, dificultad) {
    app.bandoHumano = bando;
    app.dificultad = dificultad;
    app.partida = Motor.crearEstado();
    app.seleccion = -1;
    app.destinos = [];
    app.ultimaJugada = null;
    app.finalizada = false;
    app.inicioPartida = Date.now();

    ajustarTablero();
    mostrarPantalla('juego');
    construir();
    Metricas.partidaIniciada(bando === Motor.JAGUARETE ? 'jaguarete' : 'jaguakuera', dificultad);
    guardarPartida();
    continuar();
  }

  /* ======================================================================
     Construcción y pintado del tablero
     ====================================================================== */

  function construir() {
    app.capas = Vista.construirTablero(svg, rotado());
    app.piezas.clear();

    app.jaguarete = Vista.crearJaguarete();
    Vista.colocar(app.jaguarete, app.partida.jaguarete, rotado());
    app.capas.piezas.appendChild(app.jaguarete);

    for (const nodo of Motor.nodosConJagua(app.partida)) {
      const pieza = Vista.crearJagua();
      Vista.colocar(pieza, nodo, rotado());
      app.capas.piezas.appendChild(pieza);
      app.piezas.set(nodo, pieza);
    }
    pintar();
  }

  /* Sincroniza posiciones y marcas sin reconstruir el SVG, para que las
     transiciones CSS animen el desplazamiento de las piezas. */
  function pintar() {
    const estado = app.partida;

    Vista.colocar(app.jaguarete, estado.jaguarete, rotado());
    app.jaguarete.classList.toggle('jk-seleccionada', app.seleccion === estado.jaguarete);

    for (const [nodo, pieza] of app.piezas) {
      Vista.colocar(pieza, nodo, rotado());
      pieza.classList.toggle('jk-seleccionada', app.seleccion === nodo);
    }

    pintarMarcas();
    pintarUltimaJugada();
    actualizarPanel();
  }

  function pintarMarcas() {
    app.capas.marcas.innerHTML = '';
    for (const movimiento of app.destinos) {
      const p = Vista.puntoDeNodo(movimiento.hasta, rotado());
      if (movimiento.capturado >= 0) {
        /* Destino de captura: anillo dorado, distinto en forma y no sólo en
           color, más una cruz sobre el jagua que se comería. */
        app.capas.marcas.appendChild(Vista.crear('circle', {
          cx: p.x, cy: p.y, r: 26, class: 'jk-marca jk-marca-captura',
        }));
        const c = Vista.puntoDeNodo(movimiento.capturado, rotado());
        app.capas.marcas.appendChild(Vista.crear('path', {
          d: `M${c.x - 13} ${c.y - 13} L${c.x + 13} ${c.y + 13} M${c.x + 13} ${c.y - 13} L${c.x - 13} ${c.y + 13}`,
          class: 'jk-marca jk-marca-presa',
        }));
      } else {
        app.capas.marcas.appendChild(Vista.crear('circle', {
          cx: p.x, cy: p.y, r: 12, class: 'jk-marca jk-marca-libre',
        }));
      }
    }
  }

  function pintarUltimaJugada() {
    app.capas.ultimo.innerHTML = '';
    if (!app.ultimaJugada || app.ultimaJugada.pase) return;
    for (const nodo of [app.ultimaJugada.desde, app.ultimaJugada.hasta]) {
      const p = Vista.puntoDeNodo(nodo, rotado());
      app.capas.ultimo.appendChild(Vista.crear('circle', {
        cx: p.x, cy: p.y, r: 34, class: 'jk-ultimo',
      }));
    }
  }

  function actualizarPanel() {
    const estado = app.partida;
    dom.capturas.textContent = estado.capturas;
    dom.restantes.textContent = Motor.contarJagua(estado);

    const esHumano = estado.turno === app.bandoHumano;
    dom.turno.className = 'jk-turno ' + (estado.turno === Motor.JAGUARETE ? 'jk-turno-jaguarete' : 'jk-turno-jaguakuera');
    dom.turno.textContent = estado.turno === Motor.JAGUARETE ? T.turnoJaguarete : T.turnoJaguakuera;

    if (!app.finalizada) {
      anunciar(app.pensando ? T.pensando : esHumano ? T.turnoTuyo : T.pensando);
    }
  }

  function anunciar(texto) {
    if (dom.estado.textContent !== texto) dom.estado.textContent = texto;
  }

  /* ======================================================================
     Interacción del jugador
     ====================================================================== */

  svg.addEventListener('pointerdown', (evento) => {
    const zona = evento.target.closest('.jk-toque');
    if (!zona) return;
    /* Evita que el gesto sobre el tablero arrastre o desplace la página del
       sitio anfitrión mientras se juega. */
    evento.preventDefault();
    Sonido.despertar();
    manejarToque(Number(zona.dataset.nodo));
  });

  function manejarToque(nodo) {
    if (app.finalizada || app.pensando) return;
    const estado = app.partida;
    if (estado.turno !== app.bandoHumano) return;

    const movimiento = app.destinos.find((m) => m.hasta === nodo);
    if (movimiento) {
      ejecutar(movimiento);
      return;
    }

    const legales = Motor.movimientosLegales(estado);
    const desdeNodo = legales.filter((m) => m.desde === nodo);

    if (desdeNodo.length > 0) {
      app.seleccion = nodo;
      app.destinos = desdeNodo;
      Sonido.seleccionar();
      pintar();
      return;
    }

    if (app.seleccion >= 0) {
      /* Toque sobre un nodo que no es destino legal de la pieza elegida. */
      Sonido.ilegal();
      destello(nodo);
    }
    app.seleccion = -1;
    app.destinos = [];
    pintar();
  }

  function destello(nodo) {
    const p = Vista.puntoDeNodo(nodo, rotado());
    const marca = Vista.crear('circle', { cx: p.x, cy: p.y, r: 30, class: 'jk-ilegal' });
    app.capas.marcas.appendChild(marca);
    setTimeout(() => marca.remove(), 420);
  }

  function ejecutar(movimiento) {
    const estado = app.partida;
    app.seleccion = -1;
    app.destinos = [];
    app.ultimaJugada = movimiento;

    if (estado.turno === Motor.JAGUAKUERA) {
      const pieza = app.piezas.get(movimiento.desde);
      app.piezas.delete(movimiento.desde);
      app.piezas.set(movimiento.hasta, pieza);
    }

    if (movimiento.capturado >= 0) {
      const capturada = app.piezas.get(movimiento.capturado);
      app.piezas.delete(movimiento.capturado);
      if (capturada) {
        capturada.classList.add('jk-capturada');
        setTimeout(() => capturada.remove(), 380);
      }
      Sonido.capturar();
    } else {
      Sonido.mover();
    }

    Motor.aplicarMovimiento(estado, movimiento);
    pintar();
    guardarPartida();
    continuar();
  }

  /* ======================================================================
     Flujo de turnos
     ====================================================================== */

  function continuar() {
    const estado = app.partida;

    const fin = Motor.resultado(estado);
    if (fin) { terminar(fin); return; }

    if (Motor.debePasar(estado)) {
      anunciar(T.pase);
      setTimeout(() => {
        Motor.pasarTurno(estado);
        app.ultimaJugada = { pase: true };
        pintar();
        continuar();
      }, 900);
      return;
    }

    if (estado.turno === app.bandoHumano) {
      app.pensando = false;
      actualizarPanel();
      return;
    }

    app.pensando = true;
    actualizarPanel();
    /* La búsqueda es síncrona: se cede un fotograma para que la interfaz
       pinte el estado «pensando» antes de bloquear el hilo. */
    setTimeout(() => {
      const jugada = IA.elegirMovimiento(estado, app.dificultad);
      app.pensando = false;
      if (!jugada) { continuar(); return; }
      ejecutar(jugada);
    }, 260);
  }

  function terminar(fin) {
    app.finalizada = true;
    app.pensando = false;
    app.seleccion = -1;
    app.destinos = [];
    pintar();
    limpiarPartidaGuardada();

    const gano = fin.ganador === app.bandoHumano;
    const motivos = {
      capturas: T.ganasteCapturas,
      encierro: T.ganasteEncierro,
      fuga: T.ganasteFuga,
      repeticion: T.tablas,
    };

    dom.finTitulo.textContent = fin.ganador === null ? T.empate : gano ? T.victoria : T.derrota;
    dom.finTexto.textContent = motivos[fin.motivo] || '';
    dom.fin.hidden = false;
    dom.fin.classList.add('jk-visible');
    anunciar(dom.finTitulo.textContent + '. ' + dom.finTexto.textContent);

    if (fin.ganador === null) Sonido.tablas();
    else if (gano) Sonido.victoria();
    else Sonido.derrota();

    Metricas.partidaTerminada({
      bando: app.bandoHumano === Motor.JAGUARETE ? 'jaguarete' : 'jaguakuera',
      dificultad: app.dificultad,
      resultado: fin.ganador === null ? 'tablas' : gano ? 'victoria' : 'derrota',
      ganador: fin.ganador === null ? 'ninguno' : fin.ganador === Motor.JAGUARETE ? 'jaguarete' : 'jaguakuera',
      motivo: fin.motivo,
      jugadas: app.partida.historial.length,
      capturas: app.partida.capturas,
      segundos: Math.round((Date.now() - app.inicioPartida) / 1000),
    });
  }

  /* ======================================================================
     Persistencia de la partida en curso
     ====================================================================== */

  function guardarPartida() {
    if (!app.partida || app.finalizada) return;
    try {
      localStorage.setItem(CLAVE_PARTIDA, JSON.stringify({
        jaguarete: app.partida.jaguarete,
        jagua: app.partida.jagua,
        turno: app.partida.turno,
        capturas: app.partida.capturas,
        repeticiones: Array.from(app.partida.repeticiones.entries()),
        jugadas: app.partida.historial.length,
        bando: app.bandoHumano,
        dificultad: app.dificultad,
        inicio: app.inicioPartida,
      }));
    } catch (e) {
      /* Sin almacenamiento la partida simplemente no se puede retomar. */
    }
  }

  function leerPartidaGuardada() {
    try {
      const bruto = localStorage.getItem(CLAVE_PARTIDA);
      return bruto ? JSON.parse(bruto) : null;
    } catch (e) {
      return null;
    }
  }

  function limpiarPartidaGuardada() {
    try { localStorage.removeItem(CLAVE_PARTIDA); } catch (e) { /* nada que hacer */ }
  }

  function retomar(guardada) {
    app.bandoHumano = guardada.bando;
    app.dificultad = guardada.dificultad;
    app.partida = Motor.crearEstado();
    app.partida.jaguarete = guardada.jaguarete;
    app.partida.jagua = guardada.jagua;
    app.partida.turno = guardada.turno;
    app.partida.capturas = guardada.capturas;
    app.partida.repeticiones = new Map(guardada.repeticiones || []);
    app.partida.historial = new Array(guardada.jugadas || 0).fill({ desde: -1, hasta: -1, capturado: -1 });
    app.seleccion = -1;
    app.destinos = [];
    app.ultimaJugada = null;
    app.finalizada = false;
    app.inicioPartida = guardada.inicio || Date.now();

    ajustarTablero();
    mostrarPantalla('juego');
    construir();
    /* Retomar una partida guardada también cuenta como partida jugada: sin esto,
       quien vuelve a una partida a medias no aparecía en las estadísticas. */
    Metricas.partidaIniciada(
      app.bandoHumano === Motor.JAGUARETE ? 'jaguarete' : 'jaguakuera',
      app.dificultad
    );
    continuar();
  }

  /* Si el visitante cierra con una partida a medias, queda registrado como
     abandono junto con la jugada en la que lo dejó. */
  window.addEventListener('pagehide', () => {
    if (app.partida && !app.finalizada && app.partida.historial.length > 0) {
      Metricas.partidaAbandonada({
        bando: app.bandoHumano === Motor.JAGUARETE ? 'jaguarete' : 'jaguakuera',
        dificultad: app.dificultad,
        jugadas: app.partida.historial.length,
        capturas: app.partida.capturas,
        segundos: Math.round((Date.now() - app.inicioPartida) / 1000),
      });
    }
  });

  /* ======================================================================
     Controles
     ====================================================================== */

  raiz.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-accion]');
    if (!boton) return;
    Sonido.despertar();
    acciones[boton.dataset.accion] && acciones[boton.dataset.accion](boton);
  });

  const acciones = {
    jugar() {
      const bando = raiz.querySelector('input[name="jk-bando"]:checked').value === 'jaguarete'
        ? Motor.JAGUARETE : Motor.JAGUAKUERA;
      const dificultad = raiz.querySelector('input[name="jk-nivel"]:checked').value;
      dom.fin.hidden = true;
      dom.fin.classList.remove('jk-visible');
      nuevaPartida(bando, dificultad);
    },

    revancha() {
      dom.fin.hidden = true;
      dom.fin.classList.remove('jk-visible');
      nuevaPartida(app.bandoHumano, app.dificultad);
    },

    menu() {
      if (app.partida && !app.finalizada && app.partida.historial.length > 0) {
        Metricas.partidaAbandonada({
          bando: app.bandoHumano === Motor.JAGUARETE ? 'jaguarete' : 'jaguakuera',
          dificultad: app.dificultad,
          jugadas: app.partida.historial.length,
          capturas: app.partida.capturas,
          segundos: Math.round((Date.now() - app.inicioPartida) / 1000),
        });
      }
      limpiarPartidaGuardada();
      app.partida = null;
      app.finalizada = false;
      dom.fin.hidden = true;
      dom.fin.classList.remove('jk-visible');
      mostrarPantalla('inicio');
    },

    silencio() {
      const ahoraSilenciado = Sonido.alternarSilencio();
      dom.silencio.setAttribute('aria-pressed', String(ahoraSilenciado));
      dom.silencio.querySelector('.jk-silencio-texto').textContent = ahoraSilenciado ? 'Sonido apagado' : 'Sonido activado';
      dom.silencio.classList.toggle('jk-mudo', ahoraSilenciado);
    },

    dialogo(boton) {
      const plantilla = raiz.querySelector('#jk-texto-' + boton.dataset.tema);
      dom.dialogoTitulo.textContent = boton.dataset.titulo;
      dom.dialogoCuerpo.innerHTML = plantilla ? plantilla.innerHTML : '';
      dom.dialogo.hidden = false;
      Metricas.seccionAbierta(boton.dataset.tema);
    },

    cerrarDialogo() { dom.dialogo.hidden = true; },
  };

  raiz.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && !dom.dialogo.hidden) acciones.cerrarDialogo();
  });

  /* ======================================================================
     Arranque
     ====================================================================== */

  /* --- Tamaño del tablero ---------------------------------------------------
     El juego se publica dentro de un iframe servido por otro dominio, de modo
     que no puede conocer la altura real de la ventana del visitante: dentro del
     iframe, 100vh es la altura del propio iframe, que a su vez la fija el
     anfitrión según el alto del contenido. Usar esa medida provocaría un bucle
     de crecimiento.

     Lo que sí es visible desde el iframe, y además es estable, es el tamaño de
     la pantalla. A partir de él se estima cuánta altura suele quedar libre una
     vez descontados el navegador, la cabecera del sitio y la barra de la
     partida, y de ahí sale el ancho máximo del tablero, cuya proporción es fija
     (el ancho es 0,725 veces la altura).
     ------------------------------------------------------------------------ */

  const PROPORCION_TABLERO = Vista.ANCHO / Vista.ALTO;
  const ANCHO_MINIMO = 240;
  const ANCHO_MAXIMO = 620;

  /* Altura que hay que descontar de la pantalla: el navegador y la cabecera
     fija del sitio, más lo poco que ocupa la interfaz del juego alrededor del
     tablero. Se midió sobre la página publicada: la cabecera son 72 píxeles y
     el navegador ronda los 60, no los 200 que se suponían al principio. */
  const RESERVA_PANEL_AL_LADO = 130;
  const RESERVA_PANEL_ARRIBA = 360;

  /* Suelo de altura en escritorio: si el bloque es ancho, el visitante está en
     un ordenador y conviene no encoger el tablero por una lectura conservadora
     del tamaño de pantalla. */
  const ALTO_MINIMO_ESCRITORIO = 470;

  /* Altura que ocupa la interfaz de la partida además del tablero. Se mide sobre
     el documento real, mostrando la sección un instante sin pintarla, porque
     depende de cuántas filas ocupe el panel a ese ancho. */
  function alturaAlrededorDelTablero(alLado) {
    const estabaOculta = dom.juego.hidden;
    dom.juego.hidden = false;
    dom.juego.style.visibility = 'hidden';

    const estilos = getComputedStyle(dom.juego);
    let extra = parseFloat(estilos.paddingTop) + parseFloat(estilos.paddingBottom);
    if (!alLado) {
      const barra = dom.juego.querySelector('.jk-barra').getBoundingClientRect().height;
      extra += barra + parseFloat(estilos.rowGap || 0);
    }

    dom.juego.style.visibility = '';
    dom.juego.hidden = estabaOculta;
    return extra;
  }

  function ajustarTablero() {
    const alLado = window.innerWidth >= 700;
    /* Hueco real para el tablero: el ancho del bloque menos el panel lateral,
       cuando lo hay, y menos los márgenes interiores. */
    const anchoHueco = (raiz.clientWidth || window.innerWidth) - (alLado ? 250 : 16);

    const pantalla = (window.screen && (screen.availHeight || screen.height)) || 800;
    let ancho = anchoHueco;

    if (!alLado) {
      /* En móvil manda el ancho, pero con tope: sin él, el bloque crece hasta
         salirse de la pantalla y hay que desplazarse para ver el tablero. */
      ancho = Math.min(anchoHueco, (pantalla - RESERVA_PANEL_ARRIBA) * PROPORCION_TABLERO);
    } else {
      /* En escritorio manda la altura, porque el tablero es apaisado hacia
         abajo. Se estima desde el tamaño de pantalla, con un suelo generoso:
         más vale que el bloque quede unos píxeles largo a que el tablero salga
         diminuto por una lectura conservadora. */
      const alturaUtil = Math.max(pantalla - 220, 545);
      ancho = Math.min(alturaUtil * PROPORCION_TABLERO, anchoHueco);
    }

    ancho = Math.round(Math.min(ANCHO_MAXIMO, Math.max(ANCHO_MINIMO, ancho)));
    raiz.style.setProperty('--jk-tablero-max', ancho + 'px');

    /* El marco mide siempre lo mismo en las dos pantallas: si la caja cambiara
       de tamaño al pulsar «Jugar», el salto se nota y descoloca la página. */
    const alto = Math.ceil(ancho / PROPORCION_TABLERO + alturaAlrededorDelTablero(alLado));
    raiz.style.setProperty('--jk-marco-alto', alto + 'px');
  }

  window.addEventListener('resize', ajustarTablero);
  window.addEventListener('orientationchange', ajustarTablero);
  /* Algunos navegadores todavía no han resuelto el tamaño de pantalla cuando se
     ejecuta el guion, y devuelven cero: se vuelve a medir al terminar la carga. */
  window.addEventListener('load', ajustarTablero);

  function arrancar() {
    ajustarTablero();
    /* Red de seguridad: hay navegadores que tardan un instante en informar del
       tamaño de pantalla, y de ese dato depende el tamaño del tablero. */
    setTimeout(ajustarTablero, 300);
    dom.silencio.setAttribute('aria-pressed', String(Sonido.estaSilenciado()));
    dom.silencio.classList.toggle('jk-mudo', Sonido.estaSilenciado());
    dom.silencio.querySelector('.jk-silencio-texto').textContent =
      Sonido.estaSilenciado() ? 'Sonido apagado' : 'Sonido activado';

    Metricas.sesion();

    const guardada = leerPartidaGuardada();
    const boton = el('jk-continuar');
    if (guardada && guardada.jugadas > 0) {
      boton.hidden = false;
      boton.addEventListener('click', () => retomar(guardada));
    }
    mostrarPantalla('inicio');
  }

  arrancar();
})();
