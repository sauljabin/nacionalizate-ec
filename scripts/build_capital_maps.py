#!/usr/bin/env python3
"""Build the maps for "Capitales en el mapa".

Each map is docs/images/mapa-provincias.svg (from «Azuay in Ecuador», by
Milenioscuro, CC BY-SA 3.0) with one province in red, a pointer to it, the
province's name and its capital. The script also updates those cards in
docs/data/cards.json: the image, the mask that hides the capital and the
credit. The maps keep the CC BY-SA 3.0 license.

Names and capitals come from PROVINCES in docs/app.js. To move a pointer,
edit POINTS and run:

  python3 scripts/build_capital_maps.py
"""

import json
import pathlib
import re
import textwrap
from xml.sax.saxutils import escape

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMAGES = ROOT / "docs" / "images"
CARDS = ROOT / "docs" / "data" / "cards.json"
APP = ROOT / "docs" / "app.js"
MAP = IMAGES / "mapa-provincias.svg"

SOURCE = {"title": "Azuay in Ecuador", "credit": "Milenioscuro", "license": "CC BY-SA 3.0",
          "url": "https://commons.wikimedia.org/wiki/File:Azuay_in_Ecuador.svg"}

# Province id -> card id in "Capitales en el mapa".
CARDS_BY_PROVINCE = {
    "carchi": "BjzxH4m0vejdtk7LD.6159555822361691",
    "imbabura": "3A5o8GQ2Wj41spdEi.41754954647800036",
    "pichincha": "mPxaO0lJ4EM0YxDBn.1469644241468675",
    "cotopaxi": "VRgaWcym7m482Yfde.6588172467288091",
    "bolivar": "LM4fEdLMuaBwxE8U8.6736362743611011",
    "tungurahua": "0m4JC0VfumhOjy7wn.7579381501414596",
    "chimborazo": "sG4F4p57DP8egwfRp.9598310167834113",
    "canar": "oFI3ay6GfV2nnECJQ.9466517446437006",
    "azuay": "Sf901dWkh5V8D3FJq.8592505994334363",
    "loja": "F5LNEf0JmHWEe7XEO.9377448717212984",
    "esmeraldas": "q5OJ3JzdyD7j4IuZi.3249179628996083",
    "manabi": "0WIkYm7A9zm5s6oG8.19140185549685262",
    "santo-domingo-de-los-tsachilas": "Dv3s6WS9MUq4auedZ.41175205106345114",
    "los-rios": "EDuA7y1G5YJZPIoKT.7993762771068855",
    "guayas": "mVn9InH3IaayeXcGr.8110910725157552",
    "santa-elena": "VkyjJMqrX8p5iyqRF.462796658451074",
    "el-oro": "NiH5KgH2895efitqW.18436624351577213",
    "sucumbios": "xVtwmJFcpn7IJmLup.564186647151315",
    "orellana": "LN8KtEsJ1uc6r939R.11947980813779102",
    "napo": "4rcI3thWOHV7Ox68d.23377090543032997",
    "pastaza": "eV50v1HkoWw8hEPTy.27534453150609617",
    "morona-santiago": "aJsL6HQzVjIvmYZgu.14413047043238392",
    "zamora-chinchipe": "IVXVkM2UCSDtVXWsO.4994967866352401",
    "galapagos": "UEvsA9cu758dYjAJR.7118108348071839",
}

# A point well inside each province, in the coordinates of mapa-provincias.svg.
POINTS = {
    "carchi": (841, 241), "imbabura": (746, 318), "pichincha": (703, 433),
    "cotopaxi": (628, 602), "bolivar": (577, 748), "tungurahua": (720, 709),
    "chimborazo": (645, 897), "canar": (584, 1000), "azuay": (511, 1129),
    "loja": (464, 1384), "esmeraldas": (570, 230), "manabi": (330, 550),
    "santo-domingo-de-los-tsachilas": (542, 466), "los-rios": (469, 762),
    "guayas": (332, 886), "santa-elena": (218, 915), "el-oro": (394, 1243),
    "sucumbios": (1284, 450), "orellana": (1236, 585), "napo": (853, 570),
    "pastaza": (1085, 799), "morona-santiago": (807, 999),
    "zamora-chinchipe": (617, 1364), "galapagos": (1183, 1528),
}

