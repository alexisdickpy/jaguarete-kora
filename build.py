# -*- coding: utf-8 -*-
"""
Jaguarete Kora — construccion de los bloques desplegables.

Genera, a partir de las fuentes de src/:

  dist/bloque-a-juego.html     Fragmento autonomo para pegar en un bloque de
                               codigo de Soloist. Sin dependencias externas.
  dist/bloque-b-cultura.html   Fragmento con el contexto cultural.
  dist/index.html              Pagina completa, para pruebas locales o para
                               publicar en cualquier hosting estatico.

Uso:  python build.py
"""

import io
import os
import re

RAIZ = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(RAIZ, 'src')
DIST = os.path.join(RAIZ, 'dist')

LIMITE_SOLOIST = 100000

MODULOS = ['engine.js', 'ai.js', 'view.js', 'sound.js', 'metrics.js', 'ui.js']


def leer(nombre):
    with io.open(os.path.join(SRC, nombre), encoding='utf8') as f:
        return f.read()


def escribir(ruta, texto):
    with io.open(ruta, 'w', encoding='utf8') as f:
        f.write(texto)


def compactar(texto):
    """Quita comentarios y espacio sobrante conservando el codigo intacto.

    Solo se eliminan los comentarios de bloque y los de linea que ocupan la
    linea entera. Nunca se toca un `//` que aparezca dentro de una linea de
    codigo, porque ahi puede formar parte de una URL.
    """
    texto = re.sub(r'/\*.*?\*/', '', texto, flags=re.DOTALL)
    lineas = [l.rstrip() for l in texto.split('\n')]
    lineas = [l for l in lineas if not l.lstrip().startswith('//')]
    salida = []
    for linea in lineas:
        if linea.strip() == '':
            if salida and salida[-1] == '':
                continue
            salida.append('')
        else:
            salida.append(linea)
    return '\n'.join(salida).strip() + '\n'


def extraer_bloque(html):
    """Devuelve el marcado entre los marcadores del bloque embebible."""
    inicio = html.index('<!-- ===== INICIO BLOQUE')
    inicio = html.index('-->', inicio) + 3
    fin = html.index('<!-- ===== FIN BLOQUE')
    return html[inicio:fin].strip()


def construir_bloque_juego():
    marcado = extraer_bloque(leer('app.html'))
    css = compactar(leer('styles.css'))
    js = '\n'.join(compactar(leer(m)) for m in MODULOS)

    return (
        '<!-- Jaguarete Kora — Bloque A: juego completo.\n'
        '     Desarrollado por Alexis Dick. Generado por build.py: no editar a mano,\n'
        '     editar las fuentes de src/ y volver a construir. -->\n'
        '<style>\n' + css + '</style>\n\n'
        + marcado + '\n\n'
        '<script>\n' + js + '</script>\n'
    )


def construir_pagina(bloque_juego):
    return (
        '<!doctype html>\n<html lang="es">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<title>Jaguarete Kora — Ñembosarái guaraní</title>\n'
        '<meta name="description" content="Jaguarete Kora, juego de tablero tradicional '
        'guaraní. Juega contra la máquina. Un proyecto de Alexis Dick.">\n'
        '</head>\n<body style="margin:0;padding:24px 0;background:#f2f6f7">\n'
        + bloque_juego +
        '</body>\n</html>\n'
    )


def informe(nombre, texto):
    n = len(texto)
    margen = LIMITE_SOLOIST - n
    estado = 'OK' if n <= LIMITE_SOLOIST else 'EXCEDE EL LIMITE'
    print('  %-26s %7d caracteres  (%+d frente al limite)  %s' % (nombre, n, margen, estado))
    return n <= LIMITE_SOLOIST


def main():
    if not os.path.isdir(DIST):
        os.makedirs(DIST)

    bloque_juego = construir_bloque_juego()
    pagina = construir_pagina(bloque_juego)

    escribir(os.path.join(DIST, 'bloque-a-juego.html'), bloque_juego)
    escribir(os.path.join(DIST, 'index.html'), pagina)

    print('\nBloques generados en dist/\n')
    ok = informe('bloque-a-juego.html', bloque_juego)
    print('  %-26s %7d caracteres  (pagina completa, sin limite)' % ('index.html', len(pagina)))
    print('')
    if not ok:
        raise SystemExit('Algun bloque supera el limite de Soloist.')


if __name__ == '__main__':
    main()
