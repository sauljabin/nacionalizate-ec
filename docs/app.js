"use strict";

// Static practice exam. Questions come from data/cards.json.

const REPO_URL = "https://github.com/sauljabin/examen-de-nacionalidad-ecuatoriana";
const DEFAULT_SETTINGS = { fontSize: "m", theme: "auto", spacing: "normal", contrast: "", motion: "", combo: "" };

const app = document.getElementById("app");
const root = document.documentElement;

const state = {
  categories: [],
  selected: new Set(), // "<categoryId>/<subcategoryId>"
  queue: [],
  index: 0,
  missed: [],
  revealed: false,
  cardsById: new Map(),
  cardsByCode: new Map(),
  // Preloaded exams ("exams" in cards.json): the questions repeated most often.
  featuredExams: [],
  // Where "Salir" and the result screen go back to.
  exit: { back: showHome, label: "Volver al inicio" },
  print: { cards: [], title: "" },
};

// Helpers --------------------------------------------------------------------

function cloneTemplate(id) {
  return document.getElementById(id).content.cloneNode(true);
}

// Every new screen starts at the top, so a long page such as the result
// doesn't leave the next one scrolled halfway down.
function showScreen(templateId) {
  app.replaceChildren(cloneTemplate(templateId));
  window.scrollTo({ top: 0, behavior: "instant" });
}

// Redraws the screen that is already open without moving the page.
function redraw(show) {
  const top = window.scrollY;
  show();
  window.scrollTo({ top, behavior: "instant" });
}

// Random order where items with more weight tend to come first
// (Efraimidis–Spirakis weighted sampling).
function weightedShuffle(items, weight) {
  return items
    .map((item) => ({ item, key: Math.random() ** (1 / weight(item)) }))
    .sort((a, b) => b.key - a.key)
    .map(({ item }) => item);
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function plainText(segments) {
  return (segments || []).map((segment) => segment.text).join("");
}

function issueUrl(template, fields = {}) {
  const params = new URLSearchParams({ template, ...fields });
  return `${REPO_URL}/issues/new?${params}`;
}

function storage(action, value) {
  try {
    if (action === "read") return JSON.parse(localStorage.getItem("settings") || "{}");
    localStorage.setItem("settings", JSON.stringify(value));
  } catch {
    return {};
  }
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function askConfirm({ title, text, ok, cancel = "Cancelar" }) {
  const dialog = document.getElementById("confirm-dialog");
  dialog.querySelector("h2").textContent = title;
  dialog.querySelector(".confirm-text").textContent = text;
  dialog.querySelector(".confirm-ok").textContent = ok;
  dialog.querySelector(".confirm-cancel").textContent = cancel;
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), { once: true });
  });
}

// Saved lists ----------------------------------------------------------------

// Kept only in this browser, by card id: questions answered wrong (missed),
// questions the person marked (marked), saved exams (exams), the exam being
// built (draft), the last result of each question (results), the days with
// practice (days), totals (stats), unlocked achievements (achievements), the
// daily goal (goal), today's answers (today), the days the goal was met
// (goalDays), the review schedule of each question (srs), the answers
// given each day (activity, "YYYY-MM-DD": count) for the activity calendar
// and every finished mock exam (mocks).
const progress = readProgress();

function emptyProgress() {
  return {
    missed: [], marked: [], exams: [], draft: { title: "", ids: [] },
    results: {}, days: [], stats: {}, achievements: {},
    goal: 20, today: { day: "", count: 0 }, goalDays: [], srs: {}, activity: {}, mocks: [],
  };
}

// Fills in missing fields and drops values of the wrong type, so an old or
// hand-edited copy cannot break the page.
function withDefaults(saved) {
  const result = emptyProgress();
  for (const [key, value] of Object.entries(saved || {})) {
    if (!(key in result)) continue;
    const fallback = result[key];
    if (Array.isArray(fallback) ? Array.isArray(value) : typeof value === typeof fallback && value !== null) {
      result[key] = value;
    }
  }
  return result;
}

function readProgress() {
  try {
    return withDefaults(JSON.parse(localStorage.getItem("progress") || "{}"));
  } catch {
    return emptyProgress();
  }
}

function saveProgress() {
  try {
    localStorage.setItem("progress", JSON.stringify(progress));
  } catch {}
}

function setInList(list, id, on) {
  const at = list.indexOf(id);
  if (on && at === -1) list.push(id);
  else if (!on && at !== -1) list.splice(at, 1);
  else return;
  saveProgress();
}

// Questions removed from cards.json after they were saved are skipped.
function cardsFromIds(ids) {
  return ids.map((id) => state.cardsById.get(id)).filter(Boolean);
}

function sameIds(a, b) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function findSavedExam(ids) {
  return progress.exams.find((exam) => sameIds(exam.ids, ids));
}

function findFeaturedExam(ids) {
  return state.featuredExams.find((exam) => sameIds(exam.ids, ids));
}

// Updates the exam with this id, or the one with the same questions, or adds a new one.
function saveExam({ id, title, ids }) {
  let exam = progress.exams.find((item) => item.id === id) || findSavedExam(ids);
  if (!exam) {
    exam = { id: Date.now().toString(36) };
    progress.exams.unshift(exam);
  }
  exam.title = title || exam.title || `Examen ${progress.exams.length}`;
  exam.ids = [...ids];
  saveProgress();
  return exam;
}

function openSavedExam(exam) {
  showShared({ cards: cardsFromIds(exam.ids), title: exam.title });
}

const BOOKMARK_ICON = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>';

function markButton(card) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost mark";
  button.innerHTML = `${BOOKMARK_ICON}<span></span>`;
  const sync = () => {
    const marked = progress.marked.includes(card.id);
    button.setAttribute("aria-pressed", String(marked));
    button.querySelector("span").textContent = marked ? "Marcada" : "Marcar";
  };
  button.addEventListener("click", () => {
    setInList(progress.marked, card.id, !progress.marked.includes(card.id));
    sync();
  });
  sync();
  return button;
}

// Accessibility settings -----------------------------------------------------

function currentSettings() {
  return { ...DEFAULT_SETTINGS, ...storage("read") };
}

function applySettings(settings) {
  for (const [key, value] of Object.entries(settings)) {
    if (value && value !== DEFAULT_SETTINGS[key]) root.dataset[key] = value;
    else delete root.dataset[key];
  }
  const changed = Object.fromEntries(
    Object.entries(settings).filter(([key, value]) => value !== DEFAULT_SETTINGS[key]),
  );
  storage("write", changed);
}

function syncSettingsForm(settings) {
  const form = document.querySelector("#settings form");
  for (const input of form.querySelectorAll("input[type=radio]")) {
    input.checked = settings[input.name] === input.value;
  }
  for (const input of form.querySelectorAll("input[type=checkbox]")) {
    input.checked = settings[input.dataset.setting] === input.value;
  }
}

function setupSettings() {
  const dialog = document.getElementById("settings");
  const form = dialog.querySelector("form");
  document.getElementById("open-settings").addEventListener("click", () => {
    syncSettingsForm(currentSettings());
    dialog.showModal();
  });
  form.addEventListener("change", (event) => {
    const input = event.target;
    const settings = currentSettings();
    if (input.type === "radio") settings[input.name] = input.value;
    else settings[input.dataset.setting] = input.checked ? input.value : "";
    applySettings(settings);
  });
  document.getElementById("reset-settings").addEventListener("click", () => {
    applySettings(DEFAULT_SETTINGS);
    syncSettingsForm(DEFAULT_SETTINGS);
  });
}

// Rich text ------------------------------------------------------------------

function renderSegments(segments, { revealCloze }) {
  const fragment = document.createDocumentFragment();
  for (const segment of segments || []) {
    let node;
    if (segment.cloze) {
      node = document.createElement("mark");
      node.className = revealCloze ? "cloze revealed" : "cloze";
      node.textContent = revealCloze ? segment.text : "?";
      if (!revealCloze) node.setAttribute("aria-label", "texto oculto");
    } else if (segment.bold || segment.color) {
      node = document.createElement(segment.bold ? "strong" : "span");
      node.textContent = segment.text;
    } else {
      node = document.createTextNode(segment.text);
    }
    if (segment.color && node.nodeType === Node.ELEMENT_NODE) {
      node.classList.add(`color-${segment.color}`);
    }
    fragment.append(node);
  }
  return fragment;
}

function renderImage(image, { revealed }) {
  const figure = document.createElement("figure");
  figure.className = "occlusion";
  if (image.width && image.height) {
    figure.style.aspectRatio = `${image.width} / ${image.height}`;
  }
  const img = document.createElement("img");
  img.src = image.src;
  img.alt = revealed
    ? "Imagen con la respuesta visible"
    : "Imagen con una parte tapada: ¿qué hay debajo del recuadro marcado?";
  figure.append(img);
  for (const block of image.blocks) {
    if (revealed && block.active) continue;
    const mask = document.createElement("div");
    mask.className = block.active ? "mask active" : "mask";
    mask.setAttribute("aria-hidden", "true");
    Object.assign(mask.style, {
      left: `${block.x * 100}%`,
      top: `${block.y * 100}%`,
      width: `${block.width * 100}%`,
      height: `${block.height * 100}%`,
    });
    if (block.active) {
      const mark = document.createElement("span");
      mark.textContent = "?";
      mask.append(mark);
    }
    figure.append(mask);
  }
  return figure;
}

function renderPhoto(photo) {
  const figure = document.createElement("figure");
  figure.className = "photo";
  const img = document.createElement("img");
  img.src = photo.src;
  img.alt = photo.alt;
  const caption = document.createElement("figcaption");
  const source = document.createElement("a");
  source.href = photo.url;
  source.target = "_blank";
  source.rel = "noopener";
  source.textContent = "Wikimedia Commons";
  caption.append(`${photo.alt}. Foto: ${photo.credit} · ${photo.license} · `, source);
  figure.append(img, caption);
  return figure;
}

// Search ---------------------------------------------------------------------

const SEARCH_LIMIT = 50;

// Lowercase without accents, so "ecuador" matches "Ecuador" and "region" matches "región".
function normalize(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function searchableText(card) {
  return normalize([
    plainText(card.front),
    plainText(card.back),
    // Only the right options: wrong ones would make unrelated questions match.
    card.type === "choice" ? correctAnswerText(card) : "",
    card.explanation || "",
    card.subcategory,
    card.topic || "",
  ].join(" "));
}

// "action" is the button shown next to the topic: mark, add or remove.
function renderSearchResult(card, action) {
  const item = document.createElement("li");
  const head = document.createElement("div");
  head.className = "result-head";
  const crumbs = document.createElement("p");
  crumbs.className = "result-crumbs";
  crumbs.textContent = [card.category, card.subcategory, card.topic].filter(Boolean).join(" › ");
  head.append(crumbs, action);
  item.append(head);
  if (card.front?.length) {
    const question = document.createElement("p");
    question.className = "result-question";
    question.append(renderSegments(card.front, { revealCloze: true }));
    item.append(question);
  }
  if (card.image) item.append(renderImage(card.image, { revealed: true }));
  if (card.type === "basic" || card.type === "choice") {
    const answer = document.createElement("p");
    answer.className = "result-answer";
    if (card.type === "choice") answer.textContent = correctAnswerText(card);
    else answer.append(renderSegments(card.back, { revealCloze: true }));
    item.append(answer);
  }
  if (card.explanation) item.append(renderExplanation(card.explanation));
  return item;
}

// Shows the matches inside "container", which holds .search-status and .search-results.
function runSearch(container, query, renderItem) {
  const status = container.querySelector(".search-status");
  const list = container.querySelector(".search-results");
  const words = normalize(query).split(/\s+/).filter(Boolean);
  list.replaceChildren();
  if (!words.length || words.join("").length < 2) {
    status.textContent = "";
    return;
  }
  const matches = state.allCards.filter((card) => {
    const text = searchableText(card);
    return words.every((word) => text.includes(word));
  });
  if (!matches.length) {
    status.textContent = "No hay preguntas con esas palabras.";
  } else if (matches.length > SEARCH_LIMIT) {
    status.textContent = `${matches.length} preguntas encontradas. Se muestran las primeras ${SEARCH_LIMIT}; escribe más palabras para afinar la búsqueda.`;
  } else {
    status.textContent = `${matches.length} ${matches.length === 1 ? "pregunta encontrada" : "preguntas encontradas"}.`;
  }
  list.append(...matches.slice(0, SEARCH_LIMIT).map(renderItem));
}

function cardSummary(card) {
  const text = plainText(card.front).replace(/\s+/g, " ").trim();
  return card.type === "image" ? `${text} (imagen de ${card.subcategory})` : text;
}

// Home -----------------------------------------------------------------------

function subcategoryKey(category, subcategory) {
  return `${category.id}/${subcategory.id}`;
}

function selectedCards() {
  return state.categories.flatMap((category) =>
    category.subcategories
      .filter((sub) => state.selected.has(subcategoryKey(category, sub)))
      .flatMap((sub) => sub.cards),
  );
}

function showHome() {
  // Leaving a shared exam: drop its link from the address bar.
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  showScreen("home-template");
  setupInstall();
  setupPractice();
  let searchTimer;
  app.querySelector("#search").addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(
      app.querySelector(".search"),
      event.target.value,
      (card) => renderSearchResult(card, markButton(card)),
    ), 150);
  });
}

// Practice by topics ---------------------------------------------------------

