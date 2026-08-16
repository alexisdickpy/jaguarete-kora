/* =============================================================================
   Jaguarete Kora — Capa visual del tablero
   -----------------------------------------------------------------------------
   Traduce nodos lógicos a coordenadas de dibujo y construye el SVG. La
   orientación es exclusivamente una transformación de coordenadas: la identidad
   de los nodos, las aristas y las reglas son siempre las mismas (PRD §11).

   El tablero es un retículo regular de 5 columnas por 7 filas, de modo que
   rotarlo 180 grados es reflejar el punto respecto del centro del lienzo.
   ========================================================================== */

(function (raiz) {
  'use strict';


  const PASO = 100;
  /* El margen es el mínimo que permite encajar las etiquetas de coordenadas sin
     que lleguen a tocar las fichas de las filas y columnas exteriores. Cada
     unidad que se le quita es superficie que gana el tablero dibujado. */
  const MARGEN = 72;
  const ANCHO = 4 * PASO + 2 * MARGEN;   // 544
  const ALTO = 6 * PASO + 2 * MARGEN;    // 744

  /* Fichas grandes respecto al paso del retículo: ocupan dos tercios de la
     distancia entre intersecciones, que es lo que las hace legibles cuando el
     tablero se ve pequeño en una pantalla de ordenador. */
  const RADIO_NODO = 7;
  const RADIO_JAGUA = 34;
  const RADIO_JAGUARETE = 43;

  function puntoDeNodo(nodo, rotado) {
    const [col, fila] = Motor.COORDS[nodo];
    const x = MARGEN + col * PASO;
    const y = MARGEN + fila * PASO;
    return rotado ? { x: ANCHO - x, y: ALTO - y } : { x, y };
  }

  /* Nodo cuyo punto de dibujo está más cerca de unas coordenadas del lienzo.
     Devuelve -1 si el toque cae lejos de cualquier nodo. */
  function nodoMasCercano(x, y, rotado, tolerancia = PASO * 0.55) {
    let mejor = -1;
    let mejorDistancia = Infinity;
    for (let nodo = 0; nodo < Motor.NUM_NODOS; nodo++) {
      const p = puntoDeNodo(nodo, rotado);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < mejorDistancia) { mejorDistancia = d; mejor = nodo; }
    }
    return mejorDistancia <= tolerancia ? mejor : -1;
  }

  /* --- Construcción del SVG ------------------------------------------------- */

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function crear(etiqueta, atributos = {}) {
    const el = document.createElementNS(SVG_NS, etiqueta);
    for (const [clave, valor] of Object.entries(atributos)) el.setAttribute(clave, valor);
    return el;
  }

  /* Lista de aristas únicas del grafo, para dibujar cada línea una sola vez. */
  const ARISTAS = (() => {
    const lista = [];
    Motor.ADJ.forEach((vecinos, a) => vecinos.forEach((b) => { if (a < b) lista.push([a, b]); }));
    return lista;
  })();

  function construirTablero(svg, rotado) {
    svg.setAttribute('viewBox', `0 0 ${ANCHO} ${ALTO}`);
    svg.innerHTML = '';

    svg.appendChild(definiciones());

    const madera = crear('rect', {
      x: 8, y: 8, width: ANCHO - 16, height: ALTO - 16,
      rx: 26, fill: 'url(#jk-madera)', class: 'jk-tabla',
    });
    svg.appendChild(madera);

    /* Contorno de la kora: refuerza visualmente el corral del jaguarete. */
    const kora = crear('path', { d: contornoKora(rotado), class: 'jk-kora-area' });
    svg.appendChild(kora);

    const capaLineas = crear('g', { class: 'jk-lineas' });
    for (const [a, b] of ARISTAS) {
      const pa = puntoDeNodo(a, rotado);
      const pb = puntoDeNodo(b, rotado);
      capaLineas.appendChild(crear('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y }));
    }
    svg.appendChild(capaLineas);

    const capaNodos = crear('g', { class: 'jk-nodos' });
    for (let nodo = 0; nodo < Motor.NUM_NODOS; nodo++) {
      const p = puntoDeNodo(nodo, rotado);
      capaNodos.appendChild(crear('circle', { cx: p.x, cy: p.y, r: RADIO_NODO }));
    }
    svg.appendChild(capaNodos);

    const capaCoordenadas = crear('g', { class: 'jk-coordenadas' });
    dibujarCoordenadas(capaCoordenadas, rotado);
    svg.appendChild(capaCoordenadas);

    /* Capas de estado, en orden de apilamiento. */
    const capas = {};
    for (const nombre of ['ultimo', 'marcas', 'piezas', 'toques']) {
      capas[nombre] = crear('g', { class: 'jk-capa-' + nombre });
      svg.appendChild(capas[nombre]);
    }

    /* Zonas de toque: círculos invisibles y generosos sobre cada nodo, para que
       la interacción táctil sea cómoda sin agrandar el dibujo (PRD §16). */
    for (let nodo = 0; nodo < Motor.NUM_NODOS; nodo++) {
      const p = puntoDeNodo(nodo, rotado);
      const zona = crear('circle', {
        cx: p.x, cy: p.y, r: PASO * 0.46, class: 'jk-toque', 'data-nodo': nodo,
      });
      capas.toques.appendChild(zona);
    }

    return capas;
  }


  /* --- Coordenadas ----------------------------------------------------------
     Letras para las columnas, números para las filas y K1..K6 para los nodos
     del kora, igual que en la lámina de referencia. Cada etiqueta se dibuja
     junto a su propio nodo, de modo que al invertir el tablero acompaña a la
     pieza y nunca se despega de la casilla que nombra.
     -------------------------------------------------------------------------- */

  const LETRAS = ['A', 'B', 'C', 'D', 'E'];

  /* Desplazamiento de cada etiqueta del kora respecto de su nodo, hacia fuera. */
  const DESVIO_KORA = {
    25: [-36, -21], 26: [-30, 28], 27: [36, -21],
    28: [-42, 0], 29: [0, 53], 30: [42, 0],
  };

  function etiqueta(contenido, x, y, tamano) {
    const t = crear('text', { x, y, class: 'jk-etiqueta', 'font-size': tamano });
    t.textContent = contenido;
    return t;
  }

  function dibujarCoordenadas(capa, rotado) {
    const fuera = rotado ? 1 : -1;

    for (let col = 0; col < 5; col++) {
      const p = puntoDeNodo(col, rotado);
      capa.appendChild(etiqueta(LETRAS[col], p.x, p.y + fuera * 47, 23));
    }
    for (let fila = 0; fila < 5; fila++) {
      const p = puntoDeNodo(fila * 5, rotado);
      capa.appendChild(etiqueta(String(5 - fila), p.x + fuera * 47, p.y, 23));
    }
    /* Los desvíos del kora ya están escritos hacia fuera para el tablero sin
       invertir, así que aquí el signo es el contrario al de filas y columnas. */
    for (const nodo of Object.keys(DESVIO_KORA)) {
      const p = puntoDeNodo(Number(nodo), rotado);
      const [dx, dy] = DESVIO_KORA[nodo];
      capa.appendChild(etiqueta(Motor.NOMBRES[nodo], p.x - fuera * dx, p.y - fuera * dy, 19));
    }
  }

  function contornoKora(rotado) {
    const puntos = [22, 28, 30].map((n) => puntoDeNodo(n, rotado));
    const centro = puntoDeNodo(Motor.N_VERTICE, rotado);
    const expandir = (p, f) => ({ x: centro.x + (p.x - centro.x) * f, y: centro.y + (p.y - centro.y) * f });
    const [a, b, c] = puntos.map((p) => expandir(p, 1.16));
    return `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y} Z`;
  }

  function definiciones() {
    const defs = crear('defs');
    defs.innerHTML = `
      <linearGradient id="jk-madera" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stop-color="#c08a4e"/>
        <stop offset="45%" stop-color="#a9713b"/>
        <stop offset="100%" stop-color="#8b5a2e"/>
      </linearGradient>
      <radialGradient id="jk-piel" cx="0.35" cy="0.3" r="0.85">
        <stop offset="0%" stop-color="#f2c14e"/>
        <stop offset="60%" stop-color="#d99a25"/>
        <stop offset="100%" stop-color="#a56a12"/>
      </radialGradient>
      <radialGradient id="jk-azul" cx="0.34" cy="0.28" r="0.92">
        <stop offset="0%" stop-color="#9cc2e8"/>
        <stop offset="50%" stop-color="#4a78ad"/>
        <stop offset="100%" stop-color="#22436a"/>
      </radialGradient>
      <filter id="jk-sombra" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#2a1607" flood-opacity="0.45"/>
      </filter>`;
    return defs;
  }

  /* --- Piezas ---------------------------------------------------------------
     Dos discos con volumen, siguiendo la lámina de referencia del proyecto: los
     jaguakuéra son azules con la cara clara, orejas grandes de interior oscuro y
     hocico alargado; el Jaguarete es ámbar con el rostro del felino en actitud
     de fiera. No se distinguen sólo por el color: el Jaguarete es un tercio más
     grande y los dos dibujos son completamente distintos (PRD §14).
     -------------------------------------------------------------------------- */

  /* Brillo especular: da la sensación de ficha con volumen, no de círculo plano. */
  function brillo(radio) {
    return `<ellipse cx="${-radio * 0.28}" cy="${-radio * 0.42}"
              rx="${radio * 0.42}" ry="${radio * 0.26}"
              fill="#ffffff" opacity="0.22" transform="rotate(-24)"/>`;
  }

  function crearJagua() {
    const g = crear('g', { class: 'jk-pieza jk-jagua', filter: 'url(#jk-sombra)' });
    g.innerHTML = `
      <circle r="${RADIO_JAGUA}" fill="url(#jk-azul)"/>
      <circle r="${RADIO_JAGUA}" fill="none" stroke="#12283f" stroke-width="2"/>
      <circle r="${RADIO_JAGUA - 3}" fill="none" stroke="#bcd8f2" stroke-width="1" opacity="0.22"/>
      ${brillo(RADIO_JAGUA)}

      <g fill="#e3effc">
        <path d="M-15-10 L-14-25 L-2.5-12.5 Z"/>
        <path d="M15-10 L14-25 L2.5-12.5 Z"/>
        <path d="M-13-11 C-13-16.5 -6.5-19 0-19 C6.5-19 13-16.5 13-11
                 C13-3 10 8 5.5 13.5 C3.5 16 -3.5 16 -5.5 13.5 C-10 8 -13-3 -13-11 Z"/>
      </g>
      <g fill="#1b3a5e">
        <path d="M-13.4-12 L-12.6-22 L-5 -13.4 Z"/>
        <path d="M13.4-12 L12.6-22 L5 -13.4 Z"/>
        <circle cx="-6" cy="-4.5" r="2"/>
        <circle cx="6" cy="-4.5" r="2"/>
        <ellipse cx="0" cy="6.5" rx="2.4" ry="2.8"/>
      </g>`;
    return g;
  }

  function crearJaguarete() {
    const g = crear('g', { class: 'jk-pieza jk-jaguarete', filter: 'url(#jk-sombra)' });
    g.innerHTML = `
      <circle r="${RADIO_JAGUARETE}" fill="url(#jk-piel)"/>
      <circle r="${RADIO_JAGUARETE}" fill="none" stroke="#492808" stroke-width="2.8"/>
      <circle r="${RADIO_JAGUARETE - 4.5}" fill="none" stroke="#ffe6a8" stroke-width="1.2" opacity="0.28"/>
      ${brillo(RADIO_JAGUARETE)}

      <path d="M-30-6 C-30-19 -17-24 0-24 C17-24 30-19 30-6
               C30 6 27 16 20 23 C13 29 -13 29 -20 23 C-27 16 -30 6 -30-6 Z"
            fill="#eaab3c"/>

      <path d="M-28-12 C-31-24 -22-27 -15-21 C-20-19 -23-16 -24-12 Z"
            fill="#d59526" stroke="#2b1505" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M28-12 C31-24 22-27 15-21 C20-19 23-16 24-12 Z"
            fill="#d59526" stroke="#2b1505" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M-26-14 C-28-22 -22-24 -17-20 C-20-18 -22-16 -22-14 Z" fill="#2b1505"/>
      <path d="M26-14 C28-22 22-24 17-20 C20-18 22-16 22-14 Z" fill="#2b1505"/>

      <g fill="#2b1505">
        <path d="M-13-22 q5 6 3 11 l-4-1 q1-5 -3-9 Z"/>
        <path d="M13-22 q-5 6 -3 11 l4-1 q-1-5 3-9 Z"/>
      </g>
      <g fill="none" stroke="#2b1505" stroke-width="2.3" opacity="0.62" stroke-linecap="round">
        <path d="M-28-4 q-3 7 -1 13"/>
        <path d="M28-4 q3 7 1 13"/>
        <path d="M-24 15 q4 6 10 8"/>
        <path d="M24 15 q-4 6 -10 8"/>
        <path d="M-6-21 q6-2 12 0"/>
      </g>

      <path d="M-25-8 C-20-14 -10-13 -6-6 L-9-4 C-13-10 -19-11 -23-5 Z" fill="#2b1505"/>
      <path d="M25-8 C20-14 10-13 6-6 L9-4 C13-10 19-11 23-5 Z" fill="#2b1505"/>
      <ellipse cx="-15" cy="-3" rx="6" ry="4.2" fill="#ffd45e"/>
      <ellipse cx="15" cy="-3" rx="6" ry="4.2" fill="#ffd45e"/>
      <ellipse cx="-15" cy="-3" rx="1.7" ry="3.6" fill="#1b0d02"/>
      <ellipse cx="15" cy="-3" rx="1.7" ry="3.6" fill="#1b0d02"/>

      <g stroke="#2b1505" stroke-width="1.3" stroke-linecap="round" opacity="0.45">
        <path d="M-15 14 L-30 11"/>
        <path d="M-15 18 L-29 19"/>
        <path d="M15 14 L30 11"/>
        <path d="M15 18 L29 19"/>
      </g>

      <ellipse cx="0" cy="16" rx="16" ry="11.5" fill="#fbf0d8"/>
      <path d="M0 6 L-8.5 14 L0 18.5 L8.5 14 Z" fill="#2b1505"/>
      <path d="M0 18.5 L0 21.5" stroke="#2b1505" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M0 21.5 Q-8 27 -13 21" fill="none" stroke="#2b1505" stroke-width="2.8" stroke-linecap="round"/>
      <path d="M0 21.5 Q8 27 13 21" fill="none" stroke="#2b1505" stroke-width="2.8" stroke-linecap="round"/>
      <path d="M-7.5 23 L-5.5 30.5 L-2.5 24 Z" fill="#fffaf0"/>
      <path d="M7.5 23 L5.5 30.5 L2.5 24 Z" fill="#fffaf0"/>`;
    return g;
  }

  function colocar(elemento, nodo, rotado) {
    const p = puntoDeNodo(nodo, rotado);
    elemento.setAttribute('transform', `translate(${p.x} ${p.y})`);
  }

  const Vista = {
    PASO, MARGEN, ANCHO, ALTO, RADIO_JAGUA, RADIO_JAGUARETE, ARISTAS,
    puntoDeNodo, nodoMasCercano, construirTablero, crear, dibujarCoordenadas,
    crearJaguarete, crearJagua, colocar,
  };

  raiz.Vista = Vista;
  if (typeof module !== 'undefined' && module.exports) module.exports = Vista;
})(typeof window !== 'undefined' ? window : globalThis);
