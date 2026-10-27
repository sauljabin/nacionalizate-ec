#!/usr/bin/env python3
"""Build the clickable province map used by «Mapa de provincias».

The source is assets/provinces-of-ecuador.svg, «Azuay in Ecuador» by
Milenioscuro on Wikimedia Commons (CC BY-SA 3.0):
https://commons.wikimedia.org/wiki/File:Azuay_in_Ecuador.svg

The script keeps the shapes, drops the editor metadata and inline styles,
rounds the coordinates and gives every province an id, so the page can color
it and react to clicks. The result keeps the CC BY-SA 3.0 license.

  python3 scripts/build_province_map.py
"""

import pathlib
import re
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "provinces-of-ecuador.svg"
OUTPUT = ROOT / "docs" / "images" / "mapa-provincias.svg"
SVG = "http://www.w3.org/2000/svg"

# Source path id -> province id (the same ids as PROVINCES in app.js).
PROVINCES = {
    "path27": "esmeraldas",
    "path33": "carchi",
    "path31": "imbabura",
    "path29": "pichincha",
    "path25": "santo-domingo-de-los-tsachilas",
    "path77": "manabi",
    "path9": "santa-elena",
    "path13": "guayas",
    "path19": "los-rios",
    "path23": "cotopaxi",
    "path21": "bolivar",
    "path43": "tungurahua",
    "path41": "chimborazo",
    "path51": "canar",
    "path49": "azuay",
    "path59": "el-oro",
    "path1009": "loja",
    "path1011": "zamora-chinchipe",
    "path1006": "morona-santiago",
    "path45": "pastaza",
    "path39": "napo",
    "path1003": "orellana",
    "path995": "sucumbios",
}
# The Galápagos inset: its sea and its islands answer as one province.
GALAPAGOS = {"path117", "path119", "path121", "path123"}

# Crops most of the open sea on the left.
VIEW_BOX = "90 0 1445.4 1653.6"


# Number of values each path command takes.
ARGS = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0}
TOKEN = re.compile(r"[MLHVCSQTAZmlhvcsqtaz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?")


def absolute(path_data):
    """Rewrites a path with absolute coordinates only, as (command, values) pairs.

    Rounding relative coordinates would add up the error along the outline.
    """
    tokens = TOKEN.findall(path_data)
    out = []
    x = y = start_x = start_y = 0.0
    command = None
    i = 0
    while i < len(tokens):
        if tokens[i].isalpha():
            command = tokens[i]
            i += 1
            if command in "Zz":
                out.append(("Z", []))
                x, y = start_x, start_y
                continue
        upper = command.upper()
        values = [float(token) for token in tokens[i:i + ARGS[upper]]]
        i += ARGS[upper]
        relative = command.islower()
        if upper == "H":
            x = values[0] + (x if relative else 0)
            out.append(("L", [x, y]))
        elif upper == "V":
            y = values[0] + (y if relative else 0)
            out.append(("L", [x, y]))
        elif upper == "A":
            end_x = values[5] + (x if relative else 0)
            end_y = values[6] + (y if relative else 0)
            out.append(("A", values[:5] + [end_x, end_y]))
            x, y = end_x, end_y
        else:
            points = [values[k] + ((x if k % 2 == 0 else y) if relative else 0) for k in range(len(values))]
            out.append((upper, points))
            x, y = points[-2], points[-1]
            if upper == "M":
                start_x, start_y = x, y
        # Extra coordinate pairs after a move are lines.
        if command in "Mm":
            command = "l" if relative else "L"
    return out


def rounded(path_data):
    """Absolute path in whole units, enough for a map drawn at most ~700 px wide.

    Lines that round to the point before are dropped, and a repeated command
    letter is left out, which keeps the file small.
    """
    parts = []
    previous_command = previous_point = None
    for command, values in absolute(path_data):
        values = [round(value) for value in values]
        point = tuple(values[-2:]) if values else None
        if command == "L" and point == previous_point:
            continue
        letter = "" if command == previous_command and command in "LC" else command
        parts.append(letter + " ".join(str(value) for value in values))
        previous_command, previous_point = command, point
    return " ".join(parts)


def role(element):
    """Classifies a source shape by its original colors."""
    style = (element.get("style") or "") + (element.get("fill") or "")
    if "#c6ecff" in style.lower():
        return "sea"
    if "#e0e0e0" in style.lower():
        return "abroad"
    if "#0978ab" in style:
        return "coast"
    # The Guayas–El Oro border is a line with a land fill: keep it as a line.
    if "fill:#fefee9" in style and "stroke:#646464" not in style:
        return "land"
    # Lines: the national border is drawn thicker than the provincial ones.
    return "border border-outer" if "stroke-width:4;" in style else "border"


def shape(element, cls, **attrs):
    path = ET.Element(f"{{{SVG}}}path", {"class": cls, "d": rounded(element.get("d")), **attrs})
    if element.get("transform"):
        path.set("transform", element.get("transform"))
    return path


def main():
    ET.register_namespace("", SVG)
    source = ET.parse(SOURCE).getroot()
    out = ET.Element(f"{{{SVG}}}svg", {"viewBox": VIEW_BOX, "class": "province-map"})
    galapagos = ET.Element(f"{{{SVG}}}g", {"class": "province", "data-province": "galapagos"})
    for element in source.iter(f"{{{SVG}}}path"):
        source_id = element.get("id")
        if source_id in GALAPAGOS:
            galapagos.append(shape(element, "inset-sea" if source_id == "path117" else "island"))
            if source_id == "path123":
                out.append(galapagos)
        elif source_id in PROVINCES:
            out.append(shape(element, "province", **{"data-province": PROVINCES[source_id]}))
        else:
            out.append(shape(element, role(element)))
    # Borders and coastline go on top so a highlighted province keeps its outline.
    lines = [child for child in out if child.get("class", "").startswith(("border", "coast"))]
    for child in lines:
        out.remove(child)
        child.set("vector-effect", "non-scaling-stroke")
        out.append(child)
    ET.indent(out, space="")
    OUTPUT.write_text(ET.tostring(out, encoding="unicode") + "\n")
    print(f"{OUTPUT.relative_to(ROOT)}: {OUTPUT.stat().st_size // 1024} kB")


if __name__ == "__main__":
    main()
