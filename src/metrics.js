/* =============================================================================
   Jaguarete Kora — Métricas anónimas
   -----------------------------------------------------------------------------
   Recoge únicamente eventos agregados de producto (PRD §24): qué bando y qué
   dificultad elige la gente, cómo terminan las partidas y en qué punto se
   abandonan. No hay datos personales, ni cookies, ni contenido de las jugadas.

   El destino está desacoplado: si ENDPOINT queda vacío el juego no realiza
   ninguna petición de red y sigue siendo un bloque autónomo. Los eventos se
   guardan además en el propio dispositivo, de modo que nada se pierde si el
   envío falla o el visitante está sin conexión.
   ========================================================================== */

(function (raiz) {
  'use strict';


  /* URL del Worker que recibe los eventos. Se rellena en el despliegue de cada
     instalación; vacío significa que el juego no realiza ninguna petición de red
     y funciona como un bloque completamente autónomo. */
  const ENDPOINT = '';

  const CLAVE_ID = 'jk.anon';
  const CLAVE_COLA = 'jk.cola';
  const MAX_COLA = 60;

  /* Identificador aleatorio por dispositivo, sin relación con ningún dato
     personal. Sirve para contar partidas por sesión y visitantes recurrentes. */
  function identificador() {
    try {
      let id = localStorage.getItem(CLAVE_ID);
      if (!id) {
        id = 'a' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        localStorage.setItem(CLAVE_ID, id);
      }
      return id;
    } catch (e) {
      return 'efimero';
    }
  }

  const SESION = 's' + Math.random().toString(36).slice(2, 10);

  function contexto() {
    /* El tipo de dispositivo se deduce del tamaño de la pantalla, no del ancho
       de la ventana: el juego vive dentro de un iframe estrecho, y medir ese
       iframe hacía pasar por móvil a cualquiera que entrase desde un ordenador.
       El ancho del bloque se sigue guardando aparte, que es otro dato útil. */
    const ancho = window.innerWidth || 0;
    const pantalla = (window.screen && (screen.width || 0)) || ancho;
    return {
      anon: identificador(),
      sesion: SESION,
      dispositivo: pantalla < 768 ? 'movil' : pantalla < 1100 ? 'tablet' : 'escritorio',
      ancho,
      idioma: (navigator.language || '').slice(0, 5),
      origen: refDominio(),
      version: 1,
    };
  }

  /* Sólo el dominio de procedencia, nunca la URL completa con sus parámetros. */
  function refDominio() {
    try {
      return document.referrer ? new URL(document.referrer).hostname : '';
    } catch (e) {
      return '';
    }
  }

  function leerCola() {
    try {
      return JSON.parse(localStorage.getItem(CLAVE_COLA) || '[]');
    } catch (e) {
      return [];
    }
  }

  function guardarCola(cola) {
    try {
      localStorage.setItem(CLAVE_COLA, JSON.stringify(cola.slice(-MAX_COLA)));
    } catch (e) {
      /* Sin almacenamiento: las métricas locales simplemente no persisten. */
    }
  }

  function registrar(evento, datos = {}) {
    const registro = Object.assign({ evento, ts: Date.now() }, contexto(), datos);

    const cola = leerCola();
    cola.push(registro);
    guardarCola(cola);

    enviar(registro);
    return registro;
  }

  /* Envío best-effort: nunca debe bloquear ni romper la partida. sendBeacon
     sobrevive al cierre de la pestaña, que es justo cuando se registra el
     abandono de una partida. */
  function enviar(registro) {
    if (!ENDPOINT) return;
    const cuerpo = JSON.stringify(registro);
    /* text/plain es un tipo permitido sin comprobación previa de CORS. Con
       application/json el navegador exigiría un preflight que sendBeacon no
       puede hacer, y el evento se perdería justo al cerrar la pestaña. */
    const tipo = 'text/plain;charset=UTF-8';
    try {
      /* fetch con keepalive es la vía principal: sobrevive igual al cierre de la
         pestaña y, a diferencia de sendBeacon, no lo bloquean los escudos
         antirrastreo de algunos navegadores. sendBeacon queda de reserva. */
      if (window.fetch) {
        fetch(ENDPOINT, {
          method: 'POST',
          body: cuerpo,
          headers: { 'Content-Type': tipo },
          keepalive: true,
          mode: 'cors',
        }).catch(() => {
          if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([cuerpo], { type: tipo }));
        });
        return;
      }
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([cuerpo], { type: tipo }));
      }
    } catch (e) {
      /* Silencio deliberado: una métrica jamás debe afectar al juego. */
    }
  }

  /* Volcado local, útil para revisar en tu propio navegador desde la consola. */
  function historicoLocal() { return leerCola(); }

  const Metricas = {
    ENDPOINT, registrar, historicoLocal,

    sesion() { return registrar('sesion_iniciada'); },
    partidaIniciada(bando, dificultad) { return registrar('partida_iniciada', { bando, dificultad }); },
    partidaTerminada(datos) { return registrar('partida_terminada', datos); },
    partidaAbandonada(datos) { return registrar('partida_abandonada', datos); },
    seccionAbierta(seccion) { return registrar('seccion_abierta', { seccion }); },
  };

  raiz.Metricas = Metricas;
  if (typeof module !== 'undefined' && module.exports) module.exports = Metricas;
})(typeof window !== 'undefined' ? window : globalThis);
