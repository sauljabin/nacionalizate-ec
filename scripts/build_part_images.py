#!/usr/bin/env python3
"""Build the images for "Partes del Escudo Nacional" and "Partes de la Bandera Nacional".

Each image shows the official coat of arms or flag (assets/*.svg, kept as
vectors), a pointer to one part, the part's name and its description. The
script also updates those cards in docs/data/cards.json so their mask hides
exactly the description.

To fix a text or move a pointer, edit COAT_PARTS or FLAG_PARTS and run:

  python3 scripts/build_part_images.py
"""

import json
import pathlib
import re
import textwrap

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMAGES = ROOT / "docs" / "images"
CARDS = ROOT / "docs" / "data" / "cards.json"
COAT_SVG = ROOT / "assets" / "coat-of-arms-of-ecuador.svg"
FLAG_SVG = ROOT / "assets" / "flag-of-ecuador.svg"

# Wikimedia Commons files of the official SVGs, shown under each image.
COAT_SOURCE = {"title": "Coat of arms of Ecuador", "license": "Public domain",
               "url": "https://commons.wikimedia.org/wiki/File:Coat_of_arms_of_Ecuador.svg"}
FLAG_SOURCE = {"title": "Flag of Ecuador", "license": "Public domain",
               "url": "https://commons.wikimedia.org/wiki/File:Flag_of_Ecuador.svg"}

# Card id, file key, name, point on the 800x960 coat of arms, description.
COAT_PARTS = [
    ("hYB9kJClaxcQ32KId.9900036244614224", "condor", "Cóndor", (375, 125),
     "Con las alas desplegadas y levantadas en actitud de vuelo, simboliza energía, esfuerzo y grandeza. Representa la fuerza y la libertad del pueblo."),
    ("TAnCJ6EbrlRndPJ1M.26716673941597124", "banderas", "Banderas Nacionales", (687.5, 562.5),
     "Son cuatro, dos a cada lado, anteriores y posteriores, que se agrupan bajo las fasces consulares."),
    ("sbj1RYpKnDhtOZ9O4.902543676681673", "astas", "Astas", (685.6, 178.1),
     "Son cuatro y coronan cada una de las banderas. Dos astas de lanza simbolizan las luchas por la independencia y dos de alabarda, la custodia y protección del poder del país."),
    ("UuqcCoF18WDAXgnH5.28720710483591383", "liston", "Listón", (667.5, 250),
     "Cinta de seda."),
    ("725KCJCDSNKMUXc2Q.06201437213982974", "laurel", "Laurel", (206.3, 293.8),
     "Representa la gloria de la nación."),
    ("jLzDTK1Cv8amrEZoI.1647189918385954", "palma", "Palma", (593.8, 325),
     "Representa la paz en la nación. Algunas fuentes la asocian también al martirio de quienes lucharon por la libertad."),
    ("EcI99zXwXz2PGmVje.3884763080218272", "sol", "Sol dorado", (400, 293.8),
     "También conocido como Sol Incaico. Simboliza el oro, la riqueza y la importancia de los primeros pobladores. Está en la parte superior del óvalo, junto a los signos del zodiaco."),
    ("BekFLB5w6OPwL69Gy.3682844484273602", "chimborazo", "Chimborazo", (375, 400),
     "El volcán más alto del Ecuador. Medido desde el centro de la Tierra, su cumbre es el punto más alejado del planeta. En el escudo, de él nace el río Guayas."),
    ("xeyPxATINmbjp9Mk5.8942785994404268", "rio-guayas", "Río Guayas", (331.3, 518.8),
     "Se ensancha hasta ocupar la parte baja del óvalo; sus orillas de exuberante vegetación expresan la agricultura nacional. Simboliza la unión de los ecuatorianos como una gran familia que comparte las riquezas de la tierra."),
    ("GjxRlM7jFa87CtQ3u.17314703725996816", "segur", "Segur", (231.3, 718.8),
     "Hacha grande que formaba parte de cada una de las fasces de los lictores romanos. Simboliza la fuerza pública."),
    ("TcDHcC2QHgVeDjRln.8107239911567634", "ovalo", "Óvalo", (565.6, 500),
     "Su contorno es de doble borde color café, con uniones del mismo color arriba y abajo."),
    ("KXtXaank8jZdY2lzK.9954522198833778", "zodiaco", "Signos del zodiaco", (481.3, 340.6),
     "A la derecha del escudo (izquierda de quien lo mira), Aries y Tauro; a la izquierda, Géminis y Cáncer. Representan marzo, abril, mayo y junio, los meses de la Revolución Marcista de 1845."),
    ("QcviInrhT6oTFh8Wi.3654224457725501", "caduceo", "Caduceo", (386.9, 590.6),
     "Coronado por dos alas y rodeado de serpientes, atributo de Mercurio. Es el mástil del buque y simboliza la navegación y el comercio."),
    ("V3E0gZT8UKkFiF38w.6412938386166135", "buque", "Buque a vapor Guayas", (431.3, 615.6),
     "Fue el primero construido en América del Sur, en 1841, en los astilleros de Guayaquil. Tiene por mástil un caduceo, y sus colores y su pabellón son los de la Bandera Nacional."),
    ("MjlxdNcjlkwm3CTwx.2366915299340525", "fasces", "Fasces consulares", (475, 756.3),
     "Insignia de los cónsules de Roma. Símbolo de la dignidad republicana y de autoridad; el escudo descansa sobre ellas."),
]