// "Por temas" and "Modo estudio" share this screen; state.topicsMode says
// which one is open.
function showTopics() {
  showScreen("topics-template");
  app.querySelector(".back-home").addEventListener("click", showHome);
  if (state.topicsMode === "study") {
    app.querySelector(".topics-intro .eyebrow").textContent = "Modo estudio";
    app.querySelector(".topics-intro h1").textContent = "Elige qué estudiar";
    app.querySelector(".topics-intro .lead").textContent =
      "Verás cada pregunta ya con su respuesta, sin calificación. Marca categorías completas o solo algunos subtemas.";
  }
  app.querySelector("#question-count").value = state.topicCount || "20";
  app.querySelector("#shuffle").checked = state.topicShuffle ?? true;
  const list = app.querySelector("#categories");
  state.categories.forEach((category, position) => {
    const node = cloneTemplate("category-template");
    const article = node.querySelector(".category");
    const total = category.subcategories.reduce((sum, sub) => sum + sub.cards.length, 0);
    article.dataset.category = category.id;
    node.querySelector(".index").textContent = String(position + 1).padStart(2, "0");
    node.querySelector(".name").textContent = category.title;
    node.querySelector(".count").textContent = `${total} preguntas`;
    const chips = node.querySelector(".chips");
    for (const sub of category.subcategories) {
      const chip = document.createElement("label");
      chip.className = "chip";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = subcategoryKey(category, sub);
      input.checked = state.selected.has(input.value);
      const title = document.createElement("span");
      title.textContent = sub.title;
      const count = document.createElement("small");
      count.textContent = sub.cards.length;
      chip.append(input, title, count);
      chips.append(chip);
    }
    list.append(node);
  });

  list.addEventListener("change", (event) => {
    const input = event.target;
    const article = input.closest(".category");
    if (input.classList.contains("category-check")) {
      for (const chip of article.querySelectorAll(".chip input")) {
        chip.checked = input.checked;
        toggleSelection(chip.value, input.checked);
      }
    } else {
      toggleSelection(input.value, input.checked);
    }
    updateTopics();
  });
  for (const button of app.querySelectorAll("[data-select]")) {
    button.addEventListener("click", () => {
      const all = button.dataset.select === "all";
      for (const chip of list.querySelectorAll(".chip input")) {
        chip.checked = all;
        toggleSelection(chip.value, all);
      }
      updateTopics();
    });
  }
  app.querySelector("#print").addEventListener("click", () => openPrintDialog(selectedCards()));
  app.querySelector(".share-topics").addEventListener("click", shareTopics);
  app.querySelector("#shuffle").addEventListener("change", (event) => {
    state.topicShuffle = event.target.checked;
  });
  app.querySelector("#start").addEventListener("click", () => {
    const cards = selectedCards();
    if (!cards.length) return;
    const ordered = app.querySelector("#shuffle").checked ? shuffle(cards) : cards;
    const count = app.querySelector("#question-count").value;
    const chosen = count === "all" ? ordered : ordered.slice(0, Number(count));
    if (state.topicsMode === "study") startStudy(chosen);
    else startExam(chosen, { exit: { back: showTopics, label: "Volver a los temas" } });
  });
  updateTopics();
  app.focus({ preventScroll: true });
}

function toggleSelection(key, on) {
  if (on) state.selected.add(key);
  else state.selected.delete(key);
}

// "#temas=" lists whole categories by id and single subtopics as
// "<category>/<subcategory>", separated by commas.
function topicsLink() {
  const parts = [];
  for (const category of state.categories) {
    const keys = category.subcategories
      .map((sub) => subcategoryKey(category, sub))
      .filter((key) => state.selected.has(key));
    if (keys.length === category.subcategories.length) parts.push(category.id);
    else parts.push(...keys);
  }
  return `${location.origin}${location.pathname}#temas=${parts.join(",")}`;
}

function topicsFromHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const topics = params.get("temas");
  if (topics === null) return null;
  const wanted = new Set(topics.split(","));
  const keys = state.categories.flatMap((category) => category.subcategories
    .map((sub) => subcategoryKey(category, sub))
    .filter((key) => wanted.has(category.id) || wanted.has(key)));
  return keys;
}

// Phones and tablets open the system share sheet (WhatsApp, copy and so on);
// computers copy the link. Returns "copied", "failed" or null after sharing.
const nativeShare = Boolean(navigator.share) && matchMedia("(pointer: coarse)").matches;

async function shareLink(link, title) {
  if (nativeShare) {
    try {
      await navigator.share({ title, url: link });
    } catch {}
    return null;
  }
  try {
    await navigator.clipboard.writeText(link);
    return "copied";
  } catch {
    return "failed";
  }
}

async function shareTopics() {
  const status = app.querySelector(".topics-status");
  const link = topicsLink();
  const result = await shareLink(link, "Temas para practicar");
  if (result === "copied") status.textContent = "Enlace copiado: quien lo abra verá estos mismos temas marcados.";
  else if (result === "failed") status.textContent = link;
}

function showSharedTopics(keys) {
  state.selected = new Set(keys);
  history.replaceState(null, "", location.pathname + location.search);
  showTopics();
  app.querySelector(".topics-status").textContent = keys.length
    ? `Abriste un enlace con ${plural(keys.length, "subtema marcado", "subtemas marcados")}.`
    : "El enlace no tiene temas válidos; elige los que quieras.";
}

function updateTopics() {
  for (const article of app.querySelectorAll(".category")) {
    const chips = [...article.querySelectorAll(".chip input")];
    const checked = chips.filter((chip) => chip.checked).length;
    const box = article.querySelector(".category-check");
    box.checked = checked === chips.length;
    box.indeterminate = checked > 0 && checked < chips.length;
    article.classList.toggle("is-selected", checked > 0);
  }
  const available = selectedCards().length;
  const count = app.querySelector("#question-count").value;
  const total = count === "all" ? available : Math.min(available, Number(count));
  const start = app.querySelector("#start");
  start.disabled = available === 0;
  app.querySelector("#print").disabled = available === 0;
  start.textContent = available
    ? `${state.topicsMode === "study" ? "Estudiar" : "Comenzar"} · ${plural(total, "pregunta", "preguntas")}`
    : "Elige al menos un tema";
  app.querySelector("#question-count").onchange = (event) => {
    state.topicCount = event.target.value;
    updateTopics();
  };
}

// Practice modes -------------------------------------------------------------

// The real exam has 30 questions and is passed with 90 % (27 right answers),
// per article 67 of the Reglamento a la Ley Orgánica de Movilidad Humana.
const MOCK_SIZE = 30;
const MOCK_PASS = 27;
// Half of each mock exam comes from the questions that come up most
// ("popularity" in cards.json); the more a question comes up, the likelier
// it is to be picked.
const MOCK_POPULAR = 15;
const POPULAR_MIN = 2;

// Cloze cards made from the same text share this key: shown together, they
// give away each other's answers.
function textKey(card) {
  return card.type === "cloze" ? card.id.split(".")[0] : card.id;
}

// Spaced repetition: after a right answer a question comes back after more
// and more days; after a wrong one it is due again right away.
const REVIEW_DAYS = [0, 1, 3, 7, 14, 30];

function reviewEntry(card) {
  if (progress.srs[card.id]) return progress.srs[card.id];
  // Answered before spaced repetition existed: due now.
  if (card.id in progress.results) return [progress.results[card.id], 0];
  return null;
}

function reviewPlan() {
  const today = dayNumber(todayKey());
  const due = [];
  const fresh = [];
  for (const card of state.allCards) {
    const entry = reviewEntry(card);
    if (!entry) fresh.push(card);
    else if (entry[1] + REVIEW_DAYS[entry[0]] <= today) {
      due.push({ card, level: entry[0], overdue: today - entry[1] - REVIEW_DAYS[entry[0]] });
    }
  }
  // Wrong and low-level questions first, then the most overdue.
  due.sort((a, b) => a.level - b.level || b.overdue - a.overdue);
  return { due: due.map((item) => item.card), fresh };
}

// As many questions as the daily goal: the ones due first, then new ones.
function smartReview() {
  const { due, fresh } = reviewPlan();
  const used = new Set();
  const picked = [];
  for (const card of [...due, ...shuffle(fresh)]) {
    if (picked.length === progress.goal) break;
    if (used.has(textKey(card))) continue;
    used.add(textKey(card));
    picked.push(card);
  }
  return shuffle(picked);
}

// Only choice questions, as in the real exam: MOCK_POPULAR of the ones that
// come up most, weighted by popularity, and the rest at random, spread evenly
// over the categories.
function mockExam() {
  const used = new Set();
  const picked = [];
  const take = (card) => {
    if (used.has(textKey(card))) return false;
    used.add(textKey(card));
    picked.push(card);
    return true;
  };
  const choiceOnly = (cards) => cards.filter((card) => card.type === "choice");
  const popular = choiceOnly(state.allCards).filter((card) => (card.popularity || 0) >= POPULAR_MIN);
  for (const card of weightedShuffle(popular, (card) => card.popularity)) {
    if (picked.length === MOCK_POPULAR) break;
    take(card);
  }
  const pools = state.categories.map((category) =>
    shuffle(choiceOnly(category.subcategories.flatMap((sub) => sub.cards))));
  while (picked.length < MOCK_SIZE && pools.some((pool) => pool.length)) {
    for (const pool of pools) {
      while (pool.length && !take(pool.pop()));
      if (picked.length === MOCK_SIZE) break;
    }
  }
  return shuffle(picked);
}

function setupPractice() {
  app.querySelector("#start-smart").addEventListener("click", () => {
    const cards = smartReview();
    if (cards.length) startExam(cards);
  });
  app.querySelector("#start-mock").addEventListener("click", () => {
    startExam(mockExam(), { passMark: MOCK_PASS, mock: true });
  });
  app.querySelector("#start-missed").addEventListener("click", () => {
    startExam(shuffle(cardsFromIds(progress.missed)));
  });
  app.querySelector("#start-marked").addEventListener("click", () => {
    startExam(shuffle(cardsFromIds(progress.marked)));
  });
  app.querySelector("#clear-missed").addEventListener("click", async () => {
    if (await askConfirm({
      title: "¿Vaciar las falladas?",
      text: "Se borrará la lista de preguntas que respondiste mal en este dispositivo.",
      ok: "Vaciar",
    })) {
      progress.missed.length = 0;
      saveProgress();
      updatePractice();
    }
  });
  app.querySelector("#clear-marked").addEventListener("click", async () => {
    if (await askConfirm({
      title: "¿Quitar todas las marcas?",
      text: "Se borrará la lista de preguntas que marcaste en este dispositivo.",
      ok: "Quitar marcas",
    })) {
      progress.marked.length = 0;
      saveProgress();
      updatePractice();
    }
  });
  app.querySelector("#open-topics").addEventListener("click", () => {
    state.topicsMode = "practice";
    showTopics();
  });
  app.querySelector("#open-study").addEventListener("click", () => {
    state.topicsMode = "study";
    showTopics();
  });
  app.querySelector("#open-symbols").addEventListener("click", () => showSymbols());
  app.querySelector("#open-timeline").addEventListener("click", () => showTimeline());
  app.querySelector("#open-map").addEventListener("click", showMap);
  app.querySelector("#open-progress").addEventListener("click", showProgress);
  app.querySelector("#open-builder").addEventListener("click", showBuilder);
  updatePractice();
}

// The categories of some questions, in the same order as on the site.
function categoryNames(cards) {
  const names = new Set(cards.map((card) => card.category));
  return state.categories.map((category) => category.title).filter((title) => names.has(title));
}

function renderSavedExam(exam, { featured = false } = {}) {
  const cards = cardsFromIds(exam.ids);
  const item = document.createElement("li");
  const info = document.createElement("div");
  info.className = "exam-info";
  if (featured) {
    const tag = document.createElement("span");
    tag.className = "exam-tag";
    tag.textContent = "Recomendado";
    info.append(tag);
  }
  const title = document.createElement("strong");
  title.textContent = exam.title;
  const meta = document.createElement("small");
  const categories = categoryNames(cards);
  meta.textContent = `${plural(cards.length, "pregunta", "preguntas")} · ${joinList(categories)}`;
  info.append(title, meta);
  const start = document.createElement("button");
  start.type = "button";
  start.className = "primary";
  start.textContent = "Empezar";
  start.addEventListener("click", () => startExam(cards));
  const open = document.createElement("button");
  open.type = "button";
  open.className = "ghost";
  open.textContent = "Ver";
  open.setAttribute("aria-label", featured
    ? `Ver «${exam.title}»: compartir, imprimir o copiar y editar`
    : `Ver «${exam.title}»: compartir, imprimir, editar o eliminar`);
  open.addEventListener("click", () => openSavedExam(exam));
  item.append(info, start, open);
  return item;
}

function updatePractice() {
  const plan = reviewPlan();
  const smart = app.querySelector(".smart-summary");
  smart.textContent = plan.due.length || plan.fresh.length
    ? `${plural(progress.goal, "pregunta", "preguntas")}, tu meta diaria. Hoy te ${plan.due.length === 1 ? "toca" : "tocan"} ${plural(plan.due.length, "para repasar", "para repasar")} y quedan ${plan.fresh.length} sin ver.`
    : "Por hoy no tienes nada que repasar. ¡Vuelve mañana!";
  app.querySelector("#start-smart").disabled = !plan.due.length && !plan.fresh.length;
  const missed = cardsFromIds(progress.missed).length;
  const marked = cardsFromIds(progress.marked).length;
  const draft = cardsFromIds(progress.draft.ids).length;
  const exams = progress.exams.filter((exam) => cardsFromIds(exam.ids).length);
  app.querySelector(".missed-summary").textContent = missed
    ? `${plural(missed, "pregunta que respondiste mal", "preguntas que respondiste mal")}. Cuando aciertes una, sale de la lista.`
    : "Aquí se guardan las preguntas que respondes mal, para repasarlas después.";
  app.querySelector(".marked-summary").textContent = marked
    ? `${plural(marked, "pregunta marcada", "preguntas marcadas")} para repasar.`
    : "Durante un examen o en el buscador, toca «Marcar» para guardar una pregunta aquí.";
  app.querySelector("#start-missed").disabled = !missed;
  app.querySelector("#start-marked").disabled = !marked;
  app.querySelector("#clear-missed").hidden = !missed;
  app.querySelector("#clear-marked").hidden = !marked;
  app.querySelector("#open-builder").textContent = draft ? `Seguir creando (${draft})` : "Crear examen";
  app.querySelector(".exams-empty").hidden = exams.length > 0;
  app.querySelector(".exam-list").replaceChildren(
    ...state.featuredExams.map((exam) => renderSavedExam(exam, { featured: true })),
    ...exams.map((exam) => renderSavedExam(exam)),
  );
  updateProgressSummary();
}

// Study mode -------------------------------------------------------------------

// Each question with its answer already showing, without grading: nothing
// here counts for the streak, missed questions or progress.
// "exit" says where "Salir" goes; without it, back to the topics.
function startStudy(cards, { exit } = {}) {
  state.queue = cards;
  state.index = 0;
  state.studying = true;
  state.studyExit = exit;
  showStudyCard();
}

function showStudyCard() {
  const card = state.queue[state.index];
  const total = state.queue.length;
  state.revealed = true;
  stopSpeaking();
  showScreen("study-template");
  const counter = app.querySelector(".counter");
  counter.textContent = `${state.index + 1} / ${total}`;
  counter.setAttribute("aria-label", `Pregunta ${state.index + 1} de ${total}`);
  app.querySelector(".meter > div").style.width = `${((state.index + 1) / total) * 100}%`;
  app.querySelector(".exam-bar").append(markButton(card));
  app.querySelector(".exit").addEventListener("click", endStudy);
  const listen = app.querySelector(".listen");
  listen.hidden = !canSpeak;
  listen.addEventListener("click", toggleSpeaking);
  app.querySelector(".crumbs").textContent = [card.category, card.subcategory, card.topic].filter(Boolean).join(" › ");

  const front = app.querySelector(".front");
  if (card.front?.length) {
    const text = document.createElement("p");
    text.append(renderSegments(card.front, { revealCloze: true }));
    front.append(text);
  }
  if (card.image) front.append(renderImage(card.image, { revealed: true }));
  if (card.type === "choice") {
    const list = document.createElement("ul");
    list.className = "options study-options";
    const correct = new Set(correctOptions(card));
    card.options.forEach((option, index) => {
      const item = document.createElement("li");
      item.textContent = option;
      if (correct.has(index)) {
        item.className = "is-correct";
        item.prepend("✓ ");
      }
      list.append(item);
    });
    front.append(list);
  }
  if (card.type === "basic") {
    app.querySelector(".back").replaceChildren(renderSegments(card.back, { revealCloze: true }));
    app.querySelector(".answer").hidden = false;
  }
  const after = app.querySelector(".answer");
  if (card.photo) after.after(renderPhoto(card.photo));
  if (card.explanation) after.after(renderExplanation(card.explanation));

  const previous = app.querySelector(".previous");
  previous.disabled = state.index === 0;
  previous.addEventListener("click", () => moveStudy(-1));
  const next = app.querySelector(".study-next");
  next.textContent = state.index === total - 1 ? "Terminar" : "Siguiente";
  next.addEventListener("click", () => moveStudy(1));
  next.focus({ preventScroll: true });
}

