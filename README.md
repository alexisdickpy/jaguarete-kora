# Jaguarete Kora

A web implementation of **Jaguarete Kora** (*ñembosarái guaraní*), a traditional strategy
board game linked to Guaraní communities: a cornered jaguarete faces fifteen *jaguakuéra*.
One hunts, the others close the circle.

Playable at **[alexisdick.com/jaguarete-kora](https://alexisdick.com/jaguarete-kora)**,
against the machine, at three difficulty levels and with no sign-up.

---

## Architecture

No external dependencies: no libraries, no fonts, no images, no network requests. All the
drawing is SVG generated in the browser and every sound is synthesised with the Web Audio
API. The result fits in a single self-contained file.

```
src/
  engine.js     Rules engine. Explicit graph of 31 nodes, move generation,
                captures, end conditions and draw detection.
  ai.js         Opponent: negamax with alpha-beta pruning, time-bounded
                iterative deepening, transposition table and positional
                evaluation.
  view.js       SVG board rendering, oriented to the player's own side.
  sound.js      Modal synthesis. No audio files.
  metrics.js    Anonymous product metrics, with a decoupled destination.
  ui.js         Controller: screens, turns, interaction and persistence.
  styles.css    Styles, all scoped under #jaguarete-kora.
  app.html      Markup and copy.

backend/        Optional metrics service (Cloudflare Workers + D1).
tests/          Test suite, runnable in the browser.
build.py        Builds the deployable file from src/.
```

### Design decisions

**The board is a graph, not a grid.** The alquerque diagonals exist at only half of the
intersections, alternating. Modelling it as a matrix would produce moves the board does
not allow, so the legality of every move is always decided by the edge list. Coordinates
serve only to draw, and to check that jumps are collinear.

**Orientation is a drawing layer.** Each player sees their own side in front of them, but
node identity and game state are identical: rotating means reflecting the point about the
centre of the canvas. This leaves the door open to an online mode where both clients
render the same position from their own side.

**The engine knows nothing about screens.** It does not import `view`, `ui` or `sound`.
It can run on a server to validate moves without touching a line.

---

## The game

Two unequal sides on a five-by-five *alquerque* of intersections, extended by a triangle
— the *kora* — where the jaguarete starts out cornered. Thirty-one intersections in all.

- The **Jaguarete** moves one intersection per turn in any direction the lines allow, and
is the only side that captures: it jumps over an adjacent jagua and lands on the empty
intersection immediately beyond. One capture per turn.
- The **Jaguakuéra** move one piece per turn forwards, diagonally forwards or sideways,
and **never backwards**. They never capture.
- The Jaguarete wins with eight captures. The Jaguakuéra win if they leave it with no
legal move.

The irreversibility of the jaguakuéra advance is the strategic key: every advance closes
space, but spends for good the possibility of going back.

### On the rules

The game follows the rules as recorded in the documentation consulted, with two minimal
adaptations so that a game can always be resolved in a browser:

- Threefold repetition of the same position is declared a draw.
- If the jaguarete reaches a zone no jagua will ever be able to occupy — possible because
they never retreat — it is awarded the win: the encirclement is already impossible. It is
the same logic the traditional rule applies to the eight captures.

Without the second, three to four of every five games ended in a draw by repetition after
more than 150 moves. With it, the two sides come out balanced.

---

## Build and test

Python 3 to build and a browser to test. Nothing else.

```bash
python build.py
```

This writes the deployable file to `dist/` and warns if it exceeds the character limit of
the host site.

```bash
python -m http.server 8765
```

Then, in the browser:

- `http://localhost:8765/src/app.html` — development version, with the modules kept apart
- `http://localhost:8765/tests/index.html` — test suite

The tests cover board geometry, the starting position, the moves of both sides, captures,
every end condition, orientation, and the behaviour of the AI at all three levels. They
must all pass before publishing.

---

## Metrics

`metrics.js` collects aggregate product events — which side and difficulty are chosen, how
games end, and where they are abandoned — with no personal data, no cookies, and no record
of the moves themselves.

The `ENDPOINT` constant is empty in this repository: **each installation configures its
own**. Left empty, the game makes no network request at all and runs entirely on its own.
`backend/` holds the service that receives them, built for the Cloudflare Workers free
plan with a D1 database.

---

## Deployment

[DESPLIEGUE.md](DESPLIEGUE.md) has the full instructions, including the particulars of
publishing the game inside an embedded code block.

---

A project by **Alexis Dick** · [alexisdick.com](https://alexisdick.com)
