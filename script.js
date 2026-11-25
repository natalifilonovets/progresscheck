"use strict";

const BANK_VERSION = 1;
const STORAGE_KEY = "babymonster-vocabulary-tour";
const LETTERS = ["A", "B", "C", "D"];
const STAGES = ["STAGE 01", "STAGE 02", "STAGE 03", "FINAL ENCORE"];
const questions = window.QUESTIONS;
const byId = new Map(questions.map(question => [question.id, question]));
const groups = new Map();
for (const question of questions) {
  if (!groups.has(question.category)) groups.set(question.category, []);
  groups.get(question.category).push(question);
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Keep enough separators in reserve for every remaining group.
function interleave(buckets, conflicts = () => false) {
  const pool = [...buckets].map(([key, items]) => ({ key, items: shuffle(items) }));
  const result = [];
  let remaining = pool.reduce((sum, bucket) => sum + bucket.items.length, 0);
  let lastKey;
  let streak = 0;
  while (remaining) {
    const candidates = shuffle(pool.filter(bucket => bucket.items.length));
    const nextRun = bucket => bucket.key === lastKey ? streak + 1 : 1;
    const feasible = candidates.filter(candidate => nextRun(candidate) <= 2 &&
      pool.every(bucket => {
        const count = bucket.items.length - Number(bucket === candidate);
        const separators = remaining - 1 - count;
        const firstRun = bucket === candidate ? 2 - nextRun(candidate) : 2;
        return count <= separators * 2 + firstRun;
      }));

    // A mistake round can contain too few categories to satisfy the run limit.
    const choices = feasible.length ? feasible : candidates.filter(bucket => nextRun(bucket) <= 2);
    const available = choices.length ? choices : candidates;
    const next = available.find(bucket =>
      bucket.items.some(item => !conflicts(result.at(-1), item))) ?? available[0];
    const safeIndex = next.items.findIndex(item => !conflicts(result.at(-1), item));
    result.push(next.items.splice(Math.max(0, safeIndex), 1)[0]);
    streak = nextRun(next);
    lastKey = next.key;
    remaining--;
  }
  return result;
}

function quickSample() {
  const quotas = shuffle([...groups.values()]).map(items => {
    const share = items.length * 30 / questions.length;
    return { items, count: Math.floor(share), remainder: share % 1 };
  });
  quotas.sort((a, b) => b.remainder - a.remainder);
  const extra = 30 - quotas.reduce((sum, quota) => sum + quota.count, 0);
  return quotas.flatMap((quota, index) =>
    shuffle(quota.items).slice(0, quota.count + Number(index < extra)));
}

function normalise(text) {
  return " " + text.toLowerCase().replace(/[^a-z’']/g, " ").replace(/\s+/g, " ").trim() + " ";
}

function reveals(previous, next) {
  if (!previous) return false;
  const clues = normalise(previous.stem + " " + previous.correct + " " + previous.explanation);
  return clues.includes(normalise(next.correct)) || clues.includes(normalise(next.target)) ||
    previous.distractors.includes(next.correct) && next.distractors.includes(previous.correct);
}

function shuffleQuestions(items) {
  const buckets = new Map();
  for (const item of items) {
    if (!buckets.has(item.category)) buckets.set(item.category, []);
    buckets.get(item.category).push(item);
  }
  let best;
  let fewestConflicts = Infinity;
  for (let attempt = 0; attempt < 24; attempt++) {
    const deck = interleave(buckets, reveals);
    const conflicts = deck.filter((item, i) => reveals(deck[i - 1], item)).length;
    if (!conflicts) return deck;
    if (conflicts < fewestConflicts) {
      best = deck;
      fewestConflicts = conflicts;
    }
  }
  return best;
}

function balancedAnswerSlots(total) {
  const buckets = shuffle([0, 1, 2, 3]).map((slot, index) => [
    slot, Array(Math.floor(total / 4) + Number(index < total % 4)).fill(slot)
  ]);
  return interleave(buckets);
}

function createAttempt(mode, reviewIds = []) {
  const items = mode === "review" ? reviewIds.map(id => byId.get(id)) :
    mode === "quick" ? quickSample() : questions;
  const deck = shuffleQuestions(items);
  const slots = balancedAnswerSlots(deck.length);
  return {
    version: BANK_VERSION,
    mode,
    questionIds: deck.map(question => question.id),
    displayOptions: deck.map((question, i) => {
      const options = shuffle(question.distractors);
      options.splice(slots[i], 0, question.correct);
      return options;
    }),
    answers: [],
    position: 0,
    screen: "question"
  };
}

const app = document.querySelector("#app");
let notice = "";
let state = restore();

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return null;
    if (saved.version !== BANK_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      notice = "The question bank has changed. Start a new show to use the updated questions.";
      return null;
    }
    return saved;
  } catch {
    notice = "Saved progress is unavailable in this browser.";
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    notice = "This browser could not save your progress.";
  }
}

function focusTitle() {
  app.querySelector("h1").focus();
  window.scrollTo(0, 0);
}

function showIntro(moveFocus = true) {
  app.replaceChildren(document.querySelector("#intro").content.cloneNode(true));
  const form = app.querySelector("#setup");
  const resume = app.querySelector("#resume");
  const pending = state && state.screen !== "results";
  const status = app.querySelector("#notice");
  status.hidden = !notice;
  status.textContent = notice;
  if (pending) {
    resume.hidden = false;
    resume.addEventListener("click", render);
    app.querySelector("#start").textContent = "START NEW";
    if (state.mode === "quick") form.elements.mode.value = "quick";
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (pending && !window.confirm("Replace your unfinished show with a new one?")) return;
    start(form.elements.mode.value);
  });
  if (moveFocus) focusTitle();
}

