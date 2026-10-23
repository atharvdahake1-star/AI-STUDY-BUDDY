
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const STORAGE_KEY = "studyBuddyProfessionalV1";
const THEME_KEY = "studyBuddyThemeV1";

function emptySubject() {
  return { notes: [], cards: [], images: [] };
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.subjects) && saved.subjects.length) {
      const subjects = {};
      saved.subjects.forEach(name => {
        if (typeof name === "string" && name.trim()) {
          subjects[name] = {
            notes: Array.isArray(saved.data?.[name]?.notes) ? saved.data[name].notes : [],
            cards: Array.isArray(saved.data?.[name]?.cards) ? saved.data[name].cards : [],
            images: Array.isArray(saved.data?.[name]?.images) ? saved.data[name].images : []
          };
        }
      });
      if (Object.keys(subjects).length) {
        return { subjects, current: subjects[saved.current] ? saved.current : Object.keys(subjects)[0] };
      }
    }
  } catch (error) {
    console.warn("Could not load saved study data.", error);
  }

  return {
    subjects: { "General": emptySubject() },
    current: "General"
  };
}

let app = loadData();
let activeCard = 0;
let showingAnswer = false;
let quizRun = [];
let quizScore = 0;
let quizAnswered = 0;
let toastTimer;

function currentData() {
  return app.subjects[app.current];
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      subjects: Object.keys(app.subjects),
      current: app.current,
      data: app.subjects
    }));
    return true;
  } catch (error) {
    notify("Couldn't save. Browser storage may be full.");
    return false;
  }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function renderSubjects() {
  const select = $("#subjectSelect");
  select.innerHTML = Object.keys(app.subjects)
    .map(name => `<option value="${escapeHTML(name)}" ${name === app.current ? "selected" : ""}>${escapeHTML(name)}</option>`)
    .join("");
}

function updateStats() {
  const data = currentData();
  $("#noteCount").textContent = data.notes.length;
  $("#cardCount").textContent = data.cards.length;

  const terms = data.notes.flatMap(note => parseTerms(note.content));
  $("#quizCount").textContent = Math.max(0, terms.length);
  $("#imageCount").textContent = data.images.length;
}

function showView(name) {
  const view = document.getElementById(name);
  if (!view) return;

  $$(".view").forEach(section => section.classList.toggle("active", section.id === name));
  $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === name));

  const titles = {
    overview: ["Good to see you", "Organise your notes. Test your knowledge. Keep learning."],
    notes: ["My Notes", "Capture the concepts you want to remember."],
    flashcards: ["Flashcards", "Practise recall and strengthen your understanding."],
    quiz: ["Quick Quiz", "Turn your own notes into practice questions."],
    images: ["Reference Images", "Keep useful diagrams and visual resources together."]
  };

  $("#pageTitle").innerHTML = `${titles[name][0]} <span class="accent">✦</span>`;
  $("#pageSubtitle").textContent = titles[name][1];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$$(".nav-item").forEach(button => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

$$("[data-go]").forEach(button => {
  button.addEventListener("click", () => showView(button.dataset.go));
});

$("#todayDate").textContent = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric"
}).format(new Date());

function renderAll() {
  renderSubjects();
  renderNotes();
  renderCards();
  renderImages();
  updateStats();
}

$("#subjectSelect").addEventListener("change", event => {
  if (!app.subjects[event.target.value]) return;
  app.current = event.target.value;
  activeCard = 0;
  showingAnswer = false;
  saveData();
  renderAll();
  $("#quizArea").innerHTML = "";
  notify(`Switched to ${app.current}`);
});

$("#addSubject").addEventListener("click", () => {
  const name = prompt("Enter a subject name (e.g. Physics, Chemistry, Mathematics):");
  if (name === null) return;

  const cleanName = name.trim();
  if (!cleanName) return notify("Please enter a subject name.");
  if (cleanName.length > 50) return notify("Keep subject names under 50 characters.");
  if (app.subjects[cleanName]) return notify("That subject already exists.");

  app.subjects[cleanName] = emptySubject();
  app.current = cleanName;
  saveData();
  renderAll();
  $("#quizArea").innerHTML = "";
  showView("overview");
  notify("New subject created!");
});

