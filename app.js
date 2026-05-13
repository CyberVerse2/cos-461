const stateKey = "cos-461-quiz-progress-v2";

const els = {
  progressText: document.querySelector("#progressText"),
  scoreText: document.querySelector("#scoreText"),
  questionCount: document.querySelector("#questionCount"),
  filterSelect: document.querySelector("#filterSelect"),
  meterFill: document.querySelector("#meterFill"),
  questionList: document.querySelector("#questionList"),
  sourceBadge: document.querySelector("#sourceBadge"),
  statusBadge: document.querySelector("#statusBadge"),
  questionText: document.querySelector("#questionText"),
  notesInput: document.querySelector("#notesInput"),
  answerBox: document.querySelector("#answerBox"),
  answerText: document.querySelector("#answerText"),
  prevButton: document.querySelector("#prevButton"),
  revealButton: document.querySelector("#revealButton"),
  reviewButton: document.querySelector("#reviewButton"),
  nextButton: document.querySelector("#nextButton"),
  gradeRow: document.querySelector("#gradeRow"),
  resetButton: document.querySelector("#resetButton"),
  reviewBox: document.querySelector("#reviewBox"),
  reviewVerdict: document.querySelector("#reviewVerdict"),
  reviewScore: document.querySelector("#reviewScore"),
  reviewStrengths: document.querySelector("#reviewStrengths"),
  reviewGaps: document.querySelector("#reviewGaps"),
  reviewNextStep: document.querySelector("#reviewNextStep"),
};

let questions = [];
let currentIndex = 0;
let progress = { grades: {}, notes: {}, revealed: {}, reviews: {} };
let reviewTimer = null;

function loadProgress() {
  try {
    const saved = localStorage.getItem(stateKey);
    if (saved) progress = JSON.parse(saved);
  } catch {
    progress = { grades: {}, notes: {}, revealed: {}, reviews: {} };
  }
  progress.grades ||= {};
  progress.notes ||= {};
  progress.revealed ||= {};
  progress.reviews ||= {};
}

function saveProgress() {
  localStorage.setItem(stateKey, JSON.stringify(progress));
}

function gradeLabel(grade) {
  if (grade === "strong") return "Strong";
  if (grade === "ok") return "Almost";
  if (grade === "again") return "Needs work";
  return "Unseen";
}

function activeQuestion() {
  return questions[currentIndex];
}

function reviewToGrade(verdict) {
  if (verdict === "strong") return "strong";
  if (verdict === "almost") return "ok";
  return "again";
}

function verdictLabel(verdict) {
  if (verdict === "strong") return "Strong answer";
  if (verdict === "almost") return "Almost there";
  if (verdict === "needs_work") return "Needs work";
  return "Review unavailable";
}

function filteredQuestions() {
  const filter = els.filterSelect.value;
  if (filter === "all") return questions;
  if (filter === "unseen") return questions.filter((q) => !progress.grades[q.id]);
  return questions.filter((q) => progress.grades[q.id] === filter);
}

function renderList() {
  const visible = filteredQuestions();
  els.questionList.innerHTML = "";

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No questions match this filter.";
    els.questionList.append(empty);
    return;
  }

  visible.forEach((question) => {
    const index = questions.findIndex((item) => item.id === question.id);
    const grade = progress.grades[question.id] || "unseen";
    const button = document.createElement("button");
    button.className = `question-item ${index === currentIndex ? "active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="q-number">${index + 1}</span>
      <span class="q-title">S${question.section}.${question.sourceNumber} ${question.question}</span>
      <span class="dot ${grade}" aria-label="${gradeLabel(grade)}"></span>
    `;
    button.addEventListener("click", () => {
      persistCurrentNotes();
      currentIndex = index;
      render();
    });
    els.questionList.append(button);
  });
}

function persistCurrentNotes() {
  const question = activeQuestion();
  if (!question) return;
  progress.notes[question.id] = els.notesInput.value;
  saveProgress();
}

function updateStats() {
  const reviewed = questions.filter((q) => progress.grades[q.id]).length;
  const strong = questions.filter((q) => progress.grades[q.id] === "strong").length;
  const percent = questions.length ? Math.round((reviewed / questions.length) * 100) : 0;

  els.progressText.textContent = `${reviewed} of ${questions.length} reviewed`;
  els.scoreText.textContent = `${strong} strong`;
  els.questionCount.textContent = `${questions.length} questions`;
  els.meterFill.style.width = `${percent}%`;
}