# The map's viewBox starts at x=90; the labels go to its right.
MAP_X, HEIGHT = 90, 1653.6
WIDTH = 2350
LABEL_X = 1490
TITLE_SIZE, TEXT_SIZE, LINE = 84, 72, 100
STYLE = """
.abroad { fill: #efe8da; }
.sea, .inset-sea { fill: #dde5ec; }
.inset-sea { stroke: #1b2330; stroke-width: 2px; }
path.province, .island { fill: #fffdf8; }
path.target, .target .island { fill: #b3261e; }
.border { fill: none; stroke: #5d6573; stroke-width: 1px; stroke-linejoin: round; }
.border-outer { stroke: #1b2330; stroke-width: 1.5px; }
.coast { fill: none; stroke: #6c95c5; stroke-width: 1px; }
"""


def provinces():
    found = re.findall(r'\{ id: "([^"]+)", name: "([^"]+)", capital: "([^"]+)"', APP.read_text())
    return {pid: (name, capital) for pid, name, capital in found}


def build(pid, name, capital, body):
    # The map's own drawing, with the province marked as the target.
    marked = re.sub(rf'class="province"([^>]*data-province="{pid}")', r'class="province target"\1', body)
    if marked == body:
        raise SystemExit(f"Province not in the map: {pid}")
    x, y = POINTS[pid]
    x -= MAP_X
    titles = textwrap.wrap(name, 17)
    height = len(titles) * LINE + LINE
    top = min(max(y - TITLE_SIZE, 40), HEIGHT - height - 40)
    line_y = top + TITLE_SIZE * 0.65
    title = "".join(f'<tspan x="{LABEL_X}" y="{top + TITLE_SIZE + i * LINE:.1f}">{escape(t)}</tspan>'
                    for i, t in enumerate(titles))
    capital_y = top + TITLE_SIZE + len(titles) * LINE
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">
<style>{STYLE}</style>
<rect width="{WIDTH}" height="{HEIGHT}" fill="#fff"/>
<g transform="translate({-MAP_X} 0)">
{marked}
</g>
<polyline points="{x},{y} {LABEL_X - 20},{line_y:.1f}" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/>
<polyline points="{x},{y} {LABEL_X - 20},{line_y:.1f}" fill="none" stroke="#1b2330" stroke-width="4" stroke-linecap="round"/>
<circle cx="{x}" cy="{y}" r="11" fill="#1b2330" stroke="#fff" stroke-width="3"/>
<g font-family="Arial, Helvetica, sans-serif" fill="#1b2330">
<text font-size="{TITLE_SIZE}" font-weight="bold">{title}</text>
<text x="{LABEL_X}" y="{capital_y:.1f}" font-size="{TEXT_SIZE}">{escape(capital)}</text>
</g>
</svg>
'''
    name_file = f"capital-{pid}.svg"
    (IMAGES / name_file).write_text(svg)
    mask_top = capital_y - TEXT_SIZE
    return {
        "src": f"images/{name_file}", "width": WIDTH, "height": HEIGHT,
        "blocks": [{"x": (LABEL_X - 10) / WIDTH, "y": (mask_top - 6) / HEIGHT,
                    "width": (WIDTH - LABEL_X - 10) / WIDTH,
                    "height": (TEXT_SIZE + 26) / HEIGHT, "active": True}],
        **SOURCE,
    }


def main():
    source = MAP.read_text()
    body = source[source.index(">", source.index("<svg")) + 1:source.rindex("</svg>")].strip()
    names = provinces()
    images = {CARDS_BY_PROVINCE[pid]: build(pid, *names[pid], body) for pid in CARDS_BY_PROVINCE}
    data = json.loads(CARDS.read_text())
    for category in data["categories"]:
        for sub in category["subcategories"]:
            for card in sub["cards"]:
                if card["id"] in images:
                    card["image"] = images.pop(card["id"])
    if images:
        raise SystemExit(f"Cards not found: {sorted(images)}")
    CARDS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print(f"Built {len(CARDS_BY_PROVINCE)} maps")


if __name__ == "__main__":
    main()
