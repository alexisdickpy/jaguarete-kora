/* =============================================================================
   Jaguarete Kora — Sonido
   -----------------------------------------------------------------------------
   Todos los sonidos se sintetizan con la Web Audio API: no hay ningún archivo
   externo, lo que mantiene el bloque embebido ligero y sin peticiones de red.

   El contexto de audio se crea en el primer gesto del usuario, como exigen los
   navegadores. Si el audio no está disponible o el usuario lo silencia, el
   juego funciona igual (PRD §15).
   ========================================================================== */

(function (raiz) {
  'use strict';


  const CLAVE_SILENCIO = 'jk.silencio';

  let contexto = null;
  let silenciado = leerPreferencia();

  function leerPreferencia() {
    try {
      return localStorage.getItem(CLAVE_SILENCIO) === '1';
    } catch (e) {
      return false;
    }
  }

  function guardarPreferencia() {
    try {
      localStorage.setItem(CLAVE_SILENCIO, silenciado ? '1' : '0');
    } catch (e) {
      /* Almacenamiento no disponible: la preferencia dura lo que la sesión. */
    }
  }

  /* Debe llamarse desde un gesto del usuario. */
  function despertar() {
    if (contexto) {
      if (contexto.state === 'suspended') contexto.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) contexto = new Ctx();
    } catch (e) {
      contexto = null;
    }
  }

  function estaSilenciado() { return silenciado; }

  function alternarSilencio() {
    silenciado = !silenciado;
    guardarPreferencia();
    /* Al reactivar el sonido se da un golpe de confirmación, para que se oiga
       de inmediato el volumen real del juego. */
    if (!silenciado) {
      despertar();
      madera({ frecuencias: [640, 1500, 2750], duracion: 0.12, volumen: 1.1 });
    }
    return silenciado;
  }

  /* --- Materia prima --------------------------------------------------------
     Todo son golpes de madera, como los de una pieza al posarse en un tablero.
     Nada de melodías ni de colas largas. El timbre no viene de un oscilador
     sino de resonadores, que es de donde viene en la realidad.
     -------------------------------------------------------------------------- */

  let ruidoBase = null;

  /* Un único búfer de ruido reutilizable: generar uno nuevo en cada jugada
     gastaría tiempo de proceso sin ninguna ventaja sonora. */
  function ruido() {
    if (!ruidoBase) {
      const muestras = Math.floor(contexto.sampleRate * 0.4);
      ruidoBase = contexto.createBuffer(1, muestras, contexto.sampleRate);
      const datos = ruidoBase.getChannelData(0);
      for (let i = 0; i < muestras; i++) datos[i] = Math.random() * 2 - 1;
    }
    return ruidoBase;
  }

  /* Pequeña variación aleatoria en cada golpe. Dos impactos idénticos suenan
     mecánicos; una desviación mínima los vuelve creíbles. */
  function variar(valor, porcentaje) {
    return valor * (1 + (Math.random() * 2 - 1) * porcentaje);
  }

  /* Golpe de madera por síntesis modal: un chasquido de ruido muy corto pasa
     por varios filtros resonantes, cada uno con su propia caída. Es lo que
     ocurre físicamente cuando una pieza de madera golpea un tablero, y suena
     mucho más creíble que un oscilador, sin coste de descarga: no hay ningún
     archivo de audio. */
  function madera({ frecuencias, duracion, volumen, q = 11, retardo = 0 }) {
    if (silenciado || !contexto) return;
    const inicio = contexto.currentTime + retardo;

    const fuente = contexto.createBufferSource();
    fuente.buffer = ruido();
    fuente.playbackRate.value = variar(1, 0.06);

    /* Excitación: sólo los primeros milisegundos del ruido, que es el impacto. */
    const golpe = contexto.createGain();
    golpe.gain.setValueAtTime(1, inicio);
    golpe.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.012);
    fuente.connect(golpe);

    const salida = contexto.createGain();
    salida.gain.value = volumen;
    salida.connect(contexto.destination);

    frecuencias.forEach((frecuencia, i) => {
      const filtro = contexto.createBiquadFilter();
      filtro.type = 'bandpass';
      filtro.frequency.value = variar(frecuencia, 0.05);
      filtro.Q.value = q;

      const caida = contexto.createGain();
      const dur = variar(duracion, 0.12) * (1 - i * 0.22);
      caida.gain.setValueAtTime(1 / (i + 1.4), inicio);
      caida.gain.exponentialRampToValueAtTime(0.0001, inicio + Math.max(0.03, dur));

      golpe.connect(filtro).connect(caida).connect(salida);
    });

    fuente.start(inicio);
    fuente.stop(inicio + duracion + 0.1);
  }

  function cuerpo({ frecuencia, duracion, volumen, retardo = 0 }) {
    if (silenciado || !contexto) return;
    const inicio = contexto.currentTime + retardo;
    const dur = variar(duracion, 0.1);

    const osc = contexto.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(variar(frecuencia, 0.06), inicio);
    osc.frequency.exponentialRampToValueAtTime(frecuencia * 0.7, inicio + dur);

    const ganancia = contexto.createGain();
    ganancia.gain.setValueAtTime(volumen, inicio);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + dur);

    osc.connect(ganancia).connect(contexto.destination);
    osc.start(inicio);
    osc.stop(inicio + dur + 0.02);
  }

  const Sonido = {
    despertar, estaSilenciado, alternarSilencio,

    /* Roce breve y agudo al levantar una ficha. */
    seleccionar() {
      madera({ frecuencias: [1500, 3000], duracion: 0.045, volumen: 0.5, q: 6 });
    },

    /* Ficha de madera apoyándose en el tablero. */
    mover() {
      madera({ frecuencias: [640, 1500, 2750], duracion: 0.12, volumen: 1.1 });
    },

    /* Captura: golpe más grave, más largo y con cuerpo debajo. */
    capturar() {
      madera({ frecuencias: [380, 950, 1900], duracion: 0.2, volumen: 1.5, q: 9 });
      cuerpo({ frecuencia: 105, duracion: 0.16, volumen: 0.14 });
    },

    /* Jugada imposible: golpe apagado y sordo, sin resonancia. */
    ilegal() {
      madera({ frecuencias: [240, 470], duracion: 0.06, volumen: 0.6, q: 3 });
    },

    /* Finales: golpes de madera, sin melodía. Cambia el ritmo y el brillo. */
    victoria() {
      [0, 0.1, 0.21].forEach((t, i) => {
        madera({ frecuencias: [620 + i * 420, 1500 + i * 700], duracion: 0.13, volumen: 1, retardo: t });
      });
    },

    derrota() {
      madera({ frecuencias: [320, 760], duracion: 0.16, volumen: 0.9, q: 8 });
      cuerpo({ frecuencia: 115, duracion: 0.26, volumen: 0.14 });
      cuerpo({ frecuencia: 78, duracion: 0.34, volumen: 0.12, retardo: 0.12 });
    },

    tablas() {
      [0, 0.14].forEach((t) => {
        madera({ frecuencias: [700, 1600], duracion: 0.11, volumen: 0.8, retardo: t });
      });
    },
  };

  raiz.Sonido = Sonido;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sonido;
})(typeof window !== 'undefined' ? window : globalThis);
