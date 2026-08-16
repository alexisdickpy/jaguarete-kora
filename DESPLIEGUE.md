# Jaguarete Kora — despliegue y mantenimiento

Guía práctica para publicar y actualizar el juego. Fase 1: juego contra la máquina.

---

## 1. Qué hay que pegar en Soloist

Tras ejecutar la construcción, en `dist/` queda un único archivo pensado para pegarse
tal cual en un bloque de código de Soloist:

| Archivo | Qué es | Dónde va |
|---|---|---|
| `dist/bloque-a-juego.html` | El juego completo: tablero, reglas, IA, sonidos, textos culturales y métricas | Bloque de código de la página del juego |

Es autónomo: no carga ningún archivo externo, ni fuentes, ni imágenes, ni
bibliotecas. Todo el dibujo es SVG generado en el navegador y todos los sonidos se
sintetizan con la Web Audio API.

El contexto cultural va dentro del propio juego, en el diálogo «Sobre el juego». Se
descartó publicarlo como bloque aparte; `src/cultura.html` queda aparcado y sin
generar por si algún día se quiere una página cultural independiente.

### Pasos en Soloist

1. Crea la página del juego (la prevista es `alexisdick.com/jaguaretekora`).
2. Añade una sección de tipo **Embed Code** / **Código**.
3. Abre `dist/bloque-a-juego.html` en un editor de texto, selecciona **todo** el
   contenido y pégalo en el campo de código.
4. Publica y comprueba la página en el dominio real, no sólo en el previsualizador.

> Soloist permite hasta **6 bloques** de código de **100.000 caracteres** cada uno.
> El bloque del juego ocupa unos **68.500**, así que queda margen holgado.

### Cómo publica Soloist realmente el bloque (importante)

Soloist **no** inserta el código dentro de la página: lo sirve desde otro dominio
(`embed.soloist.ai`) dentro de un **iframe**, y le fija la altura según lo que mida el
contenido, con un `min-height` en línea.

Esto tiene dos consecuencias que condicionan todo el diseño:

1. **No se pueden usar unidades de ventana** (`vh`, `svh`) para dimensionar nada.
   Dentro del iframe, `100vh` es la altura del propio iframe, no la de la ventana.
   Como esa altura depende del alto del contenido, dimensionar el tablero con `vh`
   crea un bucle: tablero más grande, contenido más alto, iframe más alto, tablero
   más grande todavía. El juego calcula el tamaño del tablero en `ui.js` a partir de
   `screen.availHeight`, que sí es un dato estable y visible desde el iframe.
2. **La altura total del bloque es la que determina cuánto hay que desplazarse.**
   Por eso la portada y la pantalla de partida están ajustadas para medir casi lo
   mismo, en torno a 480 píxeles en un portátil corriente.

> Si tras pegar una versión nueva el bloque conserva un hueco vacío enorme, es que
> Soloist mantiene la altura antigua que midió. Elimina la sección de código y
> vuelve a crearla para que la recalcule.

### Comprobaciones tras publicar

- [ ] El juego aparece y se puede pulsar «Jugar» sin registrarse.
- [ ] Se puede elegir bando y dificultad.
- [ ] Al jugar como Jaguakuéra, el tablero aparece invertido (la kora al fondo).
- [ ] La máquina responde a cada jugada.
- [ ] El sonido funciona y el botón de silencio lo apaga.
- [ ] En un móvil real: el tablero se ve entero y las fichas se tocan cómodamente.
- [ ] El tablero cabe en pantalla sin desplazarse y no se mueve al hacer una jugada.
- [ ] Ningún estilo del juego se ha «escapado» al resto de la web.

---

## 2. Cómo actualizar el juego

Las fuentes están en `src/`. Nunca se editan los archivos de `dist/`: se generan.

```bash
python build.py
```

Esto regenera los tres archivos de `dist/` y avisa si algún bloque se acerca al
límite de caracteres. Después, vuelve a pegar el bloque afectado en Soloist.

### Probar antes de publicar

```bash
python -m http.server 8765
```

Y abre en el navegador:

