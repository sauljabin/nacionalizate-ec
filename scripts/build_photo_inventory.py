#!/usr/bin/env python3
"""Build a numbered inventory of the answer photos, for development only.

Every photo that cards.json attaches to a question (the `photo` field) gets a
numbered box with the image, its credit and license, and the questions that
use it with their answers. Image questions (escudo, bandera, capitals on the
map) are left out. The numbers follow the order of cards.json, so they change
when photos are added or removed.

The page is written to scripts/photo-inventory.html, which git ignores. It is
not part of the site: nothing in docs/ links to it. Open it straight from
disk after building it.

  python3 scripts/build_photo_inventory.py
"""

import html
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
CARDS = ROOT / "docs" / "data" / "cards.json"
OUTPUT = ROOT / "scripts" / "photo-inventory.html"


def text(segments):
    return "".join(segment.get("text", "") for segment in segments or [])


def answer(card):
    if card["type"] == "choice":
        picks = card["answer"] if isinstance(card["answer"], list) else [card["answer"]]
        return " · ".join(card["options"][index] for index in picks)
    return text(card.get("back"))


def collect(data):
    photos = {}
    for category in data["categories"]:
        for sub in category["subcategories"]:
            for card in sub["cards"]:
                photo = card.get("photo")
                if not photo:
                    continue
                entry = photos.setdefault(photo["src"], {"photo": photo, "questions": []})
                entry["questions"].append({
                    "topic": f'{category["title"]} › {sub["title"]}',
                    "question": text(card["front"]),
                    "answer": answer(card),
                })
    return list(photos.values())


def box(number, entry):
    e = html.escape
    photo = entry["photo"]
    license_line = " · ".join(e(part) for part in (photo.get("credit"), photo.get("license")) if part)
    if photo.get("url"):
        license_line += f' · <a href="{e(photo["url"])}">Commons</a>'
    questions = "".join(
        f'<li><span class="topic">{e(q["topic"])}</span>{e(q["question"])}'
        f'<span class="answer">→ {e(q["answer"])}</span></li>'
        for q in entry["questions"]
    )
    return f"""<article id="{number}">
  <span class="number">{number}</span>
  <img src="../docs/{e(photo["src"])}" alt="{e(photo.get("alt", ""))}" loading="lazy">
  <p class="file">{e(photo["src"].removeprefix("images/"))}</p>
  <p class="alt">{e(photo.get("alt", ""))}</p>
  <p class="license">{license_line or "Sin licencia"}</p>
  <ol>{questions}</ol>
</article>"""


def main():
    entries = collect(json.loads(CARDS.read_text()))
    count = sum(len(entry["questions"]) for entry in entries)
    boxes = "\n".join(box(number, entry) for number, entry in enumerate(entries, 1))
    OUTPUT.write_text(f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Inventario de fotos</title>
<style>
  body {{ margin: 0; padding: 24px 16px; background: #f5f1ea; color: #1f2430; font: 15px/1.45 system-ui, sans-serif; }}
  h1 {{ margin: 0 0 4px; font-size: 24px; }}
  .summary {{ margin: 0 0 24px; color: #5b6170; }}
  main {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }}
  article {{ position: relative; background: #fffdf8; border: 1px solid #d9d2c3; border-radius: 12px; padding: 12px; }}
  .number {{ position: absolute; top: 8px; left: 8px; min-width: 32px; padding: 2px 8px; border-radius: 999px; background: #1f2430; color: #fff; font-weight: 700; text-align: center; }}
  img {{ display: block; width: 100%; height: 220px; object-fit: contain; background: #ece6da; border-radius: 8px; }}
  .file {{ margin: 8px 0 0; font: 12px ui-monospace, monospace; color: #5b6170; }}
  .alt {{ margin: 2px 0 0; font-weight: 600; }}
  .license {{ margin: 2px 0 8px; font-size: 13px; color: #5b6170; }}
  ol {{ margin: 0; padding: 8px 0 0 20px; border-top: 1px solid #ece6da; }}
  li {{ margin-bottom: 8px; }}
  .topic {{ display: block; font-size: 12px; color: #5b6170; }}
  .answer {{ display: block; color: #2f6b45; font-weight: 600; }}
</style>
</head>
<body>
<h1>Inventario de fotos</h1>
<p class="summary">{len(entries)} fotos en {count} preguntas. Solo para desarrollo: no se publica con la app.</p>
<main>
{boxes}
</main>
</body>
</html>
""")
    print(f"{OUTPUT.relative_to(ROOT)}: {len(entries)} photos, {count} questions")


if __name__ == "__main__":
    main()
