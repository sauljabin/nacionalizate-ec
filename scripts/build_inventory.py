#!/usr/bin/env python3
"""Build a read-only view of cards.json, for development only.

The page has two views:

- Preguntas: every question with its answer, explanation, popularity,
  recommended exams and image. It filters by text, topic, image and
  popularity, and sorts by popularity, so popularity values are easy to
  review before editing them in cards.json.
- Imágenes: one numbered box per answer photo, with its credit and license
  and the questions that use it. Image questions (escudo, bandera, capitals on
  the map) are left out. The numbers follow the order of cards.json, so they
  change when photos are added or removed.

Click any image to see it large. The page does not edit anything: change
cards.json by hand and build it again.

It is written to scripts/inventory.html, which git ignores. It is not part of
the site: nothing in docs/ links to it. Open it straight from disk.

  python3 scripts/build_inventory.py
"""

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
CARDS = ROOT / "docs" / "data" / "cards.json"
APP = ROOT / "docs" / "app.js"
OUTPUT = ROOT / "scripts" / "inventory.html"


def text(segments):
    return "".join(segment.get("text", "") for segment in segments or [])


def answer(card):
    if card["type"] == "choice":
        picks = card["answer"] if isinstance(card["answer"], list) else [card["answer"]]
        return " · ".join(card["options"][index] for index in picks)
    if card["type"] == "cloze":
        return " · ".join(s["text"] for s in card["front"] if s.get("cloze"))
    if card["type"] == "image":
        return "(en la imagen)"
    return text(card.get("back"))


def popular_min():
    for line in APP.read_text().splitlines():
        if line.startswith("const POPULAR_MIN"):
            return int(line.split("=")[1].strip(" ;"))
    return 2


def collect(data):
    exams = {}
    for exam in data.get("exams", []):
        for card_id in exam["ids"]:
            exams.setdefault(card_id, []).append(exam["title"])
    questions, photos = [], {}
    for category in data["categories"]:
        for sub in category["subcategories"]:
            for card in sub["cards"]:
                photo = card.get("photo")
                image = card.get("image")
                if photo and photo["src"] not in photos:
                    photos[photo["src"]] = len(photos) + 1
                questions.append({
                    "n": len(questions) + 1,
                    "id": card["id"],
                    "category": category["title"],
                    "topic": sub["title"],
                    "type": card["type"],
                    "question": text(card["front"]),
                    "options": card.get("options", []),
                    "answer": answer(card),
                    "explanation": card.get("explanation", ""),
                    "popularity": card.get("popularity", 0),
                    "exams": exams.get(card["id"], []),
                    "photo": photo,
                    "photoNumber": photos.get(photo["src"]) if photo else None,
                    "image": image["src"] if image else None,
                })
    return questions