- `http://localhost:8765/src/app.html` — versión de desarrollo, con los módulos separados
- `http://localhost:8765/dist/index.html` — exactamente lo que se va a pegar
- `http://localhost:8765/tests/index.html` — batería de tests del motor, la orientación y la IA

La página de tests debe mostrar **todos los tests correctos** antes de publicar nada.

---

## 3. Métricas (opcional, se puede activar más tarde)

El juego funciona perfectamente sin esto. Mientras la constante `ENDPOINT` de
`src/metrics.js` esté vacía, el bloque no hace **ninguna** petición de red.

### Puesta en marcha en Cloudflare

1. Crea una cuenta gratuita en `dash.cloudflare.com`. No pide tarjeta.
2. **Workers & Pages → Create → Worker**. Nómbralo `jaguarete-kora-metricas` y
   despliégalo. Anota la URL que te da, del tipo
   `https://jaguarete-kora-metricas.TU-USUARIO.workers.dev`.
3. **Storage & Databases → D1 → Create database**, con el nombre `jaguaretekora`.
4. En la consola de esa base, pega el contenido de `backend/esquema.sql` y ejecútalo.
5. Vuelve al Worker → **Settings → Bindings → Add → D1 database**:
   - Variable name: `DB`
   - Database: `jaguaretekora`
6. En **Settings → Variables and Secrets**, añade:
   - `CLAVE_PANEL` — una contraseña larga inventada por ti, para consultar los informes
   - `ORIGENES` — `https://alexisdick.com,https://embed.soloist.ai`

   > Van los dos dominios porque Soloist no incrusta el bloque en la propia página:
   > lo sirve dentro de un iframe alojado en `embed.soloist.ai`, y ese es el origen
   > con el que el navegador enviará los eventos. Un origen es siempre
   > protocolo más dominio: nunca lleva la ruta de la página.
7. **Edit code**, borra el contenido y pega `backend/worker.js`. Despliega.
8. Abre `src/metrics.js`, pon la URL del Worker en `const ENDPOINT = '';`, ejecuta
   `python build.py` y vuelve a pegar el bloque A en Soloist.

### Consultar los datos

- Indicadores agregados:
  `https://TU-WORKER.workers.dev/resumen?clave=TU_CLAVE_PANEL`
- Volcado completo en CSV, para abrir en Excel o analizar:
  `https://TU-WORKER.workers.dev/csv?clave=TU_CLAVE_PANEL`

El resumen incluye alcance, reparto entre móvil y escritorio, embudo de conversión
(visitas → partidas → partidas terminadas), partidas por sesión, jugada media de
abandono, aperturas de la sección cultural y —lo más importante para decidir el
sistema de rating de la Fase 2— el **reparto de victorias por bando y dificultad**.

### Qué se guarda y qué no

Se guarda: un identificador aleatorio generado por el navegador, tipo de dispositivo,
ancho de ventana, idioma del navegador, dominio de procedencia y los datos agregados
de cada partida.

No se guarda: dirección IP, nombre, correo, ubicación, cookies de seguimiento, ni el
contenido de las jugadas.

---

## 4. Estructura del proyecto

```
src/
  engine.js     Motor de reglas. Grafo de 31 nodos, movimientos, capturas, finales.
  ai.js         Oponente: negamax con poda alfa-beta y profundización iterativa.
  view.js       Dibujo del tablero en SVG y orientación según el bando del jugador.
  sound.js      Sonidos sintetizados con Web Audio.
  metrics.js    Métricas anónimas, con destino desacoplado.
  ui.js         Controlador: pantallas, turnos, interacción y persistencia.
  styles.css    Estilos, todos bajo #jaguarete-kora.
  app.html      Marcado y textos.
  cultura.html  Bloque cultural independiente.

tests/          Batería de tests ejecutable en el navegador.
backend/        Worker de métricas y esquema de la base de datos.
build.py        Genera dist/ a partir de src/.
dist/           Generado. No editar a mano.
```

La separación importa de cara a la Fase 2: `engine.js` no sabe nada de pantallas ni
de dibujo, de modo que el mismo motor podrá validar las jugadas en el servidor sin
tocar una línea.