function moveStudy(step) {
  const index = state.index + step;
  if (index < 0) return;
  if (index >= state.queue.length) {
    showStudyDone();
    return;
  }
  state.index = index;
  showStudyCard();
}

function endStudy() {
  stopSpeaking();
  state.studying = false;
  if (state.studyExit) {
    state.studyExit.back();
    return;
  }
  state.topicsMode = "study";
  showTopics();
}

function showStudyDone() {
  stopSpeaking();
  state.studying = false;
  const cards = state.queue;
  showScreen("study-done-template");
  app.querySelector(".summary").textContent =
    `Estudiaste ${plural(cards.length, "pregunta", "preguntas")}. ¿Las practicas ahora para ver cuánto recuerdas?`;
  const exit = state.studyExit;
  app.querySelector(".study-test").addEventListener("click", () => startExam(shuffle(cards), { exit }));
  app.querySelector(".study-again").addEventListener("click", () => startStudy(cards, { exit }));
  const restart = app.querySelector(".restart");
  if (exit) restart.textContent = exit.label;
  restart.addEventListener("click", exit ? exit.back : showHome);
  app.focus({ preventScroll: true });
}

// Exam -----------------------------------------------------------------------

// In a mock exam (mock: true) answers are only saved: which were right and
// wrong shows at the end, and there is no streak of right answers.
function startExam(cards, { passMark, exit, mock = false } = {}) {
  state.studying = false;
  state.queue = cards;
  state.index = 0;
  state.missed = [];
  state.mock = mock;
  state.answers = [];
  state.passMark = passMark;
  state.exit = exit || { back: showHome, label: "Volver al inicio" };
  state.startedAt = Date.now();
  state.combo = 0;
  state.bestCombo = 0;
  state.goalJustMet = false;
  showCard();
}

function showCard() {
  const card = state.queue[state.index];
  const total = state.queue.length;
  state.revealed = false;
  stopSpeaking();
  showScreen("card-template");
  const listen = app.querySelector(".listen");
  listen.hidden = !canSpeak;
  listen.addEventListener("click", toggleSpeaking);
  const counter = app.querySelector(".counter");
  counter.textContent = `${state.index + 1} / ${total}`;
  counter.setAttribute("aria-label", `Pregunta ${state.index + 1} de ${total}`);
  app.querySelector(".meter > div").style.width = `${(state.index / total) * 100}%`;
  app.querySelector(".crumbs").textContent =
    [card.category, card.subcategory, card.topic].filter(Boolean).join(" › ");
  app.querySelector(".exam-bar").append(markButton(card));
  const combo = app.querySelector(".combo");
  combo.hidden = state.mock || state.combo < 2;
  combo.textContent = `🔥 ${state.combo} seguidas`;
  combo.setAttribute("aria-label", `${state.combo} aciertos seguidos`);
  renderCardFace(card);
  // Start loading the answer photo now so it shows up right away on reveal.
  if (card.photo) new Image().src = card.photo.src;
  app.querySelector(".report").href = issueUrl("error.yml", {
    title: `[Error] ${cardSummary(card).slice(0, 70)}`,
    pregunta: `${cardSummary(card)}\n\nID: ${card.id}`,
  });
  app.querySelector(".exit").addEventListener("click", confirmExit);
  // Tapping the card also shows the answer, which is handy on phones.
  app.querySelector(".question").addEventListener("click", (event) => {
    if (card.type !== "choice" && !event.target.closest("a, button")) reveal();
  });
  app.querySelector(".reveal").addEventListener("click", reveal);
  app.querySelector(".next").addEventListener("click", () => (state.mock ? saveMockAnswer() : grade(state.choiceResult)));
  app.querySelector(".check-answer").addEventListener("click", checkSelection);
  if (card.type === "choice") {
    app.querySelector(".reveal").hidden = true;
    app.querySelector(".check-answer").hidden = state.mock || !isMultiChoice(card);
    if (state.mock) {
      const next = app.querySelector(".next");
      const key = document.createElement("kbd");
      key.textContent = "Enter";
      next.replaceChildren(state.index + 1 < total ? "Siguiente " : "Terminar ", key);
      next.hidden = false;
      next.disabled = true;
    }
    app.querySelector(".options button")?.focus({ preventScroll: true });
    return;
  }
  app.querySelector(".right").addEventListener("click", () => grade(true));
  app.querySelector(".wrong").addEventListener("click", () => grade(false));
  app.querySelector(".reveal").focus({ preventScroll: true });
}

function renderCardFace(card) {
  const front = app.querySelector(".front");
  const revealed = state.revealed;
  front.replaceChildren();
  if (card.front?.length) {
    const text = document.createElement("p");
    text.append(renderSegments(card.front, { revealCloze: revealed }));
    front.append(text);
  }
  if (card.image) front.append(renderImage(card.image, { revealed }));
  if (card.type === "choice") front.append(renderOptions(card));
  if (card.type === "cloze" && revealed && card.photo) front.append(renderPhoto(card.photo));
  if (card.type === "basic" && revealed) {
    app.querySelector(".back").replaceChildren(renderSegments(card.back, { revealCloze: true }));
    if (card.photo) app.querySelector(".back").after(renderPhoto(card.photo));
    app.querySelector(".answer").hidden = false;
  }
}

// A choice card has one right answer ("answer": 2) or several ("answer": [0, 2]).
function isMultiChoice(card) {
  return Array.isArray(card.answer);
}

function correctOptions(card) {
  return isMultiChoice(card) ? card.answer : [card.answer];
}

