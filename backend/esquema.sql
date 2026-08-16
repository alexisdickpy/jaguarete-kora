-- =============================================================================
-- Jaguarete Kora — esquema de la base de métricas (Cloudflare D1)
-- Pegar en la consola de la base de datos y ejecutar una sola vez.
--
-- No se guarda ninguna dirección IP ni dato personal: «anon» es un
-- identificador aleatorio que genera el propio navegador del visitante.
-- =============================================================================

CREATE TABLE IF NOT EXISTS eventos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  creado      TEXT NOT NULL,           -- fecha y hora en formato ISO, UTC
  evento      TEXT NOT NULL,           -- sesion_iniciada, partida_iniciada, ...
  anon        TEXT,                    -- identificador aleatorio por dispositivo
  sesion      TEXT,                    -- identificador aleatorio por visita
  dispositivo TEXT,                    -- movil | tablet | escritorio
  ancho       INTEGER,                 -- ancho de la ventana en píxeles
  idioma      TEXT,                    -- idioma del navegador
  origen      TEXT,                    -- dominio de procedencia, sin ruta

  bando       TEXT,                    -- jaguarete | jaguakuera
  dificultad  TEXT,                    -- facil | medio | dificil
  resultado   TEXT,                    -- victoria | derrota | tablas (del humano)
  ganador     TEXT,                    -- jaguarete | jaguakuera | ninguno
  motivo      TEXT,                    -- capturas | encierro | fuga | repeticion
  jugadas     INTEGER,
  capturas    INTEGER,
  segundos    INTEGER,
  seccion     TEXT                     -- reglas | cultura
);

CREATE INDEX IF NOT EXISTS idx_eventos_evento ON eventos (evento);
CREATE INDEX IF NOT EXISTS idx_eventos_creado ON eventos (creado);
CREATE INDEX IF NOT EXISTS idx_eventos_sesion ON eventos (sesion);