PAGE = """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Inventario de preguntas</title>
<style>
  :root { --ink: #1f2430; --muted: #5b6170; --line: #d9d2c3; --soft: #ece6da; --card: #fffdf8; --bg: #f5f1ea; --green: #2f6b45; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.45 system-ui, sans-serif; }
  header { position: sticky; top: 0; z-index: 2; padding: 12px 16px; background: var(--bg); border-bottom: 1px solid var(--line); }
  h1 { margin: 0 0 8px; font-size: 20px; }
  .tabs { display: flex; gap: 6px; margin-bottom: 10px; }
  .tabs button { padding: 6px 14px; border: 1px solid var(--ink); border-radius: 999px; background: var(--card); font: inherit; font-weight: 600; cursor: pointer; }
  .tabs button[aria-pressed="true"] { background: var(--ink); color: #fff; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .filters input, .filters select { padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; background: #fff; font: inherit; }
  .filters input[type="search"] { flex: 1 1 220px; }
  .pops { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .pops button { min-width: 34px; padding: 4px 8px; border: 2px solid transparent; border-radius: 8px; font: inherit; font-weight: 700; cursor: pointer; opacity: .45; }
  .pops button[aria-pressed="true"] { opacity: 1; border-color: var(--ink); }
  .summary { margin: 8px 0 0; color: var(--muted); font-size: 13px; }
  main { padding: 16px; }
  .list { display: grid; gap: 10px; }
  .q { display: grid; grid-template-columns: 64px 1fr 140px; gap: 12px; padding: 12px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
  .pop { display: grid; place-items: center; align-content: center; gap: 4px; border-radius: 10px; color: #fff; font-weight: 800; }
  .pop b { font-size: 28px; line-height: 1; }
  .pop small { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
  .meta { font-size: 12px; color: var(--muted); }
  .meta code { cursor: copy; }
  .question { margin: 2px 0 4px; font-weight: 700; }
  .options { margin: 0 0 4px; padding-left: 18px; font-size: 14px; }
  .options li.right { color: var(--green); font-weight: 700; }
  .answer { color: var(--green); font-weight: 700; }
  .explanation { margin: 4px 0 0; padding: 6px 10px; background: #fcf0c8; border-left: 3px solid #e8b931; border-radius: 6px; font-size: 14px; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .tag { padding: 1px 8px; border-radius: 999px; background: var(--soft); font-size: 12px; }
  .thumb { width: 140px; height: 105px; object-fit: contain; background: #fff; border: 1px solid var(--line); border-radius: 8px; cursor: zoom-in; }
  .noimg { display: grid; place-items: center; width: 140px; height: 105px; border: 1px dashed var(--line); border-radius: 8px; color: var(--muted); font-size: 12px; }
  .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
  article { position: relative; padding: 12px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
  article .number { position: absolute; top: 8px; left: 8px; min-width: 32px; padding: 2px 8px; border-radius: 999px; background: var(--ink); color: #fff; font-weight: 700; text-align: center; }
  article img { display: block; width: 100%; height: 220px; object-fit: contain; background: #fff; border-radius: 8px; cursor: zoom-in; }
  article .file { margin: 8px 0 0; font: 12px ui-monospace, monospace; color: var(--muted); }
  article .alt { margin: 2px 0 0; font-weight: 600; }
  article .license { margin: 2px 0 8px; font-size: 13px; color: var(--muted); }
  article ol { margin: 0; padding: 8px 0 0 20px; border-top: 1px solid var(--soft); }
  article li { margin-bottom: 8px; }
  article .pop-inline { display: inline-block; min-width: 22px; margin-right: 4px; padding: 0 6px; border-radius: 6px; color: #fff; font-weight: 800; text-align: center; font-size: 12px; }
  dialog { max-width: min(96vw, 1200px); max-height: 96vh; padding: 12px; border: 0; border-radius: 12px; background: var(--card); }
  dialog::backdrop { background: rgb(0 0 0 / .75); }
  dialog img { display: block; max-width: 100%; max-height: calc(96vh - 80px); margin: 0 auto; background: #fff; cursor: zoom-out; }
  dialog p { margin: 8px 0 0; font-size: 14px; }
  [hidden] { display: none !important; }
  @media (max-width: 640px) { .q { grid-template-columns: 52px 1fr; } .q > :last-child { grid-column: 1 / -1; } }
</style>
</head>
<body>
<header>
  <h1>Inventario de preguntas <small class="meta">· solo para desarrollo, no se publica con la app</small></h1>
  <div class="tabs">
    <button type="button" data-view="questions" aria-pressed="true">Preguntas</button>
    <button type="button" data-view="photos" aria-pressed="false">Imágenes</button>
  </div>
  <div class="filters">
    <input type="search" id="q" placeholder="Buscar en pregunta, opciones, respuesta, explicación o id">
    <select id="topic"><option value="">Todos los temas</option></select>
    <select id="img">
      <option value="">Con o sin imagen</option>
      <option value="any">Con cualquier imagen</option>
      <option value="photo">Con imagen en la respuesta</option>
      <option value="image">Oclusión de imagen (parte tapada)</option>
      <option value="none">Sin imagen</option>
    </select>
    <select id="sort">
      <option value="file">Orden del archivo</option>
      <option value="pop-desc">Popularidad: mayor primero</option>
      <option value="pop-asc">Popularidad: menor primero</option>
    </select>
    <span class="pops" id="pops" aria-label="Popularidad"></span>
  </div>
  <p class="summary" id="summary"></p>
</header>
<main>
  <div class="list" id="questions"></div>
  <div class="photos" id="photos" hidden></div>
</main>
<dialog id="viewer"><img alt=""><p></p></dialog>
<script>
const QUESTIONS = __DATA__;
const POPULAR_MIN = __POPULAR_MIN__;
const MAX_POP = Math.max(...QUESTIONS.map((q) => q.popularity));
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();
// 0 is grey; then from pale to dark blue, so higher popularity stands out.
const popColor = (p) => p === 0 ? "#9aa0ab" : `hsl(214 70% ${Math.max(22, 62 - (p - 1) * 6)}%)`;
const imgOf = (q) => q.photo?.src || q.image;
const active = new Set();

for (const topic of [...new Set(QUESTIONS.map((q) => `${q.category} › ${q.topic}`))]) {
  $("topic").append(new Option(topic, topic));
}
const counts = {};
QUESTIONS.forEach((q) => { counts[q.popularity] = (counts[q.popularity] || 0) + 1; });
for (let p = 0; p <= MAX_POP; p++) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = p;
  b.title = `Popularidad ${p}: ${counts[p] || 0} preguntas`;
  b.style.background = popColor(p);
  b.style.color = "#fff";
  b.setAttribute("aria-pressed", "false");
  b.addEventListener("click", () => {
    active.has(p) ? active.delete(p) : active.add(p);
    b.setAttribute("aria-pressed", String(active.has(p)));
    render();
  });
  $("pops").append(b);
}

function matches(q) {
  const term = norm($("q").value.trim());
  if (term && !norm([q.id, q.question, q.options.join(" "), q.answer, q.explanation, q.topic, q.photo?.alt].join(" ")).includes(term)) return false;
  if ($("topic").value && `${q.category} › ${q.topic}` !== $("topic").value) return false;
  const img = $("img").value;
  if (img === "any" && !imgOf(q)) return false;
  if (img === "photo" && !q.photo) return false;
  if (img === "image" && !q.image) return false;
  if (img === "none" && imgOf(q)) return false;
  if (active.size && !active.has(q.popularity)) return false;
  return true;
}

function sorted(list) {
  const s = $("sort").value;
  if (s === "file") return list;
  return [...list].sort((a, b) => s === "pop-desc" ? b.popularity - a.popularity || a.n - b.n : a.popularity - b.popularity || a.n - b.n);
}

function questionHtml(q) {
  const right = new Set(q.answer.split(" · "));
  const options = q.options.length
    ? `<ol class="options">${q.options.map((o) => `<li class="${right.has(o) ? "right" : ""}">${esc(o)}</li>`).join("")}</ol>`
    : `<p class="answer">→ ${esc(q.answer)}</p>`;
  const src = imgOf(q);
  const caption = q.photo ? `${q.photoNumber}. ${q.photo.alt}` : "Oclusión de imagen";
  const picture = src
    ? `<img class="thumb" src="../docs/${esc(src)}" alt="${esc(caption)}" loading="lazy">`
    : `<div class="noimg">Sin imagen</div>`;
  const tags = [
    q.popularity >= POPULAR_MIN ? `<span class="tag">Entra al simulacro como popular</span>` : "",
    ...q.exams.map((e) => `<span class="tag">Examen: ${esc(e)}</span>`),
    q.photo ? `<span class="tag">Imagen #${q.photoNumber} · ${esc(q.photo.license)}</span>` : "",
  ].join("");
  return `<section class="q">
    <div class="pop" style="background:${popColor(q.popularity)}" title="popularity"><b>${q.popularity}</b><small>popular.</small></div>
    <div>
      <div class="meta">#${q.n} · ${esc(q.category)} › ${esc(q.topic)} · ${q.type} · <code title="Clic para copiar el id">${esc(q.id)}</code></div>
      <p class="question">${esc(q.question)}</p>
      ${options}
      ${q.explanation ? `<p class="explanation">${esc(q.explanation)}</p>` : ""}
      <div class="tags">${tags}</div>
    </div>
    ${picture}
  </section>`;
}

function photosHtml(list) {
  const groups = new Map();
  for (const q of list) {
    if (!q.photo) continue;
    if (!groups.has(q.photo.src)) groups.set(q.photo.src, { photo: q.photo, number: q.photoNumber, questions: [] });
    groups.get(q.photo.src).questions.push(q);
  }
  return [...groups.values()].sort((a, b) => a.number - b.number).map((g) => {
    const p = g.photo;
    const license = [p.title ? `«${esc(p.title)}»` : "", esc(p.credit), esc(p.license)].filter(Boolean).join(" · ");
    return `<article>
      <span class="number">${g.number}</span>
      <img src="../docs/${esc(p.src)}" alt="${esc(`${g.number}. ${p.alt}`)}" loading="lazy">
      <p class="file">${esc(p.src.replace("images/", ""))}</p>
      <p class="alt">${esc(p.alt)}</p>
      <p class="license">${license} · <a href="${esc(p.url)}">Commons</a></p>
      <ol>${g.questions.map((q) => `<li><span class="meta">${esc(q.category)} › ${esc(q.topic)}</span><br><span class="pop-inline" style="background:${popColor(q.popularity)}">${q.popularity}</span>${esc(q.question)}<br><span class="answer">→ ${esc(q.answer)}</span></li>`).join("")}</ol>
    </article>`;
  }).join("");
}

let view = "questions";
function render() {
  const list = sorted(QUESTIONS.filter(matches));
  $("questions").hidden = view !== "questions";
  $("photos").hidden = view !== "photos";
  if (view === "questions") {
    $("questions").innerHTML = list.map(questionHtml).join("");
    $("summary").textContent = `${list.length} de ${QUESTIONS.length} preguntas · ${list.filter(imgOf).length} con imagen · popularidad ≥ ${POPULAR_MIN} entra al simulacro como popular`;
  } else {
    $("photos").innerHTML = photosHtml(list);
    const n = new Set(list.filter((q) => q.photo).map((q) => q.photo.src)).size;
    $("summary").textContent = `${n} imágenes en ${list.filter((q) => q.photo).length} preguntas (con los filtros actuales)`;
  }
}

for (const id of ["q", "topic", "img", "sort"]) $(id).addEventListener("input", render);
document.querySelector(".tabs").addEventListener("click", (event) => {
  const b = event.target.closest("button");
  if (!b) return;
  view = b.dataset.view;
  document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  render();
});

const viewer = $("viewer");
document.querySelector("main").addEventListener("click", (event) => {
  const code = event.target.closest(".meta code");
  if (code) { navigator.clipboard?.writeText(code.textContent); code.style.background = "#d8f0df"; return; }
  const img = event.target.closest("img");
  if (!img) return;
  viewer.querySelector("img").src = img.src;
  viewer.querySelector("p").textContent = img.alt;
  viewer.showModal();
});
viewer.addEventListener("click", () => viewer.close());
render();
</script>
</body>
</html>
"""


def main():
    questions = collect(json.loads(CARDS.read_text()))
    data = json.dumps(questions, ensure_ascii=False).replace("</", "<\\/")
    OUTPUT.write_text(PAGE.replace("__DATA__", data).replace("__POPULAR_MIN__", str(popular_min())))
    photos = len({q["photo"]["src"] for q in questions if q["photo"]})
    print(f"{OUTPUT.relative_to(ROOT)}: {len(questions)} questions, {photos} photos")


if __name__ == "__main__":
    main()