function joinList(items) {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} y ${items.at(-1)}` : items[0];
}

function correctAnswerText(card) {
  return joinList(correctOptions(card).map((index) => card.options[index]));
}

// A round mark for one answer and a square one for several, like radio
// buttons and checkboxes.
function optionMark() {
  const mark = document.createElement("span");
  mark.className = "option-mark";
  mark.setAttribute("aria-hidden", "true");
  return mark;
}

function renderOptions(card) {
  const fragment = document.createDocumentFragment();
  const multi = isMultiChoice(card);
  const hint = document.createElement("p");
  hint.className = multi ? "choice-hint is-multi" : "choice-hint";
  hint.append(optionMark(), multi ? "Varias respuestas: marca todas las correctas" : "Una sola respuesta");
  fragment.append(hint);
  const list = document.createElement("ol");
  list.className = multi ? "options is-multi" : "options";
  // Keep the shuffled order for this card while it is on screen.
  state.optionOrder = shuffle(card.options.map((_, index) => index));
  state.selection = new Set();
  state.optionOrder.forEach((optionIndex, position) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.option = optionIndex;
    if (multi || state.mock) button.setAttribute("aria-pressed", "false");
    const key = document.createElement("kbd");
    key.textContent = position + 1;
    button.append(optionMark(), key, card.options[optionIndex]);
    button.addEventListener("click", () => choose(optionIndex));
    item.append(button);
    list.append(item);
  });
  fragment.append(list);
  return fragment;
}

function choose(optionIndex) {
  if (state.revealed) return;
  const card = state.queue[state.index];
  if (!isMultiChoice(card) && !state.mock) {
    finishChoice(new Set([optionIndex]));
    return;
  }
  // Multiple answers, or any mock question: mark the option and wait for
  // "Comprobar" or "Siguiente". One answer replaces the previous one.
  if (!isMultiChoice(card)) state.selection = new Set([optionIndex]);
  else if (state.selection.has(optionIndex)) state.selection.delete(optionIndex);
  else state.selection.add(optionIndex);
  for (const button of app.querySelectorAll(".options button")) {
    const on = state.selection.has(Number(button.dataset.option));
    button.classList.toggle("is-selected", on);
    button.setAttribute("aria-pressed", String(on));
  }
  if (state.mock) app.querySelector(".next").disabled = !state.selection.size;
}

function isRightChoice(card, selected) {
  const correct = new Set(correctOptions(card));
  return selected.size === correct.size && [...selected].every((index) => correct.has(index));
}

function saveMockAnswer() {
  if (!state.selection?.size) return;
  const card = state.queue[state.index];
  const right = isRightChoice(card, state.selection);
  state.answers.push({ card, selected: [...state.selection], right });
  state.revealed = true;
  grade(right);
}

function reducedMotion() {
  return root.dataset.motion === "reduce" || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// After answering, bring the answer into view without jumping past it: the
// page moves only as much as needed, so the options stay above when they fit,
// and the explanation and «Siguiente» follow below.
function scrollToAnswer(target) {
  target.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
}

function checkSelection() {
  if (state.revealed || !state.selection?.size) return;
  finishChoice(state.selection);
}

function finishChoice(selected) {
  stopSpeaking();
  state.revealed = true;
  const card = state.queue[state.index];
  const correct = new Set(correctOptions(card));
  state.choiceResult = isRightChoice(card, selected);
  for (const button of app.querySelectorAll(".options button")) {
    const index = Number(button.dataset.option);
    button.disabled = true;
    button.classList.remove("is-selected");
    button.classList.toggle("was-picked", selected.has(index));
    if (correct.has(index)) {
      button.classList.add("is-correct");
      if (!selected.has(index)) button.classList.add("is-missed");
    } else if (selected.has(index)) {
      button.classList.add("is-wrong");
    }
  }
  const feedback = document.createElement("p");
  feedback.className = state.choiceResult ? "feedback is-right" : "feedback is-wrong";
  const label = correct.size > 1 ? "Las respuestas correctas son" : "La respuesta es";
  feedback.textContent = state.choiceResult
    ? "¡Correcto!"
    : `Incorrecto. ${label}: ${correctAnswerText(card)}.`;
  app.querySelector(".options").after(feedback);
  let last = feedback;
  if (card.explanation) {
    last = renderExplanation(card.explanation);
    feedback.after(last);
  }
  if (card.photo) last.after(renderPhoto(card.photo));
  app.querySelector(".check-answer").hidden = true;
  app.querySelector(".question").classList.add("is-revealed");
  app.querySelector(".next").hidden = false;
  app.querySelector(".next").focus({ preventScroll: true });
  scrollToAnswer(feedback);
}

function renderExplanation(text) {
  const explanation = document.createElement("p");
  explanation.className = "explanation";
  explanation.textContent = text;
  return explanation;
}

// Read aloud -----------------------------------------------------------------

// Uses the device's own voices (Web Speech API), so it also works offline
// on most phones. Hidden where the browser has no speech synthesis.
const canSpeak = "speechSynthesis" in window;

function speechText(card) {
  const parts = [(card.front || [])
    .map((segment) => (segment.cloze && !state.revealed ? " espacio en blanco " : segment.text))
    .join("")];
  if (card.type === "choice") {
    if (state.revealed) {
      parts.push(app.querySelector(".feedback")?.textContent || `Respuesta: ${correctAnswerText(card)}.`, card.explanation);
    } else {
      state.optionOrder.forEach((index, position) => parts.push(`Opción ${position + 1}: ${card.options[index]}.`));
    }
  } else if (card.type === "image") {
    parts.push(state.revealed
      ? "La respuesta está en la imagen."
      : "Mira la imagen: ¿qué hay debajo del recuadro amarillo?");
  } else if (card.type === "basic" && state.revealed) {
    parts.push(`Respuesta: ${plainText(card.back)}`);
  }
  return parts.filter(Boolean).join(" ");
}

function spanishVoice() {
  const voices = speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("es"));
  for (const lang of ["es-ec", "es-419", "es-co", "es-mx", "es-us", "es-es"]) {
    const voice = voices.find((item) => item.lang.toLowerCase().replace("_", "-") === lang);
    if (voice) return voice;
  }
  return voices[0];
}

function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel();
  app.querySelector(".listen")?.setAttribute("aria-pressed", "false");
}

function toggleSpeaking() {
  const button = app.querySelector(".listen");
  if (!canSpeak || !button) return;
  if (button.getAttribute("aria-pressed") === "true") {
    stopSpeaking();
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(speechText(state.queue[state.index]));
  utterance.lang = "es-EC";
  const voice = spanishVoice();
  if (voice) utterance.voice = voice;
  utterance.addEventListener("end", () => button.setAttribute("aria-pressed", "false"));
  utterance.addEventListener("error", () => button.setAttribute("aria-pressed", "false"));
  button.setAttribute("aria-pressed", "true");
  speechSynthesis.speak(utterance);
}

function reveal() {
  if (state.revealed || state.queue[state.index].type === "choice") return;
  stopSpeaking();
  state.revealed = true;
  const card = state.queue[state.index];
  if (card.type === "image") {
    // Remove only the mask so the image is not reloaded.
    app.querySelector(".mask.active")?.remove();
    app.querySelector(".occlusion img").alt = "Imagen con la respuesta visible";
  } else {
    renderCardFace(card);
  }
  app.querySelector(".question").classList.add("is-revealed");
  app.querySelector(".reveal").hidden = true;
  app.querySelector(".grade").hidden = false;
  app.querySelector(".right").focus({ preventScroll: true });
  scrollToAnswer(app.querySelector(".grade"));
}

function grade(knewIt) {
  if (!state.revealed || knewIt === undefined) return;
  state.choiceResult = undefined;
  const card = state.queue[state.index];
  card.lastResult = knewIt;
  if (!knewIt) state.missed.push(card);
  const hadMissed = progress.missed.length > 0;
  setInList(progress.missed, card.id, !knewIt);
  if (hadMissed && !progress.missed.length) progress.stats.clearedMissed = true;
  recordAnswer(card, knewIt);
  if (!state.mock) {
    state.combo = knewIt ? state.combo + 1 : 0;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    progress.stats.bestCombo = Math.max(progress.stats.bestCombo || 0, state.bestCombo);
  }
  state.index += 1;
  if (state.index < state.queue.length) showCard();
  else showResult();
}

async function confirmExit() {
  if (await askConfirm({
    title: "¿Salir del examen?",
    text: "Se perderá el resultado de este intento. Las preguntas que ya fallaste quedan guardadas en «Falladas».",
    ok: "Salir",
    cancel: "Seguir respondiendo",
  })) {
    stopSpeaking();
    state.exit.back();
  }
}

// Progress, streak and achievements -----------------------------------------

function todayKey() {
  return dateKey(new Date());
}

function dayNumber(key) {
  const [year, month, day] = key.split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86400000);
}

function dateKey(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0")).join("-");
}

// Activity calendar -----------------------------------------------------------

const CALENDAR_WEEKS = 53;
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DATE_FORMAT = new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// 0 = no practice; 1–4 grow with the answers, measured against the daily goal.
// Days saved before the calendar existed have no count: they show as 1, or 3
// if the goal was met.
function activityLevel(key, goalDays) {
  const count = progress.activity[key];
  if (count === undefined) return goalDays.has(key) ? 3 : progress.days.includes(key) ? 1 : 0;
  if (count >= progress.goal * 2) return 4;
  if (count >= progress.goal) return 3;
  return count >= progress.goal / 2 ? 2 : 1;
}

function activityText(key) {
  const count = progress.activity[key];
  if (count !== undefined) return plural(count, "respuesta", "respuestas");
  return progress.days.includes(key) ? "practicaste" : "sin práctica";
}

// A year of days in columns of weeks (Monday first), like a contributions
// graph, ending with the current week.
function renderActivity(container) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (CALENDAR_WEEKS - 1) * 7);
  const goalDays = new Set(progress.goalDays);
  const calendar = container.querySelector(".activity-calendar");
  const cells = [];
  const place = (element, column, row) => {
    element.style.gridColumn = String(column);
    element.style.gridRow = String(row);
    cells.push(element);
  };
  // Weekday labels in one column that stays put while the weeks scroll.
  const days = document.createElement("div");
  days.className = "activity-days";
  for (const name of ["lun", "", "mié", "", "vie", "", ""]) {
    const label = document.createElement("span");
    label.textContent = name;
    days.append(label);
  }
  place(days, 1, "2 / span 7");
  const corner = document.createElement("span");
  corner.className = "activity-corner";
  place(corner, 1, 1);
  let practiced = 0;
  for (let index = 0, date = new Date(start); date <= today; index++, date.setDate(date.getDate() + 1)) {
    const week = Math.floor(index / 7);
    const key = dateKey(date);
    if (date.getDate() === 1 && week < CALENDAR_WEEKS - 1) {
      const month = document.createElement("span");
      month.className = "activity-month";
      month.textContent = MONTHS[date.getMonth()];
      place(month, week + 2, 1);
    }
    const level = activityLevel(key, goalDays);
    if (level) practiced += 1;
    const cell = document.createElement("i");
    cell.className = "activity-cell";
    cell.dataset.level = String(level);
    cell.title = `${DATE_FORMAT.format(date)}: ${activityText(key)}`;
    place(cell, week + 2, (index % 7) + 2);
  }
  calendar.replaceChildren(...cells);
  const summary = practiced
    ? `Practicaste ${plural(practiced, "día", "días")} en el último año.`
    : "Todavía no hay días con práctica. Cada día que respondas preguntas se pinta un cuadro.";
  container.querySelector(".activity-summary").textContent = summary;
  const scroller = container.querySelector(".activity-scroll");
  scroller.setAttribute("aria-label", `Calendario de actividad del último año. ${summary}`);
  // The latest weeks matter most: start scrolled to the end on narrow screens.
  requestAnimationFrame(() => { scroller.scrollLeft = scroller.scrollWidth; });
}

function recordAnswer(card, right) {
  const stats = progress.stats;
  progress.results[card.id] = right ? 1 : 0;
  const level = reviewEntry(card)?.[0] || 0;
  progress.srs[card.id] = [right ? Math.min(level + 1, REVIEW_DAYS.length - 1) : 0, dayNumber(todayKey())];
  stats.answered = (stats.answered || 0) + 1;
  if (right) stats.right = (stats.right || 0) + 1;
  const today = todayKey();
  if (progress.days.at(-1) !== today) progress.days.push(today);
  if (progress.today.day !== today) progress.today = { day: today, count: 0 };
  progress.today.count += 1;
  progress.activity[today] = (progress.activity[today] || 0) + 1;
  if (checkGoal()) state.goalJustMet = true;
  saveProgress();
}

function todayCount() {
  return progress.today.day === todayKey() ? progress.today.count : 0;
}

// Marks today as a goal day once today's answers reach the goal; true the first time.
function checkGoal() {
  const today = todayKey();
  if (todayCount() < progress.goal || progress.goalDays.includes(today)) return false;
  progress.goalDays.push(today);
  return true;
}

function renderGoal(container) {
  const count = todayCount();
  const met = count >= progress.goal;
  container.querySelector(".goal-text").textContent = met
    ? `¡Meta de hoy cumplida! Hoy respondiste ${plural(count, "pregunta", "preguntas")}.`
    : `Meta de hoy: ${count} de ${progress.goal} preguntas.`;
  const bar = container.querySelector(".goal-bar");
  bar.style.setProperty("--ratio", Math.min(1, count / progress.goal));
  bar.classList.toggle("is-met", met);
}

// Confetti in the flag colors. Skipped when the person or the system asks
// for less motion.
function celebrate() {
  if (reducedMotion()) return;
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const ratio = window.devicePixelRatio || 1;
  canvas.width = innerWidth * ratio;
  canvas.height = innerHeight * ratio;
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  const colors = ["#f2b705", "#0a4fa3", "#d0312d"];
  const pieces = Array.from({ length: 140 }, (_, index) => ({
    x: Math.random() * innerWidth,
    y: -20 - Math.random() * innerHeight * 0.6,
    width: 6 + Math.random() * 6,
    height: 8 + Math.random() * 8,
    speedX: (Math.random() - 0.5) * 2,
    speedY: 2 + Math.random() * 3,
    angle: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.3,
    color: colors[index % colors.length],
  }));
  const start = performance.now();
  const frame = (now) => {
    const elapsed = now - start;
    context.clearRect(0, 0, innerWidth, innerHeight);
    context.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - 2000) / 800);
    for (const piece of pieces) {
      piece.x += piece.speedX;
      piece.y += piece.speedY;
      piece.speedY += 0.05;
      piece.angle += piece.spin;
      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.angle);
      context.fillStyle = piece.color;
      context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
      context.restore();
    }
    if (elapsed < 2800) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

// Mock exams kept in the history, with their answers, for «Mis simulacros».
const MOCK_HISTORY = 200;

function recordExam(right) {
  const stats = progress.stats;
  stats.exams = (stats.exams || 0) + 1;
  if (state.passMark) {
    stats.mocks = (stats.mocks || 0) + 1;
    stats.bestMock = Math.max(stats.bestMock || 0, right);
    if (right >= state.passMark) stats.mocksPassed = (stats.mocksPassed || 0) + 1;
  }
  if (state.mock) {
    // answers: [card id, picked option indexes, 1 if right].
    progress.mocks.push({
      n: stats.mocks,
      at: Date.now(),
      ms: Date.now() - state.startedAt,
      right,
      total: state.queue.length,
      pass: state.passMark,
      answers: state.answers.map((answer) => [answer.card.id, answer.selected, answer.right ? 1 : 0]),
    });
    progress.mocks.splice(0, progress.mocks.length - MOCK_HISTORY);
  }
  saveProgress();
}

// The streak counts consecutive days with practice, ending today or yesterday.
function streaks() {
  const days = [...new Set(progress.days)].map(dayNumber).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  days.forEach((day, index) => {
    run = index && day === days[index - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  const current = days.length && dayNumber(todayKey()) - days.at(-1) <= 1 ? run : 0;
  return { current, best };
}

function categoryCards(category) {
  return category.subcategories.flatMap((sub) => sub.cards);
}

// A question is mastered when its last answer was right.
function mastery(cards) {
  let right = 0;
  let wrong = 0;
  for (const card of cards) {
    if (progress.results[card.id] === 1) right += 1;
    else if (progress.results[card.id] === 0) wrong += 1;
  }
  return { right, wrong, total: cards.length };
}

const ACHIEVEMENTS = [
  { id: "first-answer", title: "Primer paso", text: "Responde tu primera pregunta.", test: (s) => s.answered >= 1 },
  { id: "first-exam", title: "Primer examen", text: "Termina un examen.", test: (s) => s.exams >= 1 },
  { id: "answered-100", title: "Cien preguntas", text: "Responde 100 preguntas.", test: (s) => s.answered >= 100 },
  { id: "answered-500", title: "Quinientas preguntas", text: "Responde 500 preguntas.", test: (s) => s.answered >= 500 },
  { id: "streak-3", title: "Tres días seguidos", text: "Practica 3 días seguidos.", test: (s) => s.bestStreak >= 3 },
  { id: "streak-7", title: "Una semana seguida", text: "Practica 7 días seguidos.", test: (s) => s.bestStreak >= 7 },
  { id: "all-categories", title: "De todo un poco", text: "Acierta al menos una pregunta de cada categoría.", test: (s) => s.allCategories },
  { id: "cleared-missed", title: "Cuenta saldada", text: "Vacía tus falladas acertándolas todas.", test: (s) => s.clearedMissed },
  { id: "mock-passed", title: "Simulacro aprobado", text: `Aprueba un simulacro con ${MOCK_PASS} aciertos o más.`, test: (s) => s.mocksPassed >= 1 },
  { id: "mock-perfect", title: "Simulacro perfecto", text: `Acierta las ${MOCK_SIZE} preguntas de un simulacro.`, test: (s) => s.bestMock >= MOCK_SIZE },
  { id: "symbols-mastered", title: "Símbolos dominados", text: "Domina todas las preguntas de Símbolos Patrios.", test: (s) => s.symbolsMastered },
  { id: "half-mastered", title: "Mitad del camino", text: "Domina la mitad de todas las preguntas.", test: (s) => s.mastered * 2 >= s.total },
  { id: "combo-10", title: "Diez seguidas", text: "Acierta 10 preguntas seguidas en un examen.", test: (s) => s.bestCombo >= 10 },
  { id: "combo-25", title: "Veinticinco seguidas", text: "Acierta 25 preguntas seguidas en un examen.", test: (s) => s.bestCombo >= 25 },
  { id: "goal-1", title: "Meta cumplida", text: "Cumple tu meta diaria.", test: (s) => s.goalDays >= 1 },
  { id: "goal-7", title: "Siete metas", text: "Cumple tu meta diaria en 7 días distintos.", test: (s) => s.goalDays >= 7 },
  { id: "streak-30", title: "Un mes seguido", text: "Practica 30 días seguidos.", test: (s) => s.bestStreak >= 30 },
  { id: "mocks-5", title: "Cinco aprobados", text: "Aprueba 5 simulacros.", test: (s) => s.mocksPassed >= 5 },
  { id: "own-exam", title: "Examen propio", text: "Guarda tu primer examen en «Mis exámenes».", test: (s) => s.savedExams >= 1 },
  { id: "all-mastered", title: "Todo dominado", text: "Domina todas las preguntas.", test: (s) => s.mastered >= s.total },
  { id: "streak-14", title: "Dos semanas seguidas", text: "Practica 14 días seguidos.", test: (s) => s.bestStreak >= 14 },
  { id: "answered-1000", title: "Mil preguntas", text: "Responde 1000 preguntas.", test: (s) => s.answered >= 1000 },
  { id: "goal-30", title: "Treinta metas", text: "Cumple tu meta diaria en 30 días distintos.", test: (s) => s.goalDays >= 30 },
  { id: "mocks-10", title: "Diez aprobados", text: "Aprueba 10 simulacros.", test: (s) => s.mocksPassed >= 10 },
  { id: "mocks-row-3", title: "Tres aprobados seguidos", text: "Aprueba 3 simulacros seguidos.", test: (s) => s.mocksInRow >= 3 },
  { id: "map-perfect", title: "Mapa a la primera", text: "Encuentra las 24 provincias a la primera en el mapa.", test: (s) => s.mapPerfect },
  { id: "geography-mastered", title: "Geografía dominada", text: "Domina todas las preguntas de Geografía.", test: (s) => s.categoryMastered.has("Geografía") },
  { id: "history-mastered", title: "Historia dominada", text: "Domina todas las preguntas de Historia.", test: (s) => s.categoryMastered.has("Historia") },
  { id: "politics-mastered", title: "Política dominada", text: "Domina todas las preguntas de Política.", test: (s) => s.categoryMastered.has("Política") },
  { id: "culture-mastered", title: "Cultura dominada", text: "Domina todas las preguntas de Cultura.", test: (s) => s.categoryMastered.has("Cultura") },
];

// The most mock exams passed one after another, from the history.
function mocksInRow() {
  let best = 0;
  let run = 0;
  for (const entry of progress.mocks) {
    run = mockPassed(entry) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function progressSnapshot() {
  const stats = progress.stats;
  const categoryMastered = new Set(state.categories
    .filter((category) => {
      const result = mastery(categoryCards(category));
      return result.right === result.total;
    })
    .map((category) => category.title));
  return {
    answered: stats.answered || 0,
    exams: stats.exams || 0,
    mocksPassed: stats.mocksPassed || 0,
    bestMock: stats.bestMock || 0,
    clearedMissed: Boolean(stats.clearedMissed),
    bestStreak: streaks().best,
    allCategories: state.categories.every((category) => mastery(categoryCards(category)).right > 0),
    symbolsMastered: categoryMastered.has("Símbolos Patrios"),
    categoryMastered,
    mocksInRow: mocksInRow(),
    mapPerfect: Boolean(stats.mapPerfect),
    mastered: mastery(state.allCards).right,
    total: state.allCards.length,
    bestCombo: stats.bestCombo || 0,
    goalDays: progress.goalDays.length,
    savedExams: progress.exams.length,
  };
}

// Unlocks what the current progress earns and returns the new achievements.
function unlockAchievements() {
  const snapshot = progressSnapshot();
  const unlocked = ACHIEVEMENTS.filter((item) => !progress.achievements[item.id] && item.test(snapshot));
  for (const item of unlocked) progress.achievements[item.id] = Date.now();
  if (unlocked.length) saveProgress();
  return unlocked;
}

const MEDAL_ICON = '<svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 2h8l-2 6h-4z"/><circle cx="12" cy="15" r="6"/><path d="M12 12l1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L9 14.3l2-.3z" fill="currentColor" stroke="none"/></svg>';

function renderAchievement(item, unlockedAt, { withDate = true } = {}) {
  const li = document.createElement("li");
  li.className = unlockedAt ? "is-unlocked" : "is-locked";
  const icon = document.createElement("span");
  icon.className = "achievement-icon";
  icon.innerHTML = MEDAL_ICON;
  const body = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = item.title;
  const text = document.createElement("small");
  text.textContent = unlockedAt && withDate
    ? `${item.text} Lo lograste el ${new Date(unlockedAt).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" })}.`
    : item.text;
  body.append(title, text);
  li.append(icon, body);
  if (!unlockedAt) li.setAttribute("aria-label", `${item.title}, todavía sin lograr: ${item.text}`);
  return li;
}