function renderQuestion() {
  const question = activeQuestion();
  const grade = progress.grades[question.id];
  const revealed = Boolean(progress.revealed[question.id]);
  const review = progress.reviews[question.id];

  els.sourceBadge.textContent = `S${question.section} Q${question.sourceNumber}`;
  els.statusBadge.textContent = gradeLabel(grade);
  els.questionText.textContent = question.question;
  els.notesInput.value = progress.notes[question.id] || "";
  renderAnswerContent(question.answer);
  els.answerBox.hidden = !revealed;
  els.gradeRow.hidden = !revealed;
  els.revealButton.textContent = revealed ? "Hide Answer" : "Reveal Answer";
  els.reviewButton.disabled = !progress.notes[question.id]?.trim();
  renderReview(review);
  els.prevButton.disabled = currentIndex === 0;
  els.nextButton.disabled = currentIndex === questions.length - 1;

  document.querySelectorAll(".grade-button").forEach((button) => {
    button.classList.toggle("selected", button.dataset.grade === grade);
  });
}

function renderAnswerContent(answer) {
  els.answerText.innerHTML = "";
  const parts = answer.split(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g);

  for (let i = 0; i < parts.length; i += 3) {
    appendAnswerParagraphs(parts[i]);
    if (parts[i + 2] !== undefined) {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = parts[i + 2].trimEnd();
      pre.append(code);
      els.answerText.append(pre);
    }
  }
}

function appendAnswerParagraphs(text) {
  text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = part.replace(/\n/g, " ");
      els.answerText.append(paragraph);
    });
}

function renderReview(review) {
  els.reviewBox.hidden = !review;
  if (!review) return;

  els.reviewVerdict.textContent = review.error ? "Review failed" : verdictLabel(review.verdict);
  els.reviewScore.textContent = review.score === undefined ? "!" : `${review.score}%`;
  els.reviewStrengths.innerHTML = "";
  els.reviewGaps.innerHTML = "";

  const strengths = review.strengths?.length ? review.strengths : ["No strengths returned."];
  const gaps = review.gaps?.length ? review.gaps : [review.error || "No gaps returned."];

  strengths.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    els.reviewStrengths.append(li);
  });

  gaps.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    els.reviewGaps.append(li);
  });

  els.reviewNextStep.textContent = review.nextStep || "Try again with a more complete answer.";
}

function render() {
  updateStats();
  renderQuestion();
  renderList();
}

async function init() {
  loadProgress();
  const response = await fetch("questions.json");
  questions = await response.json();
  render();
}

els.revealButton.addEventListener("click", () => {
  const question = activeQuestion();
  progress.revealed[question.id] = !progress.revealed[question.id];
  persistCurrentNotes();
  render();
});

els.prevButton.addEventListener("click", () => {
  persistCurrentNotes();
  currentIndex = Math.max(0, currentIndex - 1);
  render();
});

els.nextButton.addEventListener("click", () => {
  persistCurrentNotes();
  currentIndex = Math.min(questions.length - 1, currentIndex + 1);
  render();
});

els.gradeRow.addEventListener("click", (event) => {
  const button = event.target.closest("[data-grade]");
  if (!button) return;
  progress.grades[activeQuestion().id] = button.dataset.grade;
  persistCurrentNotes();
  render();
});

els.notesInput.addEventListener("input", () => {
  persistCurrentNotes();
  renderQuestion();
});

els.reviewButton.addEventListener("click", async () => {
  const question = activeQuestion();
  persistCurrentNotes();

  const userAnswer = progress.notes[question.id]?.trim();
  if (!userAnswer) return;

  els.reviewButton.disabled = true;
  const startedAt = Date.now();
  els.reviewButton.textContent = "Reviewing 0s";
  reviewTimer = window.setInterval(() => {
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    els.reviewButton.textContent = `Reviewing ${seconds}s`;
  }, 500);

  try {
    const response = await fetch("/api/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: question.question,
        modelAnswer: question.answer,
        userAnswer,
      }),
    });
    const review = await response.json();
    if (!response.ok) throw new Error(review.error || "AI review failed.");

    progress.reviews[question.id] = review;
    progress.grades[question.id] = reviewToGrade(review.verdict);
    progress.revealed[question.id] = true;
  } catch (error) {
    progress.reviews[question.id] = {
      error: error.message,
      gaps: [error.message],
      nextStep: "Check the OpenAI API configuration, then run the review again.",
    };
  } finally {
    window.clearInterval(reviewTimer);
    reviewTimer = null;
    saveProgress();
    els.reviewButton.textContent = "Review My Answer";
    render();
  }
});

els.filterSelect.addEventListener("change", () => {
  renderList();
});

els.resetButton.addEventListener("click", () => {
  const confirmed = window.confirm("Reset all notes, reveals, and self-grades?");
  if (!confirmed) return;
  progress = { grades: {}, notes: {}, revealed: {}, reviews: {} };
  currentIndex = 0;
  saveProgress();
  render();
});

document.addEventListener("keydown", (event) => {
  if (event.target.matches("textarea, select")) return;
  if (event.key === "ArrowRight") els.nextButton.click();
  if (event.key === "ArrowLeft") els.prevButton.click();
  if (event.key.toLowerCase() === " ") {
    event.preventDefault();
    els.revealButton.click();
  }
});

init().catch(() => {
  els.questionText.textContent = "Could not load the question bank.";
});