# Card id, file key, name, point on the 1440x960 flag, description.
FLAG_PARTS = [
    ("bandera-amarilla", "amarilla", "Franja amarilla", (1246.2, 235.4),
     "Simboliza las riquezas, la abundancia y la fertilidad de los cultivos y la tierra."),
    ("bandera-azul", "azul", "Franja azul", (1246.2, 598.1),
     "Simboliza el mar y el cielo."),
    ("bandera-roja", "roja", "Franja roja", (1246.2, 825.2),
     "Simboliza la sangre derramada por los soldados y mártires de la independencia."),
    ("bandera-escudo", "escudo", "Escudo Nacional", (720, 437.5),
     "Va en el centro de la bandera y reúne símbolos del país: el Chimborazo, el río Guayas, el sol y el cóndor."),
]


def nested_svg(path, x, y, width, height):
    """Inline an SVG file as a nested <svg> so it stays vector."""
    text = re.sub(r"<\?xml[^>]*\?>", "", path.read_text()).strip()
    root = re.match(r"<svg[^>]*>", text).group(0)
    source_width = re.search(r'width="([\d.]+)', root).group(1)
    source_height = re.search(r'height="([\d.]+)', root).group(1)
    attrs = re.sub(r'\s(width|height|x|y|viewBox)="[^"]*"', "", root[4:-1])
    return (f'<svg x="{x}" y="{y}" width="{width}" height="{height}" '
            f'viewBox="0 0 {source_width} {source_height}"{attrs}>' + text[len(root):])


def escape(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build(parts, prefix, artwork, source, place, size, label_x, title_size, text_size, line, wrap):
    """Write one SVG per part and return the card image data by card id."""
    width, height = size
    drawing = nested_svg(artwork, *place)
    scale = place[2] / float(re.search(r'width="([\d.]+)', artwork.read_text()).group(1))
    images = {}
    for card_id, key, title, (px, py), description in parts:
        x, y = place[0] + px * scale, place[1] + py * scale
        lines = textwrap.wrap(description, wrap)
        # The name sits next to the pointer unless the text would not fit below it.
        line_y = min(max(y, 40), height - (44 + (len(lines) - 1) * line) - 18)
        first = line_y + 44
        spans = "".join(f'<tspan x="{label_x}" y="{first + i * line:.1f}">{escape(text)}</tspan>'
                        for i, text in enumerate(lines))
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
<rect width="{width}" height="{height}" fill="#fff"/>
{drawing}
<polyline points="{x:.1f},{y:.1f} {label_x - 10},{line_y:.1f}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
<polyline points="{x:.1f},{y:.1f} {label_x - 10},{line_y:.1f}" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/>
<circle cx="{x:.1f}" cy="{y:.1f}" r="7" fill="#000" stroke="#fff" stroke-width="2"/>
<g font-family="Arial, Helvetica, sans-serif" fill="#000">
<text x="{label_x}" y="{line_y + 10:.1f}" font-size="{title_size}" font-weight="bold">{escape(title)}</text>
<text font-size="{text_size}">{spans}</text>
</g>
</svg>
'''
        name = f"{prefix}-{key}.svg"
        (IMAGES / name).write_text(svg)
        top = first - text_size
        bottom = first + (len(lines) - 1) * line + 8
        images[card_id] = {
            "src": f"images/{name}", "width": width, "height": height,
            "blocks": [{"x": (label_x - 6) / width, "y": (top - 6) / height,
                        "width": (width - label_x - 4) / width,
                        "height": (bottom - top + 10) / height, "active": True}],
            **source,
        }
    return images


def main():
    images = {}
    images.update(build(COAT_PARTS, "escudo", COAT_SVG, COAT_SOURCE, (20, 24, 560, 672), (960, 720),
                        label_x=600, title_size=28, text_size=22, line=28, wrap=30))
    images.update(build(FLAG_PARTS, "bandera", FLAG_SVG, FLAG_SOURCE, (20, 20, 520, 346.67), (960, 480),
                        label_x=566, title_size=30, text_size=26, line=32, wrap=28))
    data = json.loads(CARDS.read_text())
    for category in data["categories"]:
        for sub in category["subcategories"]:
            for card in sub["cards"]:
                if card["id"] in images:
                    card["image"] = images.pop(card["id"])
    if images:
        raise SystemExit(f"Cards not found: {sorted(images)}")
    CARDS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print(f"Built {len(COAT_PARTS) + len(FLAG_PARTS)} images")


if __name__ == "__main__":
    main()