function renderNewAchievements(items) {
  const box = app.querySelector(".new-achievements");
  if (!items.length) return;
  box.hidden = false;
  box.querySelector("h2").textContent = items.length === 1 ? "¡Nuevo logro!" : "¡Nuevos logros!";
  box.querySelector("ul").replaceChildren(...items.map((item) => renderAchievement(item, progress.achievements[item.id], { withDate: false })));
}

function updateProgressSummary() {
  renderGoal(app.querySelector(".progress-summary"));
  const { current } = streaks();
  const mastered = mastery(state.allCards).right;
  const unlocked = Object.keys(progress.achievements).length;
  app.querySelector(".stat-streak").replaceChildren(statValue(current, current === 1 ? "día" : "días"));
  app.querySelector(".stat-mastered").replaceChildren(statValue(mastered, `de ${state.allCards.length}`));
  app.querySelector(".stat-achievements").replaceChildren(statValue(unlocked, `de ${ACHIEVEMENTS.length}`));
}

function statValue(number, unit) {
  const fragment = document.createDocumentFragment();
  const strong = document.createElement("strong");
  strong.textContent = number;
  fragment.append(strong, ` ${unit}`);
  return fragment;
}

function showProgress() {
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  unlockAchievements();
  showScreen("progress-template");
  app.querySelector(".back-home").addEventListener("click", showHome);
  const stats = progress.stats;
  const { current, best } = streaks();
  const total = mastery(state.allCards);
  const answered = stats.answered || 0;
  app.querySelector(".stat-streak").replaceChildren(statValue(current, current === 1 ? "día" : "días"));
  app.querySelector(".stat-streak-note").textContent = `Mejor racha: ${plural(best, "día", "días")}.`;
  app.querySelector(".stat-answered").replaceChildren(statValue(answered, answered === 1 ? "respuesta" : "respuestas"));
  app.querySelector(".stat-answered-note").textContent = answered
    ? `${Math.round(((stats.right || 0) / answered) * 100)} % de aciertos.`
    : "Todavía no respondes ninguna.";
  app.querySelector(".stat-mastered").replaceChildren(statValue(total.right, `de ${total.total}`));
  app.querySelector(".stat-mastered-note").textContent = `${plural(total.wrong, "pregunta", "preguntas")} por repasar.`;
  app.querySelector(".stat-mock").replaceChildren(statValue(stats.bestMock || 0, `de ${MOCK_SIZE}`));
  app.querySelector(".stat-mock-note").textContent = stats.mocks
    ? `Aprobaste ${stats.mocksPassed || 0} de ${plural(stats.mocks, "simulacro", "simulacros")}.`
    : "Todavía no haces ningún simulacro.";

  const goalSection = app.querySelector(".goal-section");
  for (const input of goalSection.querySelectorAll("input")) {
    input.checked = Number(input.value) === progress.goal;
    input.addEventListener("change", () => {
      progress.goal = Number(input.value);
      checkGoal();
      saveProgress();
      renderGoal(goalSection);
      updateGoalDays();
      renderActivity(app.querySelector(".activity-section"));
    });
  }
  const updateGoalDays = () => {
    goalSection.querySelector(".goal-days").textContent = progress.goalDays.length
      ? `La cumpliste ${plural(progress.goalDays.length, "día", "días")}.`
      : "Todavía no la cumples ningún día.";
  };
  renderGoal(goalSection);
  updateGoalDays();
  renderActivity(app.querySelector(".activity-section"));
  renderMocks(app.querySelector(".mocks-section"));

  app.querySelector(".mastery-list").replaceChildren(...state.categories.map((category) => {
    const result = mastery(categoryCards(category));
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = category.title;
    const bar = document.createElement("i");
    bar.style.setProperty("--ratio", result.right / result.total);
    bar.title = `${result.right} de ${result.total} dominadas`;
    const value = document.createElement("strong");
    value.textContent = `${result.right} de ${result.total}`;
    const note = document.createElement("small");
    note.textContent = result.wrong ? `${result.wrong} por repasar` : "";
    item.append(name, bar, value, note);
    return item;
  }));

  const unlockedCount = ACHIEVEMENTS.filter((item) => progress.achievements[item.id]).length;
  app.querySelector(".achievements-count").textContent = `${unlockedCount} de ${ACHIEVEMENTS.length}`;
  app.querySelector(".achievement-list").replaceChildren(...ACHIEVEMENTS
    .map((item) => renderAchievement(item, progress.achievements[item.id])));

  setupDataTransfer();
  app.querySelector(".reset-progress").addEventListener("click", async () => {
    if (!(await askConfirm({
      title: "¿Borrar mi progreso?",
      text: "Se borrarán la racha, las estadísticas, lo que dominas, los logros y tus simulacros de este dispositivo. Tus falladas, marcadas y exámenes se mantienen.",
      ok: "Borrar",
    }))) return;
    Object.assign(progress, { results: {}, days: [], stats: {}, achievements: {}, today: { day: "", count: 0 }, goalDays: [], srs: {}, activity: {}, mocks: [] });
    saveProgress();
    redraw(showProgress);
  });
  app.focus({ preventScroll: true });
}

// Mock exam history -------------------------------------------------------------

const MOCK_CHART_SIZE = 30;
const MOCK_DATE = new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function mockPassed(entry) {
  return entry.right >= entry.pass;
}

// A line chart of the last mock exams and, behind «Ver historial», the list
// of all of them (newest first). The list is also the text version of the
// chart; it starts closed so a long history does not push the page down.
function renderMocks(section) {
  const mocks = progress.mocks;
  const summary = section.querySelector(".mocks-summary");
  if (!mocks.length) {
    summary.textContent = "Cada simulacro que termines aparecerá aquí, con tu puntaje y tus respuestas.";
    return;
  }
  const passed = mocks.filter(mockPassed).length;
  summary.textContent = `Aprobaste ${passed} de ${plural(mocks.length, "simulacro", "simulacros")}. Toca un punto de la gráfica, o abre el historial, para ver sus respuestas.`
    + (mocks.length > MOCK_CHART_SIZE ? ` La gráfica muestra los últimos ${MOCK_CHART_SIZE}.` : "");
  const list = section.querySelector(".mock-list");
  list.replaceChildren(...mocks.map((entry, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost";
    const name = document.createElement("span");
    name.textContent = `Simulacro ${entry.n} · ${MOCK_DATE.format(entry.at)}`;
    const score = document.createElement("strong");
    score.textContent = `${entry.right} de ${entry.total}`;
    const status = document.createElement("span");
    status.className = mockPassed(entry) ? "mock-status is-passed" : "mock-status";
    status.textContent = mockPassed(entry) ? "✓ Aprobado" : "✗ No aprobado";
    button.append(name, score, status);
    button.addEventListener("click", () => showMockResult(index));
    item.append(button);
    return item;
  }).reverse());
  const toggle = section.querySelector(".mock-history-toggle");
  const label = `Ver historial (${plural(mocks.length, "simulacro", "simulacros")})`;
  toggle.hidden = false;
  toggle.textContent = label;
  toggle.addEventListener("click", () => {
    list.hidden = !list.hidden;
    toggle.setAttribute("aria-expanded", String(!list.hidden));
    toggle.textContent = list.hidden ? label : "Ocultar historial";
  });
  const chart = section.querySelector(".mock-chart");
  chart.hidden = false;
  section.querySelector(".mock-legend").hidden = false;
  // Drawn at the real width so the text keeps its size on phones.
  let width = 0;
  new ResizeObserver(() => {
    if (chart.clientWidth && chart.clientWidth !== width) {
      width = chart.clientWidth;
      renderMockChart(chart, width);
    }
  }).observe(chart);
}

// Each mock exam gets at least this much room; when they do not fit, as on a
// phone, the chart scrolls sideways and starts at the latest ones.
const MOCK_POINT_GAP = 24;
const MOCK_AXIS_WIDTH = 30;

function renderMockChart(chart, width) {
  const offset = Math.max(0, progress.mocks.length - MOCK_CHART_SIZE);
  const mocks = progress.mocks.slice(offset);
  const height = 200;
  const pad = { top: 14, right: 14, bottom: 28, left: 8 };
  const visible = width - MOCK_AXIS_WIDTH;
  const plotWidth = Math.max(visible - pad.left - pad.right, (mocks.length - 1) * MOCK_POINT_GAP);
  const plotsWidth = plotWidth + pad.left + pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const top = Math.max(...mocks.map((entry) => entry.total));
  // Scores are mostly near the top: start the scale a little below the
  // lowest one (at most at 15) so the differences show.
  const bottom = Math.max(0, Math.min(15, Math.floor((Math.min(...mocks.map((entry) => entry.right)) - 2) / 5) * 5));
  const x = (index) => pad.left + (mocks.length === 1 ? plotWidth / 2 : (index * plotWidth) / (mocks.length - 1));
  const y = (value) => pad.top + (1 - (value - bottom) / (top - bottom)) * plotHeight;
  const gap = mocks.length === 1 ? plotWidth : plotWidth / (mocks.length - 1);
  const every = Math.ceil(28 / gap);
  // The scale stays put on the left while the chart scrolls.
  let axis = `<svg class="mock-scale" width="${MOCK_AXIS_WIDTH}" height="${height}" aria-hidden="true">`;
  let svg = `<svg width="${plotsWidth}" height="${height}" aria-hidden="true">`;
  const step = top - bottom > 15 ? 10 : 5;
  for (let value = top; value >= bottom; value -= step) {
    axis += `<text class="mock-axis" x="${MOCK_AXIS_WIDTH - 4}" y="${y(value)}" text-anchor="end" dominant-baseline="middle">${value}</text>`;
    svg += `<line class="mock-grid" x1="0" x2="${plotsWidth}" y1="${y(value)}" y2="${y(value)}"/>`;
  }
  svg += `<line class="mock-pass" x1="0" x2="${plotsWidth}" y1="${y(mocks.at(-1).pass)}" y2="${y(mocks.at(-1).pass)}"/>`;
  mocks.forEach((entry, index) => {
    if ((mocks.length - 1 - index) % every === 0) {
      svg += `<text class="mock-axis" x="${x(index)}" y="${height - 8}" text-anchor="middle">${entry.n}</text>`;
    }
  });
  if (mocks.length > 1) {
    svg += `<polyline class="mock-line" points="${mocks.map((entry, index) => `${x(index)},${y(entry.right)}`).join(" ")}"/>`;
  }
  mocks.forEach((entry, index) => {
    svg += `<g class="mock-point${mockPassed(entry) ? " is-passed" : ""}" data-index="${offset + index}">`
      + `<circle class="mock-hit" cx="${x(index)}" cy="${y(entry.right)}" r="12"/>`
      + `<circle class="mock-mark" cx="${x(index)}" cy="${y(entry.right)}" r="5.5"/></g>`;
  });
  chart.innerHTML = `${axis}</svg><div class="mock-scroll">${svg}</svg></div><p class="mock-tip" hidden></p>`;
  const scroller = chart.querySelector(".mock-scroll");
  scroller.scrollLeft = scroller.scrollWidth;
  const tip = chart.querySelector(".mock-tip");
  scroller.addEventListener("scroll", () => { tip.hidden = true; });
  for (const point of chart.querySelectorAll(".mock-point")) {
    const entry = progress.mocks[Number(point.dataset.index)];
    const mark = point.querySelector(".mock-mark");
    point.addEventListener("pointerenter", () => {
      tip.textContent = `Simulacro ${entry.n} · ${MOCK_DATE.format(entry.at)}\n${entry.right} de ${entry.total} · ${mockPassed(entry) ? "Aprobado" : "No aprobado"}`;
      const left = MOCK_AXIS_WIDTH + Number(mark.getAttribute("cx")) - scroller.scrollLeft;
      // Near an edge, the tip opens toward the middle so it stays visible.
      tip.dataset.side = left < width / 3 ? "left" : left > (width * 2) / 3 ? "right" : "";
      tip.style.left = `${left}px`;
      tip.style.top = `${mark.getAttribute("cy")}px`;
      tip.hidden = false;
    });
    point.addEventListener("pointerleave", () => { tip.hidden = true; });
    // The list below has a button for each one, so the chart needs no
    // keyboard stops of its own.
    point.addEventListener("click", () => showMockResult(Number(point.dataset.index)));
  }
}

function showMockResult(index) {
  const entry = progress.mocks[index];
  if (!entry) return;
  showScreen("mock-result-template");
  app.querySelector(".back-progress").addEventListener("click", () => {
    showProgress();
    app.querySelector(".mocks-section").scrollIntoView();
  });
  app.querySelector(".eyebrow").textContent = `Simulacro ${entry.n}`;
  const date = DATE_FORMAT.format(entry.at);
  app.querySelector(".mock-date").textContent = date[0].toUpperCase() + date.slice(1);
  app.querySelector(".score").textContent = `${Math.round((entry.right / entry.total) * 100)}%`;
  app.querySelector(".summary").textContent =
    `Acertaste ${entry.right} de ${entry.total} preguntas ${durationText(entry.ms)}.`;
  showVerdict(entry.right, entry.pass);
  // Questions removed from the site since then are skipped.
  renderMockAnswers(entry.answers
    .filter(([id]) => state.cardsById.has(id))
    .map(([id, selected, right]) => ({ card: state.cardsById.get(id), selected, right: Boolean(right) })));
  setupShareResult(entry);
  app.focus({ preventScroll: true });
}

// Moving data between devices ---------------------------------------------------

const DATA_APP = "examen-nacionalizacion-ecuatoriana";