function start(mode, reviewIds) {
  state = createAttempt(mode, reviewIds);
  save();
  render();
}

function stageEnds() {
  const total = state.questionIds.length;
  if (state.mode === "review") return [total];
  const base = Math.floor(total / 4);
  return STAGES.map((_, i) => base * (i + 1) + Math.min(i + 1, total % 4));
}

function stageName() {
  if (state.mode === "review") return "MISTAKE REVIEW";
  return STAGES[stageEnds().findIndex(end => state.position < end)];
}

function modeName(mode) {
  return { full: "FULL WORLD TOUR", quick: "QUICK COMEBACK", review: "MISTAKE REVIEW" }[mode];
}

function render() {
  if (state.screen === "results") showResults();
  else if (state.screen === "stage") showStage();
  else showQuestion();
  focusTitle();
}

function currentQuestion() {
  return byId.get(state.questionIds[state.position]);
}

function showQuestion() {
  const total = state.questionIds.length;
  app.innerHTML = `
    <section class="quiz" aria-labelledby="stem">
      <div class="card">
        <div class="question-header"><p class="meta" id="question-counter"></p><button class="pause" id="pause">BACK TO START</button></div>
        <progress max="${total}" value="${state.answers.length}" aria-label="Questions answered"></progress>
        <h1 class="stem" id="stem" tabindex="-1" aria-describedby="question-counter"></h1>
        <div class="answers"></div>
        <div class="feedback" aria-live="polite"></div>
        <button type="button" class="primary" id="next" hidden>${state.position + 1 === total ? "SEE RESULTS" : "NEXT TRACK"}</button>
      </div>
      <aside class="rail"><p class="meta">NOW PLAYING</p><strong>${modeName(state.mode)}</strong><p>Choose an answer with the 1–4 keys.</p></aside>
    </section>`;
  app.querySelector("#question-counter").textContent = `Q ${state.position + 1} / ${total} · ${stageName()}`;
  const [before, after] = currentQuestion().stem.split("___");
  const blank = document.createElement("span");
  blank.className = "blank";
  blank.textContent = "___";
  blank.setAttribute("aria-label", "blank");
  app.querySelector("#stem").append(before, blank, after);
  const answers = app.querySelector(".answers");
  state.displayOptions[state.position].forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option";
    button.innerHTML = '<span class="letter"></span><span class="option-text"></span><span class="mark"></span>';
    button.querySelector(".letter").textContent = LETTERS[index];
    button.querySelector(".option-text").textContent = option;
    button.addEventListener("click", () => choose(option));
    answers.append(button);
  });
  app.querySelector("#next").addEventListener("click", advance);
  app.querySelector("#pause").addEventListener("click", () => showIntro());
  if (state.position < state.answers.length) showFeedback();
}

function choose(option) {
  if (state.screen !== "question" || state.position < state.answers.length) return;
  state.answers.push(option);
  save();
  showFeedback();
  app.querySelector("#next").focus();
}

function showFeedback() {
  const question = currentQuestion();
  const picked = state.answers[state.position];
  app.querySelectorAll(".option").forEach((button, index) => {
    const option = state.displayOptions[state.position][index];
    button.disabled = true;
    if (option === question.correct || option === picked) {
      const correct = option === question.correct;
      button.classList.add(correct ? "right" : "wrong");
      const mark = button.querySelector(".mark");
      mark.textContent = correct ? "✓" : "×";
      mark.setAttribute("aria-label", correct ? "Correct answer" : "Incorrect choice");
    }
  });
  const feedback = app.querySelector(".feedback");
  const heading = document.createElement("strong");
  heading.textContent = picked === question.correct ?
    "★ You got it!" : `Not quite — the correct answer is “${question.correct}”.`;
  const explanation = document.createElement("p");
  explanation.textContent = question.explanation;
  feedback.replaceChildren(heading, explanation);
  app.querySelector("progress").value = state.answers.length;
  app.querySelector("#next").hidden = false;
}

