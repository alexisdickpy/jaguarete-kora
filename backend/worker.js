/* =============================================================================
   Jaguarete Kora — Worker de métricas (Cloudflare Workers + D1)
   -----------------------------------------------------------------------------
   Recibe eventos anónimos de producto del juego y los guarda en una base D1.
   No almacena direcciones IP, ni cabeceras de usuario, ni ningún dato personal:
   sólo el identificador aleatorio que el propio navegador genera y los campos
   agregados de la partida.

   Rutas:
     POST /                       registra un evento
     GET  /resumen?clave=SECRETO  indicadores agregados en JSON
     GET  /csv?clave=SECRETO      volcado completo en CSV

   Variables de entorno a configurar en el panel:
     CLAVE_PANEL   contraseña larga para consultar los informes
     ORIGENES      dominios permitidos, separados por comas
   Enlace de base de datos D1 con el nombre: DB
   ========================================================================== */

const EVENTOS_VALIDOS = new Set([
  'sesion_iniciada',
  'partida_iniciada',
  'partida_terminada',
  'partida_abandonada',
  'seccion_abierta',
]);

const LIMITE_CUERPO = 2048;

function origenPermitido(peticion, env) {
  const origen = peticion.headers.get('Origin') || '';
  const permitidos = (env.ORIGENES || 'https://alexisdick.com')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return permitidos.includes(origen) ? origen : permitidos[0];
}

function cabeceras(peticion, env) {
  return {
    'Access-Control-Allow-Origin': origenPermitido(peticion, env),
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/* Recorta y normaliza: nunca se confía en lo que llega del navegador. */
function texto(valor, maximo = 40) {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim().slice(0, maximo);
  return limpio.length > 0 ? limpio : null;
}

function entero(valor, maximo = 100000) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(maximo, Math.round(n)));
}