function downloadData() {
  const data = { app: DATA_APP, version: 1, exportedAt: new Date().toISOString(), progress, settings: storage("read") };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `examen-ecuador-mis-datos-${todayKey()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadData(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return "No se pudo leer el archivo. Elige el que descargaste con «Descargar mis datos».";
  }
  if (data?.app !== DATA_APP || typeof data.progress !== "object") {
    return "Ese archivo no es de esta página. Elige el que descargaste con «Descargar mis datos».";
  }
  const date = new Date(data.exportedAt).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" });
  if (!(await askConfirm({
    title: "¿Cargar estos datos?",
    text: `Se reemplazarán el progreso, las falladas, las marcadas y los exámenes de este dispositivo por los del archivo, descargado el ${date}.`,
    ok: "Cargar",
  }))) return "";
  const loaded = withDefaults(data.progress);
  for (const key of Object.keys(progress)) delete progress[key];
  Object.assign(progress, loaded);
  saveProgress();
  if (data.settings && typeof data.settings === "object") applySettings({ ...DEFAULT_SETTINGS, ...data.settings });
  return "loaded";
}

function setupDataTransfer() {
  const status = app.querySelector(".data-status");
  const input = app.querySelector(".data-file");
  app.querySelector(".download-data").addEventListener("click", () => {
    downloadData();
    status.textContent = "Listo. Busca el archivo en tus descargas y cárgalo en el otro dispositivo.";
  });
  app.querySelector(".load-data").addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    const result = await loadData(file);
    if (result === "loaded") {
      redraw(showProgress);
      app.querySelector(".data-status").textContent = "Datos cargados.";
    } else {
      status.textContent = result;
    }
  });
}

// Learning pages: symbols, timeline and map -------------------------------------

function subcategoriesById(ids) {
  return state.categories.flatMap((category) => category.subcategories)
    .filter((sub) => ids.includes(sub.id));
}

// "Estudiar" and "Practicar" for a group of questions. "exit" brings the
// person back to the page, at the same place, when they finish or leave.
function renderLearnActions(container, cards, exit) {
  const study = document.createElement("button");
  study.type = "button";
  study.className = "primary";
  study.textContent = `Estudiar ${plural(cards.length, "pregunta", "preguntas")}`;
  study.addEventListener("click", () => startStudy(cards, { exit }));
  const practice = document.createElement("button");
  practice.type = "button";
  practice.className = "ghost";
  practice.textContent = "Practicar";
  practice.addEventListener("click", () => startExam(shuffle(cards), { exit }));
  container.replaceChildren(study, practice);
}

function scrollIntoPlace(element) {
  element?.scrollIntoView({ block: "start", behavior: "instant" });
}

function showSymbols(articleIndex) {
  showScreen("symbols-template");
  app.querySelector(".back-home").addEventListener("click", showHome);
  const articles = [...app.querySelectorAll(".symbol")];
  articles.forEach((article, index) => {
    const cards = subcategoriesById(article.dataset.subcategories.split(" ")).flatMap((sub) => sub.cards);
    renderLearnActions(article.querySelector(".symbol-actions"), cards, {
      back: () => showSymbols(index),
      label: "Volver a los símbolos patrios",
    });
  });
  if (articleIndex !== undefined) scrollIntoPlace(articles[articleIndex]);
}

// Historia subtopics are named "<year> <event>"; the others have no year.
const ERAS = [
  { title: "Época prehispánica", until: 1491 },
  { title: "Conquista y Colonia", until: 1808 },
  { title: "Independencia", until: 1829 },
  { title: "La República en el siglo XIX", until: 1899 },
  { title: "Siglos XX y XXI", until: Infinity },
];

function timelineEvents() {
  const history = state.categories.find((category) => category.id === "historia");
  return history.subcategories.map((sub) => {
    const match = sub.title.match(/^(\d{4}) (.+)$/);
    if (match) return { sub, year: Number(match[1]), label: match[1], title: match[2] };
    if (sub.id === "epoca-prehispanica") return { sub, year: 0, label: "Antes de 1492", title: sub.title };
    return { sub, year: null, label: "", title: sub.title };
  });
}

function renderTimelineEvent(event, openId) {
  const item = cloneTemplate("timeline-event-template").firstElementChild;
  item.id = `historia-${event.sub.id}`;
  item.querySelector(".timeline-year").textContent = event.label;
  item.querySelector(".timeline-year").hidden = !event.label;
  item.querySelector(".timeline-title").textContent = event.title;
  item.querySelector(".timeline-summary").textContent = event.sub.summary || "";
  item.querySelector("details").open = event.sub.id === openId;
  renderLearnActions(item.querySelector(".practice-actions"), event.sub.cards, {
    back: () => showTimeline(event.sub.id),
    label: "Volver a la línea de tiempo",
  });
  return item;
}

function showTimeline(openId) {
  showScreen("timeline-template");
  app.querySelector(".back-home").addEventListener("click", showHome);
  const events = timelineEvents();
  const list = app.querySelector(".timeline");
  const nav = app.querySelector(".era-nav");
  let era = -1;
  for (const event of events.filter((item) => item.year !== null)) {
    const index = ERAS.findIndex((item) => event.year <= item.until);
    if (index !== era) {
      era = index;
      const heading = document.createElement("li");
      heading.className = "timeline-era";
      heading.id = `epoca-${index}`;
      heading.innerHTML = "<h2></h2>";
      heading.firstChild.textContent = ERAS[index].title;
      list.append(heading);
      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "chip";
      jump.textContent = ERAS[index].title;
      jump.addEventListener("click", () => heading.scrollIntoView({
        block: "start",
        behavior: reducedMotion() ? "auto" : "smooth",
      }));
      nav.append(jump);
    }
    list.append(renderTimelineEvent(event, openId));
  }
  const extra = events.filter((item) => item.year === null);
  const extraList = app.querySelector(".timeline-extra-items");
  extraList.replaceChildren(...extra.map((event) => renderTimelineEvent(event, openId)));
  app.querySelector(".timeline-extra").hidden = !extra.length;

  const all = [...app.querySelectorAll(".timeline-event details")];
  const expand = app.querySelector(".timeline-expand");
  const syncExpand = () => {
    expand.textContent = all.every((details) => details.open) ? "Cerrar todas" : "Abrir todas";
  };
  expand.addEventListener("click", () => {
    const open = !all.every((details) => details.open);
    all.forEach((details) => { details.open = open; });
    syncExpand();
  });
  all.forEach((details) => details.addEventListener("toggle", syncExpand));
  syncExpand();
  if (openId) scrollIntoPlace(document.getElementById(`historia-${openId}`));
}

// Ids match data-province in images/mapa-provincias.svg
// (scripts/build_province_map.py). Same names and capitals as the questions of
// «Capitales de las Provincias» and «Provincias por Región».
const PROVINCES = [
  { id: "carchi", name: "Carchi", capital: "Tulcán", region: "Sierra" },
  { id: "imbabura", name: "Imbabura", capital: "Ibarra", region: "Sierra" },
  { id: "pichincha", name: "Pichincha", capital: "Quito", region: "Sierra" },
  { id: "cotopaxi", name: "Cotopaxi", capital: "Latacunga", region: "Sierra" },
  { id: "tungurahua", name: "Tungurahua", capital: "Ambato", region: "Sierra" },
  { id: "bolivar", name: "Bolívar", capital: "Guaranda", region: "Sierra" },
  { id: "chimborazo", name: "Chimborazo", capital: "Riobamba", region: "Sierra" },
  { id: "canar", name: "Cañar", capital: "Azogues", region: "Sierra" },
  { id: "azuay", name: "Azuay", capital: "Cuenca", region: "Sierra" },
  { id: "loja", name: "Loja", capital: "Loja", region: "Sierra" },
  { id: "esmeraldas", name: "Esmeraldas", capital: "Esmeraldas", region: "Costa" },
  { id: "manabi", name: "Manabí", capital: "Portoviejo", region: "Costa" },
  { id: "santo-domingo-de-los-tsachilas", name: "Santo Domingo de los Tsáchilas", capital: "Santo Domingo", region: "Costa" },
  { id: "los-rios", name: "Los Ríos", capital: "Babahoyo", region: "Costa" },
  { id: "guayas", name: "Guayas", capital: "Guayaquil", region: "Costa" },
  { id: "santa-elena", name: "Santa Elena", capital: "Santa Elena", region: "Costa" },
  { id: "el-oro", name: "El Oro", capital: "Machala", region: "Costa" },
  { id: "sucumbios", name: "Sucumbíos", capital: "Nueva Loja", region: "Amazonía" },
  { id: "napo", name: "Napo", capital: "Tena", region: "Amazonía" },
  { id: "orellana", name: "Orellana", capital: "Coca", region: "Amazonía" },
  { id: "pastaza", name: "Pastaza", capital: "Puyo", region: "Amazonía" },
  { id: "morona-santiago", name: "Morona Santiago", capital: "Macas", region: "Amazonía" },
  { id: "zamora-chinchipe", name: "Zamora Chinchipe", capital: "Zamora", region: "Amazonía" },
  { id: "galapagos", name: "Galápagos", capital: "Puerto Baquerizo Moreno", region: "Insular" },
];
const REGIONS = ["Costa", "Sierra", "Amazonía", "Insular"];
const MAP_SUBCATEGORIES = ["provincias-y-cantones", "provincias-por-region", "capitales-de-las-provincias", "capitales-en-el-mapa"];

const provinceById = (id) => PROVINCES.find((province) => province.id === id);

// Questions that mention a province, for "Estudiar" in the explore panel.
function provinceCards(province) {
  const name = normalize(province.name);
  return state.allCards.filter((card) => searchableText(card).includes(name));
}

function showMap() {
  showScreen("map-template");
  app.querySelector(".back-home").addEventListener("click", showHome);
  state.map = { mode: "explore", selected: null, game: null };
  const exit = { back: showMap, label: "Volver al mapa" };
  const mapCards = subcategoriesById(MAP_SUBCATEGORIES).flatMap((sub) => sub.cards);
  const study = app.querySelector(".map-study");
  study.textContent = `Estudiar las ${mapCards.length} preguntas de provincias`;
  study.addEventListener("click", () => startStudy(mapCards, { exit }));

  const legend = app.querySelector(".map-legend");
  legend.replaceChildren(...REGIONS.map((region) => {
    const item = document.createElement("li");
    const count = PROVINCES.filter((province) => province.region === region).length;
    item.innerHTML = '<i aria-hidden="true"></i><span></span>';
    item.dataset.region = region;
    item.querySelector("span").textContent = `${region}: ${plural(count, "provincia", "provincias")}`;
    return item;
  }));

  app.querySelectorAll('input[name="map-mode"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.map.mode = input.value;
      if (input.value === "game") startMapGame();
      else exploreMap();
    });
  });

  const frame = app.querySelector(".map-frame");
  const screen = app.firstElementChild;
  fetch("images/mapa-provincias.svg")
    .then((response) => response.text())
    .then((svg) => {
      // The person may have left the map while it loaded.
      if (!screen.isConnected) return;
      frame.innerHTML = svg;
      for (const shape of frame.querySelectorAll("[data-province]")) {
        const province = provinceById(shape.dataset.province);
        shape.dataset.region = province.region;
        shape.setAttribute("tabindex", "0");
        shape.setAttribute("role", "button");
        shape.addEventListener("click", () => pickProvince(province.id));
        shape.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            pickProvince(province.id);
          }
        });
      }
      if (state.map.mode === "game") startMapGame();
      else exploreMap();
    })
    .catch(() => {
      frame.querySelector(".map-loading").textContent = "No se pudo cargar el mapa.";
    });
}

function mapShapes() {
  return [...app.querySelectorAll(".map-frame [data-province]")];
}

function exploreMap() {
  const map = app.querySelector(".province-map");
  if (!map) return;
  state.map.game = null;
  map.classList.remove("is-game");
  app.querySelector(".map-legend").hidden = false;
  for (const shape of mapShapes()) {
    shape.classList.remove("is-right", "is-wrong", "is-target");
    shape.setAttribute("aria-label", provinceById(shape.dataset.province).name);
  }
  showProvince(state.map.selected);
}

function showProvince(id) {
  state.map.selected = id;
  mapShapes().forEach((shape) => shape.classList.toggle("is-selected", shape.dataset.province === id));
  const panel = app.querySelector(".map-panel");
  const province = id && provinceById(id);
  if (!province) {
    panel.innerHTML = '<p class="map-hint">Toca una provincia para ver su capital y su región.</p>';
    return;
  }
  panel.innerHTML = `
    <h2 class="map-name"></h2>
    <dl class="map-facts">
      <div><dt>Capital</dt><dd class="map-capital"></dd></div>
      <div><dt>Región</dt><dd class="map-region"></dd></div>
    </dl>
    <div class="practice-actions"></div>`;
  panel.querySelector(".map-name").textContent = province.name;
  panel.querySelector(".map-capital").textContent = province.capital;
  panel.querySelector(".map-region").textContent = province.region;
  const cards = provinceCards(province);
  const actions = panel.querySelector(".practice-actions");
  if (cards.length) {
    const study = document.createElement("button");
    study.type = "button";
    study.className = "ghost";
    study.textContent = `Estudiar ${plural(cards.length, "pregunta", "preguntas")} que la mencionan`;
    study.addEventListener("click", () => startStudy(cards, { exit: { back: showMap, label: "Volver al mapa" } }));
    actions.append(study);
  }
}

function pickProvince(id) {
  if (state.map.game) {
    answerMapGame(id);
    return;
  }
  showProvince(id);
  // On phones the panel sits above the map: bring it into view.
  const panel = app.querySelector(".map-panel");
  if (panel.getBoundingClientRect().top < 0) scrollToAnswer(panel);
}

function startMapGame() {
  const map = app.querySelector(".province-map");
  if (!map) return;
  state.map.selected = null;
  state.map.game = { queue: shuffle(PROVINCES), index: 0, right: 0, answered: false };
  map.classList.add("is-game");
  app.querySelector(".map-legend").hidden = true;
  for (const shape of mapShapes()) {
    shape.classList.remove("is-selected", "is-right", "is-wrong", "is-target");
    // The name would give the answer away.
    shape.setAttribute("aria-label", "Provincia");
  }
  askMapGame();
}

function askMapGame() {
  const game = state.map.game;
  const province = game.queue[game.index];
  game.answered = false;
  const panel = app.querySelector(".map-panel");
  panel.innerHTML = `
    <p class="map-counter"></p>
    <h2 class="map-question"></h2>
    <p class="map-hint">Tócala en el mapa.</p>`;
  panel.querySelector(".map-counter").textContent =
    `${game.index + 1} de ${game.queue.length} · ${plural(game.right, "acierto", "aciertos")}`;
  panel.querySelector(".map-question").textContent = `¿Dónde está ${province.name}?`;
}

function answerMapGame(id) {
  const game = state.map.game;
  if (game.answered) return;
  game.answered = true;
  const target = game.queue[game.index];
  const right = id === target.id;
  if (right) game.right++;
  const shapes = mapShapes();
  const shapeOf = (provinceId) => shapes.find((shape) => shape.dataset.province === provinceId);
  shapeOf(target.id).classList.add(right ? "is-right" : "is-target");
  if (!right) shapeOf(id).classList.add("is-wrong");

  const panel = app.querySelector(".map-panel");
  const feedback = document.createElement("p");
  feedback.className = `feedback ${right ? "is-right" : "is-wrong"}`;
  feedback.textContent = right
    ? `¡Correcto! Su capital es ${target.capital}.`
    : `Esa es ${provinceById(id).name}. ${target.name} está marcada en el mapa; su capital es ${target.capital}.`;
  const next = document.createElement("button");
  next.type = "button";
  next.className = "primary";
  const last = game.index === game.queue.length - 1;
  next.textContent = last ? "Ver resultado" : "Siguiente";
  next.addEventListener("click", () => {
    // A missed province goes back to normal; the right ones stay green.
    shapes.forEach((shape) => shape.classList.remove("is-wrong", "is-target"));
    if (last) {
      endMapGame();
    } else {
      game.index++;
      askMapGame();
    }
  });
  panel.querySelector(".map-hint").replaceWith(feedback, next);
  next.focus({ preventScroll: true });
  if (panel.getBoundingClientRect().top < 0) scrollToAnswer(panel);
}

function endMapGame() {
  const game = state.map.game;
  const panel = app.querySelector(".map-panel");
  panel.innerHTML = `
    <h2 class="map-question"></h2>
    <p class="map-hint"></p>
    <div class="practice-actions"><button class="primary map-again" type="button">Jugar otra vez</button></div>`;
  panel.querySelector(".map-question").textContent = `Acertaste ${game.right} de ${game.queue.length}`;
  const perfect = game.right === game.queue.length;
  panel.querySelector(".map-hint").textContent = perfect
    ? "¡Encontraste todas las provincias a la primera!"
    : "Las provincias en verde son las que acertaste a la primera.";
  if (perfect) {
    progress.stats.mapPerfect = true;
    saveProgress();
    const unlocked = unlockAchievements();
    if (unlocked.length) {
      panel.querySelector(".map-hint").textContent += ` Ganaste el logro «${unlocked.map((item) => item.title).join("», «")}».`;
      celebrate();
    }
  }
  panel.querySelector(".map-again").addEventListener("click", startMapGame);
  panel.querySelector(".map-again").focus({ preventScroll: true });
}

// Frequently asked questions ---------------------------------------------------

// The questions live at the end of the home page; old links to the former
// "#como-es-el-examen" page land there too.
function showFaq() {
  showHome();
  const faq = document.getElementById("preguntas-frecuentes");
  faq.querySelector("details").open = true;
  faq.scrollIntoView();
}

// Result ---------------------------------------------------------------------

function durationText(ms) {
  const minutes = Math.round(ms / 60000);
  return minutes < 1 ? "en menos de un minuto" : `en ${plural(minutes, "minuto", "minutos")}`;
}

function showVerdict(right, passMark) {
  const verdict = app.querySelector(".verdict");
  const passed = right >= passMark;
  verdict.hidden = false;
  verdict.classList.add(passed ? "is-right" : "is-wrong");
  verdict.textContent = passed
    ? `¡Aprobado! Se necesitan ${passMark} aciertos.`
    : `No aprobado: se necesitan ${passMark} aciertos y te ${passMark - right === 1 ? "faltó" : "faltaron"} ${passMark - right}.`;
}

function showResult() {
  stopSpeaking();
  const total = state.queue.length;
  const right = total - state.missed.length;
  showScreen("result-template");
  app.querySelector(".score").textContent = `${Math.round((right / total) * 100)}%`;
  app.querySelector(".summary").textContent =
    `Acertaste ${right} de ${total} preguntas ${durationText(Date.now() - state.startedAt)}.`;
  if (state.passMark) showVerdict(right, state.passMark);
  recordExam(right);
  const combo = app.querySelector(".result-combo");
  if (state.bestCombo >= 2) {
    combo.hidden = false;
    combo.textContent = `Mejor serie: ${state.bestCombo} aciertos seguidos.`;
  }
  if (state.goalJustMet) {
    const goal = app.querySelector(".result-goal");
    goal.hidden = false;
    goal.textContent = `¡Cumpliste tu meta de hoy: ${progress.goal} preguntas!`;
  }
  const unlocked = unlockAchievements();
  renderNewAchievements(unlocked);
  const passed = state.passMark ? right >= state.passMark : total >= 10 && right / total >= 0.9;
  if (passed || unlocked.length || state.goalJustMet) celebrate();

  const byCategory = new Map();
  for (const card of state.queue) {
    const entry = byCategory.get(card.category) || { right: 0, total: 0 };
    entry.total += 1;
    if (card.lastResult) entry.right += 1;
    byCategory.set(card.category, entry);
  }
  const breakdown = app.querySelector(".breakdown");
  for (const [category, entry] of byCategory) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = category;
    const value = document.createElement("strong");
    value.textContent = `${entry.right}/${entry.total}`;
    const bar = document.createElement("i");
    bar.style.setProperty("--ratio", entry.right / entry.total);
    item.append(name, bar, value);
    breakdown.append(item);
  }

  const missed = state.missed;
  const retry = app.querySelector(".retry-missed");
  if (missed.length) {
    retry.addEventListener("click", () => startExam(shuffle(missed), { exit: state.exit }));
  } else {
    retry.remove();
    app.querySelector(".missed-title").remove();
  }
  // Offer to keep this exam in "Mis exámenes", unless it is already there.
  const ids = state.queue.map((card) => card.id);
  const saveForm = app.querySelector(".save-exam");
  const saveDone = app.querySelector(".save-done");
  saveForm.hidden = Boolean(findSavedExam(ids));
  saveForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const exam = saveExam({ title: saveForm.querySelector(".save-title").value.trim(), ids });
    saveForm.hidden = true;
    saveDone.hidden = false;
    saveDone.querySelector(".open-saved").addEventListener("click", () => openSavedExam(exam));
  });
  const restart = app.querySelector(".restart");
  restart.textContent = state.exit.label;
  restart.addEventListener("click", state.exit.back);

  const list = app.querySelector(".missed");
  if (state.mock) {
    renderMockAnswers(state.answers);
    setupShareResult(progress.mocks.at(-1));
    app.focus({ preventScroll: true });
    return;
  }
  for (const card of missed) list.append(renderReviewItem(card));
  app.focus({ preventScroll: true });
}

// Every answer of a mock exam, wrong ones first, with what was picked.
function renderMockAnswers(answers) {
  const wrongAnswers = answers.filter((answer) => !answer.right);
  const rightAnswers = answers.filter((answer) => answer.right);
  const missedTitle = app.querySelector(".missed-title:not(.right-title)");
  if (wrongAnswers.length) missedTitle.textContent = `Preguntas falladas (${wrongAnswers.length})`;
  else missedTitle?.remove();
  const list = app.querySelector(".missed:not(.right-answers)");
  for (const answer of wrongAnswers) list.append(renderReviewItem(answer.card, answer.selected));
  if (rightAnswers.length) {
    const rightList = app.querySelector(".right-answers");
    app.querySelector(".right-title").textContent = `Preguntas acertadas (${rightAnswers.length})`;
    app.querySelector(".right-title").hidden = false;
    rightList.hidden = false;
    for (const answer of rightAnswers) rightList.append(renderReviewItem(answer.card, answer.selected));
  }
}

// Shares a short text with the score and a link to the site. It says only
// whether the mock exam was passed and how many answers were right.
function setupShareResult(entry) {
  const button = app.querySelector(".share-result");
  const status = app.querySelector(".share-status");
  if (!entry) return;
  button.hidden = false;
  button.textContent = nativeShare ? "Compartir resultado" : "Copiar resultado";
  button.addEventListener("click", async () => {
    const text = entry.right >= entry.pass
      ? `¡Aprobé un simulacro del examen de nacionalización ecuatoriana con ${entry.right} de ${entry.total} respuestas correctas!`
      : `Hice un simulacro del examen de nacionalización ecuatoriana: ${entry.right} de ${entry.total} respuestas correctas. Se aprueba con ${entry.pass}, así que sigo practicando.`;
    const url = location.origin + location.pathname;
    if (nativeShare) {
      try {
        await navigator.share({ text, url });
      } catch {}
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      status.textContent = "Resultado copiado. Pégalo en un mensaje para compartirlo.";
    } catch {
      status.textContent = `${text} ${url}`;
    }
  });
}

// A question in the result list, with its right answer. Given what was picked
// (mock exams), it also shows that answer.
function renderReviewItem(card, selected) {
  const item = document.createElement("li");
  if (card.front?.length) {
    const question = document.createElement("p");
    question.append(renderSegments(card.front, { revealCloze: true }));
    item.append(question);
  }
  if (card.image) item.append(renderImage(card.image, { revealed: true }));
  const right = selected && isRightChoice(card, new Set(selected));
  if (selected && !right) {
    const picked = document.createElement("p");
    picked.className = "picked-answer";
    picked.textContent = `Tu respuesta: ${joinList(selected.map((index) => card.options[index]))}`;
    item.append(picked);
  }
  if (card.type === "basic" || card.type === "choice") {
    const answer = document.createElement("p");
    answer.className = "missed-answer";
    if (card.type === "choice") {
      const label = selected ? (right ? "Tu respuesta: " : "Respuesta correcta: ") : "";
      answer.textContent = label + correctAnswerText(card);
      answer.classList.toggle("is-right", Boolean(right));
    } else {
      answer.append(renderSegments(card.back, { revealCloze: true }));
    }
    item.append(answer);
  }
  if (card.explanation) item.append(renderExplanation(card.explanation));
  if (card.photo) item.append(renderPhoto(card.photo));
  return item;
}

// Exam builder ---------------------------------------------------------------

function addButton(card) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost add";
  button.sync = () => {
    const added = progress.draft.ids.includes(card.id);
    button.setAttribute("aria-pressed", String(added));
    button.textContent = added ? "✓ Agregada" : "+ Agregar";
  };
  button.addEventListener("click", () => {
    setInList(progress.draft.ids, card.id, !progress.draft.ids.includes(card.id));
    renderDraft();
  });
  button.sync();
  return button;
}

function removeButton(card) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost";
  button.textContent = "Quitar";
  button.addEventListener("click", () => {
    setInList(progress.draft.ids, card.id, false);
    renderDraft();
  });
  return button;
}

function showBuilder() {
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  showScreen("builder-template");
  // Editing a saved exam: say so, so it is clear that saving changes it.
  if (progress.exams.some((exam) => exam.id === progress.draft.editing)) {
    app.querySelector(".builder-eyebrow").textContent = "Editar examen";
    app.querySelector("#builder-done").textContent = "Guardar cambios";
  }
  const title = app.querySelector("#exam-title");
  title.value = progress.draft.title;
  title.addEventListener("input", () => {
    progress.draft.title = title.value;
    saveProgress();
  });
  app.querySelector(".back-home").addEventListener("click", showHome);
  app.querySelector(".marked-tab").textContent = `Marcadas (${cardsFromIds(progress.marked).length})`;
  app.querySelector(".missed-tab").textContent = `Falladas (${cardsFromIds(progress.missed).length})`;
  app.querySelector(".source-tabs").addEventListener("change", renderBuilderSource);
  let searchTimer;
  app.querySelector("#builder-search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderBuilderSource, 150);
  });
  app.querySelector(".add-all").addEventListener("click", () => {
    for (const card of cardsFromIds(progress[builderSource()])) setInList(progress.draft.ids, card.id, true);
    renderDraft();
  });
  app.querySelector(".clear-draft").addEventListener("click", async () => {
    if (await askConfirm({
      title: "¿Vaciar el examen?",
      text: "Se quitarán todas las preguntas que elegiste.",
      ok: "Vaciar",
    })) {
      progress.draft = { title: "", ids: [] };
      saveProgress();
      title.value = "";
      renderDraft();
    }
  });
  app.querySelector("#builder-done").addEventListener("click", () => {
    const { editing, title: name, ids } = progress.draft;
    const exam = saveExam({ id: editing, title: name.trim(), ids: cardsFromIds(ids).map((card) => card.id) });
    progress.draft = { title: "", ids: [] };
    saveProgress();
    openSavedExam(exam);
  });
  renderBuilderSource();
  renderDraft();
  app.focus({ preventScroll: true });
}

function builderSource() {
  return app.querySelector(".source-tabs input:checked").value;
}

function renderBuilderSource() {
  const source = builderSource();
  const container = app.querySelector(".builder-source");
  const status = container.querySelector(".search-status");
  const list = container.querySelector(".search-results");
  const render = (card) => renderSearchResult(card, addButton(card));
  container.querySelector(".search-box").hidden = source !== "search";
  if (source === "search") {
    container.querySelector(".add-all").hidden = true;
    const query = container.querySelector("#builder-search").value;
    runSearch(container, query, render);
    if (!status.textContent) status.textContent = "Escribe al menos dos letras para buscar preguntas.";
    return;
  }
  const cards = cardsFromIds(progress[source]);
  container.querySelector(".add-all").hidden = !cards.length;
  if (source === "marked") {
    status.textContent = cards.length
      ? `${plural(cards.length, "pregunta marcada", "preguntas marcadas")}.`
      : "No tienes preguntas marcadas. Durante un examen o en el buscador, toca «Marcar» para guardar una.";
  } else {
    status.textContent = cards.length
      ? `${plural(cards.length, "pregunta fallada", "preguntas falladas")}.`
      : "No tienes preguntas falladas.";
  }
  list.replaceChildren(...cards.map(render));
}

function renderDraft() {
  const cards = cardsFromIds(progress.draft.ids);
  app.querySelector(".draft-list").replaceChildren(
    ...cards.map((card) => renderSearchResult(card, removeButton(card))),
  );
  app.querySelector(".draft-empty").hidden = cards.length > 0;
  app.querySelector(".clear-draft").hidden = !cards.length;
  app.querySelector(".builder-count").textContent = plural(cards.length, "pregunta elegida", "preguntas elegidas");
  app.querySelector("#builder-done").disabled = !cards.length;
  for (const button of app.querySelectorAll(".add")) button.sync();
}

// Shared exams ---------------------------------------------------------------

// A shared exam travels inside its link: "#examen=" and a 6-character code per
// question, plus an optional "&titulo=". Nothing is stored on a server, and
// browsers never send the part after "#" to it. The code is an FNV-1a hash of
// the card id, so links keep working when questions are added or reordered.
function shortCode(id) {
  let hash = 0x811c9dc5;
  for (const char of id) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % 36 ** 6).toString(36).padStart(6, "0");
}

function examLink(cards, title) {
  const params = new URLSearchParams({ examen: cards.map((card) => card.code).join("") });
  if (title) params.set("titulo", title);
  return `${location.origin}${location.pathname}#${params}`;
}

function examFromHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const codes = params.get("examen");
  if (codes === null) return null;
  const wanted = codes.match(/[0-9a-z]{6}/g) || [];
  const cards = wanted.map((code) => state.cardsByCode.get(code)).filter(Boolean);
  return { cards, title: (params.get("titulo") || "").slice(0, 80), missing: wanted.length - cards.length };
}

function showShared({ cards, title, missing = 0 }) {
  const link = examLink(cards, title);
  history.replaceState(null, "", link);
  showScreen("shared-template");
  app.querySelector(".shared-title").textContent = title || "Examen personalizado";
  const categories = categoryNames(cards);
  const ids = cards.map((card) => card.id);
  const featured = findFeaturedExam(ids);
  app.querySelector(".shared-summary").textContent = cards.length
    ? `${plural(cards.length, "pregunta", "preguntas")} de ${joinList(categories)}.`
    : "Este enlace no tiene preguntas.";
  app.querySelector(".shared-about").hidden = !featured;
  if (missing) {
    const warning = app.querySelector(".shared-warning");
    warning.hidden = false;
    warning.textContent = missing === 1
      ? "Una pregunta del enlace ya no existe en el sitio y se omitió."
      : `${missing} preguntas del enlace ya no existen en el sitio y se omitieron.`;
  }
  const exit = { back: () => showShared({ cards, title }), label: "Volver al examen" };
  const start = app.querySelector(".shared-go");
  start.disabled = !cards.length;
  start.addEventListener("click", () => {
    startExam(app.querySelector("#shared-shuffle").checked ? shuffle(cards) : cards, { exit });
  });

  const input = app.querySelector(".share-link");
  const status = app.querySelector(".share-status");
  input.value = link;
  input.addEventListener("focus", () => input.select());
  const share = app.querySelector(".share-link-button");
  share.textContent = nativeShare ? "Compartir" : "Copiar enlace";
  share.addEventListener("click", async () => {
    const result = await shareLink(link, title || "Examen de nacionalización ecuatoriana");
    if (result === "copied") status.textContent = "Enlace copiado.";
    if (result === "failed") {
      input.select();
      status.textContent = "Mantén presionado el enlace para copiarlo.";
    }
  });

  const print = app.querySelector(".print-shared");
  print.disabled = !cards.length;
  print.addEventListener("click", () => openPrintDialog(cards, title));
  app.querySelector(".edit-shared").addEventListener("click", async () => {
    const ids = cards.map((card) => card.id);
    const draft = progress.draft.ids;
    const same = draft.length === ids.length && draft.every((id, index) => id === ids[index]);
    if (draft.length && !same && !(await askConfirm({
      title: "¿Reemplazar tu examen a medias?",
      text: `Ya estabas creando un examen con ${plural(draft.length, "pregunta", "preguntas")}. Si sigues, se reemplaza por este.`,
      ok: "Reemplazar",
    }))) return;
    // Only your own saved exams change in place; any other one is copied.
    progress.draft = saved
      ? { title: saved.title, ids, editing: saved.id }
      : { title: featured ? `${title} (copia)` : title, ids };
    saveProgress();
    showBuilder();
  });
  const saved = findSavedExam(ids);
  app.querySelector(".edit-shared").textContent = saved ? "Editar" : "Copiar y editar";
  app.querySelector(".shared .eyebrow").textContent =
    saved ? "Mis exámenes" : featured ? "Examen recomendado" : "Examen compartido";
  const save = app.querySelector(".save-shared");
  save.hidden = Boolean(saved || featured);
  save.addEventListener("click", () => openSavedExam(saveExam({ title, ids: cards.map((card) => card.id) })));
  const remove = app.querySelector(".delete-shared");
  remove.hidden = !saved;
  remove.addEventListener("click", async () => {
    if (!(await askConfirm({
      title: "¿Eliminar este examen?",
      text: "Se quitará de «Mis exámenes» en este dispositivo. Los enlaces que ya compartiste siguen funcionando.",
      ok: "Eliminar",
    }))) return;
    progress.exams = progress.exams.filter((exam) => exam !== saved);
    saveProgress();
    showHome();
  });
  app.querySelector(".back-home").addEventListener("click", showHome);
  app.focus({ preventScroll: true });
}

