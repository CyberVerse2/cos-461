const stateKey = "cos-431-options-quiz-progress-v1";
const letters = ["A", "B", "C", "D"];

const els = {
  scoreText: document.querySelector("#scoreText"),
  accuracyText: document.querySelector("#accuracyText"),
  answeredText: document.querySelector("#answeredText"),
  meterFill: document.querySelector("#meterFill"),
  questionGrid: document.querySelector("#questionGrid"),
  sectionText: document.querySelector("#sectionText"),
  numberText: document.querySelector("#numberText"),
  questionText: document.querySelector("#questionText"),
  optionsList: document.querySelector("#optionsList"),
  feedbackBox: document.querySelector("#feedbackBox"),
  feedbackTitle: document.querySelector("#feedbackTitle"),
  feedbackText: document.querySelector("#feedbackText"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  resetButton: document.querySelector("#resetButton"),
};

let questions = [];
let currentIndex = 0;
let progress = { answers: {} };

function loadProgress() {
  try {
    progress = JSON.parse(localStorage.getItem(stateKey)) || { answers: {} };
  } catch {
    progress = { answers: {} };
  }
  progress.answers ||= {};
}

function saveProgress() {
  localStorage.setItem(stateKey, JSON.stringify(progress));
}

function currentQuestion() {
  return questions[currentIndex];
}

function questionState(question) {
  const selected = progress.answers[question.id];
  if (selected === undefined) return "unanswered";
  return selected === question.answerIndex ? "correct" : "wrong";
}

function stats() {
  const answered = questions.filter((question) => progress.answers[question.id] !== undefined).length;
  const correct = questions.filter((question) => questionState(question) === "correct").length;
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  return { answered, correct, accuracy };
}

function renderStats() {
  const { answered, correct, accuracy } = stats();
  els.scoreText.textContent = `${correct} / ${questions.length}`;
  els.accuracyText.textContent = `${accuracy}% accuracy`;
  els.answeredText.textContent = `${answered} answered`;
  els.meterFill.style.width = `${questions.length ? (answered / questions.length) * 100 : 0}%`;
}

function renderGrid() {
  els.questionGrid.innerHTML = "";
  questions.forEach((question, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `jump-button ${questionState(question)} ${index === currentIndex ? "active" : ""}`;
    button.textContent = index + 1;
    button.setAttribute("aria-label", `Go to question ${index + 1}`);
    button.addEventListener("click", () => {
      currentIndex = index;
      render();
    });
    els.questionGrid.append(button);
  });
}

function renderQuestion() {
  const question = currentQuestion();
  const selected = progress.answers[question.id];
  const answered = selected !== undefined;

  els.sectionText.textContent = question.section;
  els.numberText.textContent = `Question ${currentIndex + 1} of ${questions.length}`;
  els.questionText.textContent = question.question;
  els.optionsList.innerHTML = "";

  question.options.forEach((option, index) => {
    const button = document.createElement("button");
    const letter = document.createElement("span");
    const copy = document.createElement("span");
    const isCorrect = index === question.answerIndex;
    const isSelected = index === selected;

    button.type = "button";
    button.className = "option-button";
    if (answered && isCorrect) button.classList.add("correct");
    if (answered && isSelected && !isCorrect) button.classList.add("wrong");
    if (answered && !isCorrect && !isSelected) button.classList.add("dimmed");
    letter.className = "option-letter";
    letter.textContent = letters[index];
    copy.className = "option-copy";
    copy.textContent = option;
    button.append(letter, copy);
    button.addEventListener("click", () => {
      progress.answers[question.id] = index;
      saveProgress();
      render();
    });
    els.optionsList.append(button);
  });

  els.feedbackBox.hidden = !answered;
  if (answered) {
    const correct = selected === question.answerIndex;
    els.feedbackTitle.textContent = correct ? "Correct" : `Not quite. Correct answer: ${letters[question.answerIndex]}`;
    els.feedbackText.textContent = question.explanation;
  }

  els.prevButton.disabled = currentIndex === 0;
  els.nextButton.disabled = currentIndex === questions.length - 1;
}

function render() {
  renderStats();
  renderGrid();
  renderQuestion();
}

els.prevButton.addEventListener("click", () => {
  currentIndex = Math.max(0, currentIndex - 1);
  render();
});

els.nextButton.addEventListener("click", () => {
  currentIndex = Math.min(questions.length - 1, currentIndex + 1);
  render();
});

els.resetButton.addEventListener("click", () => {
  if (!window.confirm("Reset all selected answers?")) return;
  progress = { answers: {} };
  currentIndex = 0;
  saveProgress();
  render();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") els.nextButton.click();
  if (event.key === "ArrowLeft") els.prevButton.click();
  const optionIndex = Number(event.key) - 1;
  if (optionIndex >= 0 && optionIndex < 4) {
    const question = currentQuestion();
    progress.answers[question.id] = optionIndex;
    saveProgress();
    render();
  }
});

async function init() {
  loadProgress();
  const response = await fetch("options-questions.json");
  questions = await response.json();
  render();
}

init().catch(() => {
  els.questionText.textContent = "Could not load the options quiz.";
});