$("#deleteSubject").addEventListener("click", () => {
  const name = app.current;
  if (Object.keys(app.subjects).length === 1) {
    return notify("Keep at least one subject in your workspace.");
  }

  if (!confirm(`Delete "${name}" and all its saved notes, cards and references?`)) return;

  delete app.subjects[name];
  app.current = Object.keys(app.subjects)[0];
  activeCard = 0;
  showingAnswer = false;
  saveData();
  renderAll();
  $("#quizArea").innerHTML = "";
  showView("overview");
  notify("Subject deleted.");
});

$("#noteForm").addEventListener("submit", event => {
  event.preventDefault();

  const title = $("#noteTitle").value.trim();
  const content = $("#noteContent").value.trim();
  if (!title || !content) return;

  currentData().notes.unshift({
    id: crypto.randomUUID(),
    title,
    content,
    createdAt: new Date().toISOString()
  });

  saveData();
  event.target.reset();
  renderNotes();
  updateStats();
  notify("Notes saved!");
});

function renderNotes() {
  const list = $("#notesList");
  const notes = currentData().notes;

  if (!notes.length) {
    list.innerHTML = `<div class="empty-state"><strong>No notes yet</strong>Add your first set of notes using the form above.</div>`;
    return;
  }

  list.innerHTML = notes.map(note => `
    <article class="item-card">
      <h3>${escapeHTML(note.title)}</h3>
      <p>${escapeHTML(note.content)}</p>
      <div class="item-actions">
        <button class="btn btn-secondary" data-edit-note="${note.id}">Edit</button>
        <button class="btn btn-danger" data-delete-note="${note.id}">Delete</button>
      </div>
    </article>
  `).join("");

  $$("[data-delete-note]").forEach(button => {
    button.addEventListener("click", () => {
      currentData().notes = currentData().notes.filter(note => note.id !== button.dataset.deleteNote);
      saveData();
      renderNotes();
      updateStats();
      notify("Note deleted.");
    });
  });

  $$("[data-edit-note]").forEach(button => {
    button.addEventListener("click", () => {
      const note = currentData().notes.find(item => item.id === button.dataset.editNote);
      if (!note) return;

      $("#noteTitle").value = note.title;
      $("#noteContent").value = note.content;
      currentData().notes = currentData().notes.filter(item => item.id !== note.id);
      saveData();
      renderNotes();
      updateStats();
      $("#noteTitle").focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

$("#cardForm").addEventListener("submit", event => {
  event.preventDefault();

  currentData().cards.push({
    id: crypto.randomUUID(),
    front: $("#cardFront").value.trim(),
    back: $("#cardBack").value.trim()
  });

  saveData();
  event.target.reset();
  renderCards();
  updateStats();
  notify("Flashcard added!");
});

function renderCards() {
  const list = $("#cardsList");
  const cards = currentData().cards;
  const study = $("#flashcardStudy");

  study.classList.toggle("hidden", cards.length === 0);

  if (!cards.length) {
    list.innerHTML = `<div class="empty-state"><strong>No flashcards yet</strong>Create a card above to begin revising.</div>`;
    return;
  }

  activeCard = Math.min(activeCard, cards.length - 1);
  showCurrentCard();

  list.innerHTML = cards.map(card => `
    <article class="item-card">
      <h3>${escapeHTML(card.front)}</h3>
      <p>${escapeHTML(card.back)}</p>
      <div class="item-actions">
        <button class="btn btn-danger" data-delete-card="${card.id}">Delete</button>
      </div>
    </article>
  `).join("");

  $$("[data-delete-card]").forEach(button => {
    button.addEventListener("click", () => {
      currentData().cards = currentData().cards.filter(card => card.id !== button.dataset.deleteCard);
      activeCard = Math.max(0, Math.min(activeCard, currentData().cards.length - 1));
      showingAnswer = false;
      saveData();
      renderCards();
      updateStats();
      notify("Flashcard deleted.");
    });
  });
}

function showCurrentCard() {
  const cards = currentData().cards;
  if (!cards.length) return;

  const card = cards[activeCard];
  $("#flashcardFace").textContent = showingAnswer ? card.back : card.front;
  $("#flipCard").textContent = showingAnswer ? "Show question" : "Show answer";
  $("#cardPosition").textContent = `${activeCard + 1} of ${cards.length}`;
  $("#prevCard").disabled = activeCard === 0;
  $("#nextCard").disabled = activeCard === cards.length - 1;
}

$("#flipCard").addEventListener("click", () => {
  showingAnswer = !showingAnswer;
  showCurrentCard();
});

$("#prevCard").addEventListener("click", () => {
  if (activeCard > 0) {
    activeCard--;
    showingAnswer = false;
    showCurrentCard();
  }
});

$("#nextCard").addEventListener("click", () => {
  if (activeCard < currentData().cards.length - 1) {
    activeCard++;
    showingAnswer = false;
    showCurrentCard();
  }
});

// Notes should contain lines such as:
// Mitochondria: The powerhouse of the cell.
function parseTerms(content) {
  return content.split("\n")
    .map(line => {
      const colon = line.indexOf(":");
      if (colon < 1) return null;
      const term = line.slice(0, colon).trim();
      const definition = line.slice(colon + 1).trim();
      return term && definition ? { term, definition } : null;
    })
    .filter(Boolean);
}

$("#generateQuiz").addEventListener("click", () => {
  const terms = currentData().notes.flatMap(note => parseTerms(note.content));

  if (terms.length < 2) {
    $("#quizArea").innerHTML = `<div class="empty-state"><strong>Add more study material</strong>Save at least two lines in the format Term: Definition. Three or more terms give you better answer choices.</div>`;
    return;
  }

  // Avoid repeated questions when the same term occurs in several notes.
  const unique = [...new Map(terms.map(item => [item.term.toLowerCase(), item])).values()];

  if (unique.length < 2) {
    notify("Add at least two different terms to your notes.");
    return;
  }

  quizRun = unique.map(item => {
    const distractors = unique
      .filter(other => other.term.toLowerCase() !== item.term.toLowerCase())
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const options = [item, ...distractors].sort(() => Math.random() - 0.5);

    return {
      ...item,
      options,
      correct: options.findIndex(option => option.term === item.term)
    };
  }).sort(() => Math.random() - 0.5);

  quizScore = 0;
  quizAnswered = 0;
  renderQuiz();
});

function renderQuiz() {
  const area = $("#quizArea");

  area.innerHTML = `
    <div class="panel form-panel">
      <strong>Practice quiz</strong>
      <p class="muted">Answer each question by choosing the term that matches the definition.</p>
      <p id="quizProgress" class="accent">0 of ${quizRun.length} answered</p>
    </div>
    ${quizRun.map((question, index) => `
      <article class="quiz-question" data-question="${index}">
        <p class="eyebrow">QUESTION ${index + 1} / ${quizRun.length}</p>
        <h3>${escapeHTML(question.definition)}</h3>
        <div>
          ${question.options.map((option, optionIndex) => `
            <button class="quiz-option" data-answer="${index}" data-option="${optionIndex}">
              ${String.fromCharCode(65 + optionIndex)}. ${escapeHTML(option.term)}
            </button>
          `).join("")}
        </div>
        <p class="quiz-feedback" aria-live="polite"></p>
      </article>
    `).join("")}
    <div id="quizResult" class="panel form-panel hidden"></div>
  `;

  $$("[data-answer]").forEach(button => {
    button.addEventListener("click", () => answerQuestion(button));
  });
}

function answerQuestion(button) {
  const index = Number(button.dataset.answer);
  const question = quizRun[index];
  const card = button.closest(".quiz-question");

  if (card.dataset.answered) return;
  card.dataset.answered = "true";
  quizAnswered++;

  const selected = Number(button.dataset.option);
  const correct = selected === question.correct;
  if (correct) quizScore++;

  card.querySelectorAll(".quiz-option").forEach(option => {
    option.disabled = true;
    if (Number(option.dataset.option) === question.correct) option.classList.add("correct");
  });

  if (!correct) button.classList.add("wrong");

  card.querySelector(".quiz-feedback").textContent = correct
    ? "Correct! Nice work."
    : `Not quite. The correct answer is ${question.term}.`;

  $("#quizProgress").textContent = `${quizAnswered} of ${quizRun.length} answered`;

  if (quizAnswered === quizRun.length) {
    const result = $("#quizResult");
    result.classList.remove("hidden");
    result.innerHTML = `
      <h2>Quiz complete ✦</h2>
      <p>You scored <strong>${quizScore} / ${quizRun.length}</strong>.</p>
      <p class="muted">${Math.round(quizScore / quizRun.length * 100)}% correct. Review any mistakes and try again.</p>
      <button class="btn btn-primary" id="retryQuiz">Try again</button>
    `;
    $("#retryQuiz").addEventListener("click", () => $("#generateQuiz").click());
    result.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

$("#imageForm").addEventListener("submit", event => {
  event.preventDefault();

  const title = $("#imageTitle").value.trim();
  const url = $("#imageUrl").value.trim();

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return notify("Enter a valid image URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return notify("Only HTTP and HTTPS links are allowed.");
  }

  currentData().images.unshift({
    id: crypto.randomUUID(),
    title,
    url: parsed.href
  });

  saveData();
  event.target.reset();
  renderImages();
  updateStats();
  notify("Reference saved!");
});

function renderImages() {
  const list = $("#imagesList");
  const images = currentData().images;

  if (!images.length) {
    list.innerHTML = `<div class="empty-state"><strong>No reference images yet</strong>Add a direct image link above to save a visual reference.</div>`;
    return;
  }

  list.innerHTML = images.map(item => `
    <article class="item-card">
      <img class="reference-image" src="${escapeHTML(item.url)}" alt="${escapeHTML(item.title)}" loading="lazy">
      <h3>${escapeHTML(item.title)}</h3>
      <p class="image-error hidden">This image could not be loaded. The link may have expired or block embedding.</p>
      <div class="item-actions">
        <button class="btn btn-secondary" data-open-image="${item.id}">Open link ↗</button>
        <button class="btn btn-danger" data-delete-image="${item.id}">Delete</button>
      </div>
    </article>
  `).join("");

  $$(".reference-image").forEach(img => {
    img.addEventListener("error", () => {
      img.classList.add("hidden");
      img.nextElementSibling?.classList.remove("hidden");
    }, { once: true });
  });

  $$("[data-open-image]").forEach(button => {
    button.addEventListener("click", () => {
      const item = images.find(image => image.id === button.dataset.openImage);
      if (item) window.open(item.url, "_blank", "noopener,noreferrer");
    });
  });

  $$("[data-delete-image]").forEach(button => {
    button.addEventListener("click", () => {
      currentData().images = currentData().images.filter(item => item.id !== button.dataset.deleteImage);
      saveData();
      renderImages();
      updateStats();
      notify("Reference deleted.");
    });
  });
};

$("#themeToggle").addEventListener("click", () => {
  const isLight = document.body.classList.toggle("light-theme");
  try {
    localStorage.setItem(THEME_KEY, isLight ? "light" : "dark");
  } catch {}
});

try {
  if (localStorage.getItem(THEME_KEY) === "light") {
    document.body.classList.add("light-theme");
  }
} catch {}

renderAll();