// Print ----------------------------------------------------------------------

const printArea = document.getElementById("print-area");

// Cloze cards made from the same text (a card per hole, like each line of the
// anthem) would print the same text over and over. With answers, print it once
// with every hole; without answers each card keeps its single blank.
function mergeClozeSiblings(cards) {
  const groups = new Map();
  const merged = [];
  for (const card of cards) {
    if (card.type !== "cloze") {
      merged.push(card);
      continue;
    }
    const base = card.id.split(".")[0];
    if (!groups.has(base)) {
      groups.set(base, []);
      merged.push({ ...card, siblings: groups.get(base) });
    }
    groups.get(base).push(card);
  }
  return merged.map((card) => (card.siblings ? withAllHoles(card.siblings) : card));
}

function withAllHoles(siblings) {
  const holes = new Set(siblings.flatMap((card) => card.front
    .filter((segment) => segment.cloze)
    .map((segment) => segment.text)));
  const front = [];
  for (const segment of siblings[0].front) {
    if (segment.cloze) {
      front.push(segment);
      continue;
    }
    // Split plain text wherever another sibling hides part of it.
    let pieces = [{ ...segment }];
    for (const hole of holes) {
      pieces = pieces.flatMap((piece) => {
        if (piece.cloze || !piece.text.includes(hole)) return [piece];
        return piece.text.split(hole).flatMap((part, index) => (index
          ? [{ ...segment, text: hole, cloze: true }, { ...segment, text: part }]
          : [{ ...segment, text: part }]));
      });
    }
    front.push(...pieces.filter((piece) => piece.text));
  }
  return { ...siblings[0], front };
}

// Image cards only make sense with their picture, so a text-only print skips them.
function printableCards({ answers, images }) {
  const cards = state.print.cards.filter((card) => images || card.type !== "image");
  return answers ? mergeClozeSiblings(cards) : cards;
}

function printOptions() {
  const dialog = document.getElementById("print-dialog");
  return {
    answers: dialog.querySelector("#print-answers").checked,
    images: dialog.querySelector("#print-images").checked,
  };
}

function updatePrintSummary() {
  const dialog = document.getElementById("print-dialog");
  const options = printOptions();
  const count = printableCards(options).length;
  const skipped = printableCards({ ...options, images: true }).length - count;
  dialog.querySelector(".print-go").disabled = count === 0;
  dialog.querySelector(".print-summary").textContent = count === 0
    ? "Sin imágenes no hay nada que imprimir: estas preguntas solo tienen sentido con su imagen. Activa «Incluir imágenes y fotos»."
    : `Se imprimirán ${plural(count, "pregunta", "preguntas")}.`
      + (skipped ? ` Sin imágenes se omiten ${skipped} que solo tienen sentido con su imagen.` : "");
}

function openPrintDialog(cards, title = "") {
  state.print = { cards, title };
  const dialog = document.getElementById("print-dialog");
  updatePrintSummary();
  dialog.showModal();
}

function printSegments(segments, answers) {
  // Without answers, hidden cloze text becomes a blank line to fill in.
  return renderSegments(
    (segments || []).map((segment) => (segment.cloze && !answers
      ? { text: "________" }
      : segment)),
    { revealCloze: true },
  );
}

function renderPrintCard(card, { answers, images }) {
  const item = document.createElement("li");
  item.className = "print-card";
  if (card.front?.length) {
    const question = document.createElement("p");
    question.className = "print-question";
    question.append(printSegments(card.front, answers));
    item.append(question);
  }
  if (card.image && images) item.append(renderImage(card.image, { revealed: answers }));
  if (card.type === "choice") {
    const options = document.createElement("ol");
    options.className = "print-options";
    const correct = new Set(correctOptions(card));
    card.options.forEach((option, index) => {
      const li = document.createElement("li");
      li.textContent = option;
      if (answers && correct.has(index)) li.className = "is-correct";
      options.append(li);
    });
    if (isMultiChoice(card)) {
      const hint = document.createElement("p");
      hint.className = "print-note";
      hint.textContent = "Puede haber más de una respuesta correcta.";
      item.append(hint);
    }
    item.append(options);
  }
  if (card.type === "basic") {
    const answer = document.createElement("p");
    answer.className = answers ? "print-answer" : "print-blank";
    if (answers) answer.append(printSegments(card.back, true));
    item.append(answer);
  }
  if (answers && card.explanation) item.append(renderExplanation(card.explanation));
  if (answers && images && card.photo) {
    const photo = renderPhoto(card.photo);
    photo.classList.add("print-photo");
    item.append(photo);
  }
  return item;
}

function buildPrintArea({ answers, images }) {
  const cards = printableCards({ answers, images });
  const header = document.createElement("header");
  header.className = "print-header";
  const title = document.createElement("h1");
  title.textContent = state.print.title || "Examen de Nacionalización Ecuatoriana";
  const meta = document.createElement("p");
  const date = new Date().toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" });
  meta.textContent = `${cards.length} preguntas · ${answers ? "con respuestas" : "sin respuestas"} · ${date}`;
  const note = document.createElement("p");
  note.className = "print-disclaimer";
  note.textContent = "Material gratuito con fines exclusivamente pedagógicos; no es material oficial. "
    + "sauljabin.github.io/examen-de-nacionalidad-ecuatoriana";
  header.append(title, meta, note);

  const content = [header];
  let number = 0;
  for (const category of state.categories) {
    for (const sub of category.subcategories) {
      const subCards = cards.filter((card) => card.subcategory === sub.title && card.category === category.title);
      if (!subCards.length) continue;
      const heading = document.createElement("h2");
      heading.textContent = `${category.title} › ${sub.title}`;
      const list = document.createElement("ol");
      list.className = "print-list";
      list.start = number + 1;
      number += subCards.length;
      list.append(...subCards.map((card) => renderPrintCard(card, { answers, images })));
      content.push(heading, list);
    }
  }
  printArea.replaceChildren(...content);
}

function imagesLoaded(root) {
  return Promise.all([...root.querySelectorAll("img")].map((img) => (img.complete
    ? null
    : new Promise((resolve) => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    }))));
}

function setupPrint() {
  const dialog = document.getElementById("print-dialog");
  const go = dialog.querySelector(".print-go");
  dialog.querySelector("#print-images").addEventListener("change", updatePrintSummary);
  dialog.querySelector("#print-answers").addEventListener("change", updatePrintSummary);
  go.addEventListener("click", async () => {
    const options = printOptions();
    go.disabled = true;
    go.textContent = "Preparando…";
    buildPrintArea(options);
    // Wait for pictures so they appear in the print or PDF.
    await imagesLoaded(printArea);
    go.disabled = false;
    go.textContent = "Imprimir";
    dialog.close();
    window.print();
  });
  window.addEventListener("afterprint", () => printArea.replaceChildren());
}

// Install --------------------------------------------------------------------

// Chrome, Edge and Android fire "beforeinstallprompt"; we keep it to open the
// install dialog from our own button. Safari on iPhone has no such event, so
// there we explain how to add the page to the home screen.
let installPrompt = null;

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function installDismissed() {
  try {
    return localStorage.getItem("installDismissed") === "1";
  } catch {
    return false;
  }
}

function installMode() {
  if (isInstalled() || installDismissed()) return null;
  if (installPrompt) return "prompt";
  if (isIOS()) return "ios";
  return null;
}

function renderInstall(mode) {
  const section = app.querySelector(".install");
  if (!section) return;
  section.hidden = !mode;
  if (!mode) return;
  section.querySelector(".install-button").hidden = mode !== "prompt";
  section.querySelector(".install-message").textContent = mode === "prompt"
    ? "Tenla a mano en tu pantalla de inicio y úsala sin internet."
    : "En el iPhone, toca el botón Compartir y luego «Agregar a pantalla de inicio». Después funciona sin internet.";
}

function setupInstall() {
  const section = app.querySelector(".install");
  section.querySelector(".install-button").addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    renderInstall(installMode());
  });
  section.querySelector(".install-dismiss").addEventListener("click", () => {
    try {
      localStorage.setItem("installDismissed", "1");
    } catch {}
    renderInstall(null);
  });
  renderInstall(installMode());
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  renderInstall(installMode());
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  renderInstall(null);
});

// Startup --------------------------------------------------------------------

document.addEventListener("keydown", (event) => {
  if (app.querySelector(".study") && !event.repeat && !document.querySelector("dialog[open]")) {
    // A focused button or link already reacts to Space and Enter by itself.
    const onControl = event.target instanceof Element && event.target.closest("a, button");
    if (onControl && (event.key === " " || event.key === "Enter")) return;
    if (event.key === "ArrowRight" || event.key === " " || event.key === "Enter") {
      event.preventDefault();
      moveStudy(1);
    } else if (event.key === "ArrowLeft") {
      moveStudy(-1);
    } else if (event.key === "Escape") {
      endStudy();
    } else if (event.key === "m" || event.key === "M") {
      app.querySelector(".exam-bar .mark")?.click();
    } else if (event.key === "l" || event.key === "L") {
      toggleSpeaking();
    }
    return;
  }
  if (!app.querySelector(".question") || event.repeat) return;
  if (document.querySelector("dialog[open]")) return;
  if (event.key === "Escape") {
    confirmExit();
  } else if (event.key === "m" || event.key === "M") {
    app.querySelector(".exam-bar .mark")?.click();
  } else if (event.key === "l" || event.key === "L") {
    toggleSpeaking();
  } else if (state.queue[state.index]?.type === "choice") {
    const position = Number(event.key) - 1;
    if (!state.revealed && state.optionOrder?.[position] !== undefined) {
      choose(state.optionOrder[position]);
    } else if (event.key === " " || event.key === "Enter") {
      const card = state.queue[state.index];
      if (state.mock) {
        // Enter on a focused button already clicks it.
        if (event.key === "Enter" && !(event.target instanceof Element && event.target.closest("button"))) {
          event.preventDefault();
          saveMockAnswer();
        }
      } else if (state.revealed) {
        event.preventDefault();
        grade(state.choiceResult);
      } else if (isMultiChoice(card) && event.key === "Enter") {
        // Enter checks the answer; Space toggles the focused option.
        event.preventDefault();
        checkSelection();
      }
    }
  } else if (event.key === " " || event.key === "Enter") {
    if (!state.revealed) {
      event.preventDefault();
      reveal();
    }
  } else if (event.key === "1") {
    grade(false);
  } else if (event.key === "2") {
    grade(true);
  }
});

document.getElementById("report-link").href = issueUrl("error.yml");
document.getElementById("suggest-link").href = issueUrl("incluir-pregunta.yml");
document.getElementById("repo-link").href = REPO_URL;
setupSettings();
setupPrint();

// Offline support: the service worker caches the site after the first visit.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

fetch("data/cards.json")
  .then((response) => response.json())
  .then((data) => {
    state.categories = data.categories;
    state.featuredExams = data.exams || [];
    state.allCards = [];
    for (const category of data.categories) {
      for (const sub of category.subcategories) {
        state.selected.add(subcategoryKey(category, sub));
        for (const card of sub.cards) {
          card.category = category.title;
          card.subcategory = sub.title;
          card.code = shortCode(card.id);
          if (state.cardsByCode.has(card.code)) {
            console.error(`Questions ${card.id} and ${state.cardsByCode.get(card.code).id} share the link code ${card.code}`);
          }
          state.cardsById.set(card.id, card);
          state.cardsByCode.set(card.code, card);
          state.allCards.push(card);
        }
      }
    }
    // Shared links: an exam (#examen=) or a set of topics (#temas=).
    const route = () => {
      const exam = examFromHash();
      const topics = topicsFromHash();
      if (exam) showShared(exam);
      else if (topics) showSharedTopics(topics);
      else if (["#preguntas-frecuentes", "#como-es-el-examen"].includes(location.hash)) showFaq();
      else return false;
      return true;
    };
    if (!route()) showHome();
    // A shared link pasted into a tab where the site is already open.
    window.addEventListener("hashchange", route);
  })
  .catch(() => {
    app.innerHTML = '<p class="loading">No se pudieron cargar las preguntas.</p>';
  });