async function registrarEvento(peticion, env) {
  const bruto = await peticion.text();
  if (bruto.length > LIMITE_CUERPO) return new Response('cuerpo demasiado grande', { status: 413 });

  let datos;
  try {
    datos = JSON.parse(bruto);
  } catch (e) {
    return new Response('json no válido', { status: 400 });
  }

  const evento = texto(datos.evento, 30);
  if (!evento || !EVENTOS_VALIDOS.has(evento)) {
    return new Response('evento desconocido', { status: 400 });
  }

  await env.DB.prepare(
    `INSERT INTO eventos
      (creado, evento, anon, sesion, dispositivo, ancho, idioma, origen,
       bando, dificultad, resultado, ganador, motivo, jugadas, capturas, segundos, seccion)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    new Date().toISOString(),
    evento,
    texto(datos.anon, 24),
    texto(datos.sesion, 24),
    texto(datos.dispositivo, 12),
    entero(datos.ancho, 10000),
    texto(datos.idioma, 5),
    texto(datos.origen, 80),
    texto(datos.bando, 12),
    texto(datos.dificultad, 10),
    texto(datos.resultado, 12),
    texto(datos.ganador, 12),
    texto(datos.motivo, 12),
    entero(datos.jugadas, 2000),
    entero(datos.capturas, 20),
    entero(datos.segundos, 86400),
    texto(datos.seccion, 20)
  ).run();

  return new Response('ok');
}

function autorizado(url, env) {
  /* Se recortan los espacios de ambos lados: al pegar la contraseña en el panel
     es fácil arrastrar un espacio o un salto de línea invisible, y entonces la
     comparación no coincide nunca por mucho que se escriba bien. */
  const clave = (url.searchParams.get('clave') || '').trim();
  const guardada = String(env.CLAVE_PANEL || '').trim();
  return guardada.length > 0 && clave === guardada;
}

async function resumen(env) {
  const consulta = async (sql) => (await env.DB.prepare(sql).all()).results;

  return {
    generado: new Date().toISOString(),

    alcance: await consulta(`
      SELECT COUNT(DISTINCT anon) AS visitantes,
             COUNT(DISTINCT sesion) AS sesiones
      FROM eventos WHERE evento = 'sesion_iniciada'`),

    dispositivos: await consulta(`
      SELECT dispositivo, COUNT(DISTINCT sesion) AS sesiones
      FROM eventos WHERE evento = 'sesion_iniciada'
      GROUP BY dispositivo ORDER BY sesiones DESC`),

    /* Conversión: de cada sesión que llega, cuántas empiezan a jugar. */
    embudo: await consulta(`
      SELECT
        (SELECT COUNT(DISTINCT sesion) FROM eventos WHERE evento='sesion_iniciada') AS sesiones,
        (SELECT COUNT(DISTINCT sesion) FROM eventos WHERE evento='partida_iniciada') AS sesiones_con_partida,
        (SELECT COUNT(*) FROM eventos WHERE evento='partida_iniciada') AS partidas_iniciadas,
        (SELECT COUNT(*) FROM eventos WHERE evento='partida_terminada') AS partidas_terminadas,
        (SELECT COUNT(*) FROM eventos WHERE evento='partida_abandonada') AS partidas_abandonadas`),

    /* El dato que decide el sistema de rating de la Fase 2. */
    equilibrio: await consulta(`
      SELECT bando, dificultad, COUNT(*) AS partidas,
             SUM(CASE WHEN resultado='victoria' THEN 1 ELSE 0 END) AS gana_humano,
             SUM(CASE WHEN resultado='derrota'  THEN 1 ELSE 0 END) AS gana_maquina,
             SUM(CASE WHEN resultado='tablas'   THEN 1 ELSE 0 END) AS tablas,
             ROUND(AVG(jugadas), 1) AS jugadas_media,
             ROUND(AVG(segundos), 1) AS segundos_media
      FROM eventos WHERE evento='partida_terminada'
      GROUP BY bando, dificultad ORDER BY bando, dificultad`),

    motivos: await consulta(`
      SELECT motivo, COUNT(*) AS partidas
      FROM eventos WHERE evento='partida_terminada'
      GROUP BY motivo ORDER BY partidas DESC`),

    /* Retención: partidas por sesión y momento del abandono. */
    retencion: await consulta(`
      SELECT ROUND(AVG(n), 2) AS partidas_por_sesion FROM (
        SELECT sesion, COUNT(*) AS n FROM eventos
        WHERE evento='partida_iniciada' GROUP BY sesion)`),

    abandono: await consulta(`
      SELECT ROUND(AVG(jugadas), 1) AS jugada_media_de_abandono,
             ROUND(AVG(segundos), 1) AS segundos_media
      FROM eventos WHERE evento='partida_abandonada'`),

    interes_cultural: await consulta(`
      SELECT seccion, COUNT(*) AS aperturas
      FROM eventos WHERE evento='seccion_abierta'
      GROUP BY seccion ORDER BY aperturas DESC`),

    por_dia: await consulta(`
      SELECT substr(creado,1,10) AS dia,
             SUM(CASE WHEN evento='sesion_iniciada' THEN 1 ELSE 0 END) AS sesiones,
             SUM(CASE WHEN evento='partida_iniciada' THEN 1 ELSE 0 END) AS partidas
      FROM eventos GROUP BY dia ORDER BY dia DESC LIMIT 60`),
  };
}

async function csv(env) {
  const { results } = await env.DB.prepare('SELECT * FROM eventos ORDER BY id').all();
  if (results.length === 0) return 'sin datos\n';

  const columnas = Object.keys(results[0]);
  const celda = (v) => (v === null || v === undefined ? '' : String(v).replace(/"/g, '""'));
  const filas = results.map((f) => columnas.map((c) => '"' + celda(f[c]) + '"').join(','));
  return columnas.join(',') + '\n' + filas.join('\n') + '\n';
}

export default {
  async fetch(peticion, env) {
    const cors = cabeceras(peticion, env);
    const url = new URL(peticion.url);

    if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (peticion.method === 'POST') {
        const respuesta = await registrarEvento(peticion, env);
        return new Response(respuesta.body, { status: respuesta.status, headers: cors });
      }

      if (peticion.method === 'GET' && (url.pathname === '/resumen' || url.pathname === '/csv')) {
        if (!autorizado(url, env)) return new Response('no autorizado', { status: 401, headers: cors });

        if (url.pathname === '/csv') {
          return new Response(await csv(env), {
            headers: Object.assign({}, cors, {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': 'attachment; filename="jaguaretekora.csv"',
            }),
          });
        }
        return new Response(JSON.stringify(await resumen(env), null, 2), {
          headers: Object.assign({}, cors, { 'Content-Type': 'application/json; charset=utf-8' }),
        });
      }

      return new Response('Jaguarete Kora — servicio de métricas', { headers: cors });
    } catch (e) {
      /* Un fallo aquí nunca debe repercutir en el juego. */
      return new Response('error interno', { status: 500, headers: cors });
    }
  },
};