function advance() {
  if (state.position >= state.answers.length) return;
  const next = state.position + 1;
  if (next === state.questionIds.length) state.screen = "results";
  else if (stageEnds().includes(next)) state.screen = "stage";
  else state.position = next;
  save();
  render();
}

function showStage() {
  const ends = stageEnds();
  const end = state.position + 1;
  const startIndex = ends[ends.indexOf(end) - 1] ?? 0;
  const score = state.questionIds.slice(startIndex, end)
    .filter((id, index) => state.answers[startIndex + index] === byId.get(id).correct).length;
  app.innerHTML = `
    <section class="card results" aria-labelledby="stage-title">
      <p class="meta">${stageName()}</p>
      <h1 id="stage-title" tabindex="-1">STAGE CLEARED</h1>
      <p class="score">${score} / ${end - startIndex}</p>
      <p>Correct answers in this stage</p>
      <button class="primary" id="next-stage">NEXT STAGE</button>
    </section>`;
  app.querySelector("#next-stage").addEventListener("click", () => {
    state.position++;
    state.screen = "question";
    save();
    render();
  });
}

function showResults() {
  const total = state.questionIds.length;
  const mistakes = state.questionIds.map(id => byId.get(id)).filter(
    (question, index) => question.correct !== state.answers[index]);
  const correct = total - mistakes.length;
  const accuracy = correct * 100 / total;
  const percent = Number(accuracy.toFixed(1));
  const rating = accuracy >= 90 ? "MAIN STAGE ENERGY" : accuracy >= 75 ? "ENCORE READY" :
    accuracy >= 55 ? "KEEP REHEARSING" : "THE COMEBACK STARTS HERE";
  app.innerHTML = `
    <section class="card results" aria-labelledby="results-title">
      <p class="meta">${modeName(state.mode)} · RESULTS</p>
      <h1 id="results-title" tabindex="-1">${rating}</h1>
      <p class="score" aria-label="Score ${correct} out of ${total}">${correct} / ${total}</p>
      <p>${percent}% accuracy · ${correct} correct · ${mistakes.length} incorrect</p>
      <div class="actions">
        <button class="primary" id="review" ${mistakes.length ? "" : "hidden"}>REVIEW MY MISTAKES</button>
        <button id="again">PLAY AGAIN</button>
        <button id="copy">COPY RESULTS</button>
        <button id="home">BACK TO START</button>
      </div>
      <p id="copy-status" role="status"></p>
      <section class="review" aria-labelledby="review-title">
        <h2 id="review-title">Words to revisit</h2>
        <ul ${mistakes.length ? "" : "hidden"}></ul>
        <p ${mistakes.length ? "hidden" : ""}>Flawless set — nothing to review!</p>
      </section>
    </section>`;
  const list = app.querySelector(".review ul");
  for (const question of mistakes) {
    const item = document.createElement("li");
    const target = document.createElement("strong");
    const example = document.createElement("span");
    target.textContent = question.target;
    example.textContent = question.stem.replace("___", () => question.correct);
    item.append(target, example);
    list.append(item);
  }

  const ids = mistakes.map(question => question.id);
  app.querySelector("#review").addEventListener("click", () => start("review", ids));
  app.querySelector("#again").addEventListener("click", () => start(state.mode, state.questionIds));
  app.querySelector("#home").addEventListener("click", () => showIntro());
  app.querySelector("#copy").addEventListener("click", async () => {
    const status = app.querySelector("#copy-status");
    const report = [
      "BABYMONSTER · Vocabulary World Tour",
      modeName(state.mode),
      `Score ${correct}/${total} · ${percent}% accuracy · ${mistakes.length} incorrect`,
      rating,
      mistakes.length ? `Words to revisit: ${mistakes.map(question => question.target).join(", ")}` :
        "Flawless set — nothing to review!"
    ].join("\n");
    status.textContent = await copyText(report) ? "Results copied." : "Copy unavailable. Select the text below to copy.";
    if (status.textContent !== "Results copied.") {
      const manual = document.createElement("textarea");
      manual.setAttribute("aria-label", "Results to copy");
      manual.value = report;
      manual.readOnly = true;
      status.after(manual);
      manual.select();
    }
  });
}

async function copyText(report) {
  try {
    await navigator.clipboard.writeText(report);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = report;
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.append(field);
    field.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      field.remove();
    }
  }
}

document.addEventListener("keydown", event => {
  const options = app.querySelectorAll(".option");
  if (!options.length || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (state.position === state.answers.length && /^[1-4]$/.test(event.key)) {
    event.preventDefault();
    options[Number(event.key) - 1].click();
  } else if (event.key === "Enter" && event.target.id === "stem" && state.position < state.answers.length) {
    event.preventDefault();
    app.querySelector("#next").click();
  }
});

if (state) render();
else showIntro(false);
