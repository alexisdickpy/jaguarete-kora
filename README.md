# Jaguarete Kora

Implementación web de **Jaguarete Kora** (*ñembosarái guaraní*), un juego de tablero
tradicional de estrategia vinculado a comunidades guaraníes: un jaguarete acorralado
se enfrenta a quince *jaguakuéra*. Uno caza, los otros cierran el cerco.

Jugable en **[alexisdick.com/jaguarete-kora](https://alexisdick.com/jaguarete-kora)**,
contra la máquina, en tres niveles de dificultad y sin registro.

---

## El juego

Dos bandos desiguales sobre un **alquerque** de cinco por cinco intersecciones al que
se añade una extensión triangular, el *kora*, donde comienza acorralado el jaguarete.
Treinta y una intersecciones en total.

- El **Jaguarete** mueve una intersección por turno en cualquier dirección que permitan
  las líneas, y es el único que captura: salta por encima de un jagua contiguo y cae en
  la intersección vacía inmediatamente posterior. Una sola captura por turno.
- Los **Jaguakuéra** mueven una ficha por turno hacia adelante, en diagonal de avance o
  en lateral, y **nunca hacia atrás**. No capturan jamás.
- Gana el Jaguarete con ocho capturas. Ganan los Jaguakuéra si lo dejan sin ningún
  movimiento legal.

La irreversibilidad del avance de los jaguakuéra es la clave estratégica: cada avance
cierra espacio pero consume para siempre la posibilidad de volver atrás.

---

## Arquitectura

Sin dependencias externas: ni bibliotecas, ni fuentes, ni imágenes, ni peticiones de red.
Todo el dibujo es SVG generado en el navegador y los sonidos se sintetizan con la Web
Audio API. El resultado cabe en un único archivo autónomo.

```
src/
  engine.js     Motor de reglas. Grafo explícito de 31 nodos, generación de
                movimientos, capturas, condiciones de final y detección de tablas.
  ai.js         Oponente: negamax con poda alfa-beta, profundización iterativa
                acotada por tiempo, tabla de transposición y evaluación posicional.
  view.js       Dibujo del tablero en SVG y orientación según el bando del jugador.
  sound.js      Sonidos por síntesis modal, sin archivos de audio.
  metrics.js    Métricas anónimas de producto, con destino desacoplado.
  ui.js         Controlador: pantallas, turnos, interacción y persistencia.
  styles.css    Estilos, todos bajo #jaguarete-kora.
  app.html      Marcado y textos.

backend/        Servicio opcional de métricas (Cloudflare Workers + D1).
tests/          Batería de tests ejecutable en el navegador.
build.py        Genera el archivo desplegable a partir de src/.
```

### Decisiones de diseño

**El tablero es un grafo, no una cuadrícula.** Las diagonales del alquerque existen sólo
en la mitad de las intersecciones, alternadas. Modelarlo como matriz produciría
movimientos que el tablero no permite, así que la legalidad de cada jugada la decide
siempre la lista de aristas. Las coordenadas sólo sirven para dibujar y para comprobar
la colinealidad de los saltos.

**La orientación es una capa de dibujo.** Cada jugador ve su bando delante, pero la
identidad de los nodos y el estado de la partida son idénticos: rotar es reflejar el
punto respecto del centro del lienzo. Esto deja la puerta abierta a un modo en línea
donde ambos clientes rendericen la misma posición desde su propio lado.

**El motor no sabe nada de pantallas.** No importa `view`, `ui` ni `sound`. Puede
ejecutarse en un servidor para validar jugadas sin tocar una línea.

### Sobre las reglas

Se siguen las reglas tal como aparecen recogidas en la documentación consultada, con dos
adaptaciones mínimas para que una partida pueda resolverse siempre en un navegador:

- La repetición triple de una misma posición se declara tablas.
- Si el jaguarete alcanza una zona que ningún jagua podrá pisar nunca —posible porque
  no retroceden—, se le da la victoria: el cerco ya es imposible. Es la misma lógica que
  la regla tradicional aplica a las ocho capturas.

Sin la segunda, entre tres y cuatro de cada cinco partidas terminaban en tablas por
repetición tras más de 150 jugadas. Con ella, el reparto entre bandos queda equilibrado.

---

## Construir y probar

Sólo hace falta Python 3 para construir y un navegador para probar.

```bash
python build.py
```

Genera en `dist/` el archivo desplegable y avisa si supera el límite de caracteres del
sitio anfitrión.

```bash
python -m http.server 8765
```

Y en el navegador:

- `http://localhost:8765/src/app.html` — versión de desarrollo, con los módulos separados
- `http://localhost:8765/tests/index.html` — batería de tests

Los tests cubren la geometría del tablero, la posición inicial, los movimientos de ambos
bandos, las capturas, todas las condiciones de final, la orientación y el comportamiento
de la IA en los tres niveles. Deben pasar todos antes de publicar.

---

## Métricas

`metrics.js` recoge eventos agregados de producto —qué bando y dificultad se eligen, cómo
terminan las partidas y en qué punto se abandonan— sin datos personales, sin cookies y sin
registrar el contenido de las jugadas.

La constante `ENDPOINT` está vacía en este repositorio: **cada instalación configura la
suya**. Vacía, el juego no realiza ninguna petición de red y funciona de forma totalmente
autónoma. En `backend/` está el servicio que las recibe, pensado para el plan gratuito de
Cloudflare Workers con una base D1.

---

## Despliegue

En [DESPLIEGUE.md](DESPLIEGUE.md) están las instrucciones completas, incluidas las
particularidades de publicar el juego dentro de un bloque de código embebido.

---

Un proyecto de **Alexis Dick** · [alexisdick.com](https://alexisdick.com)
