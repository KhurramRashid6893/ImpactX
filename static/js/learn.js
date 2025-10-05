// --- Learning Modules ---
// Kinetic Energy Calculation
const massSlider = document.getElementById("mass-slider");
const velocitySlider = document.getElementById("velocity-slider");
const massValue = document.getElementById("mass-value");
const velocityValue = document.getElementById("velocity-value");
const energyResult = document.getElementById("energy-result");

function updateKineticEnergy() {
  const m = parseFloat(massSlider.value); // kg
  const v = parseFloat(velocitySlider.value) * 1000; // km/s -> m/s
  const energy = 0.5 * m * v * v; // Joules
  const energyMJ = (energy / 1e6).toFixed(2);
  energyResult.textContent = `${energyMJ} MJ`;
  massValue.textContent = `${m} kg`;
  velocityValue.textContent = `${velocitySlider.value} km/s`;
}

massSlider.addEventListener("input", updateKineticEnergy);
velocitySlider.addEventListener("input", updateKineticEnergy);
updateKineticEnergy(); // initialize

// Orbital Mechanics Visualization
const orbitCanvas = document.getElementById("orbit-canvas");
const ctx = orbitCanvas.getContext("2d");
orbitCanvas.width = 400;
orbitCanvas.height = 400;
const eccentricitySlider = document.getElementById("eccentricity-slider");
const eccentricityValue = document.getElementById("eccentricity-value");

function drawOrbit(e) {
  ctx.clearRect(0, 0, orbitCanvas.width, orbitCanvas.height);
  ctx.beginPath();
  const a = 150; // semi-major axis
  const b = a * Math.sqrt(1 - e * e); // semi-minor axis
  const centerX = orbitCanvas.width / 2;
  const centerY = orbitCanvas.height / 2;
  ctx.ellipse(centerX, centerY, a, b, 0, 0, 2 * Math.PI);
  ctx.strokeStyle = "#00ffcc";
  ctx.lineWidth = 2;
  ctx.stroke();
}
eccentricitySlider.addEventListener("input", () => {
  const e = parseFloat(eccentricitySlider.value);
  eccentricityValue.textContent = e.toFixed(2);
  drawOrbit(e);
});
drawOrbit(0); // initial

// --- Quiz Section ---
const quizData = [
  {
    question: "What determines an asteroid’s impact energy?",
    options: ["Mass and Velocity", "Color and Shape", "Distance from Earth"],
    correct: "A"
  },
  {
    question: "What does eccentricity (e) describe?",
    options: ["Orbital Shape", "Asteroid Color", "Impact Speed"],
    correct: "A"
  },
  {
    question: "Which effect is caused by large impacts near oceans?",
    options: ["Tsunamis", "Volcanoes", "Auroras"],
    correct: "A"
  }
];

let currentQuestion = 0;
const questionText = document.getElementById("question-text");
const optionButtons = document.querySelectorAll(".quiz-option");
const feedbackMessage = document.getElementById("feedback-message");
const nextButton = document.getElementById("next-question-btn");

function loadQuestion(index) {
  const q = quizData[index];
  questionText.textContent = q.question;
  optionButtons[0].textContent = q.options[0];
  optionButtons[1].textContent = q.options[1];
  optionButtons[2].textContent = q.options[2];
  feedbackMessage.textContent = "";
  optionButtons.forEach(btn => btn.classList.remove("correct", "incorrect"));
}

optionButtons.forEach((btn, i) => {
  btn.addEventListener("click", () => {
    const q = quizData[currentQuestion];
    const selected = ["A", "B", "C"][i];
    if (selected === q.correct) {
      btn.classList.add("correct");
      feedbackMessage.textContent = "✅ Correct!";
    } else {
      btn.classList.add("incorrect");
      feedbackMessage.textContent = "❌ Incorrect!";
    }
  });
});

nextButton.addEventListener("click", () => {
  currentQuestion++;
  if (currentQuestion < quizData.length) {
    loadQuestion(currentQuestion);
  } else {
    questionText.textContent = "🎉 Quiz Completed!";
    optionButtons.forEach(btn => (btn.style.display = "none"));
    nextButton.style.display = "none";
  }
});

// Initialize quiz
loadQuestion(currentQuestion);
