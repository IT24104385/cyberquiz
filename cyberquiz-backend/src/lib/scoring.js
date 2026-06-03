/**
 * Score a quiz attempt on the SERVER using the stored correct answers.
 * The client never sends (or sees) the correct option indices, so it
 * cannot influence the score beyond which options it selected.
 *
 * @param {Array} questions  parsed quiz.questions (each has .correct)
 * @param {Object|Array} answers  map qIndex->optionIndex (or array)
 * @param {number} timeLimit  quiz time limit in seconds
 * @param {number} clientTimeTaken  seconds reported by client (clamped)
 * @param {boolean} timedOut
 */
function scoreAttempt(questions, answers, timeLimit, clientTimeTaken, timedOut) {
  let correct = 0;
  questions.forEach((q, i) => {
    const picked = Array.isArray(answers) ? answers[i] : answers[i] ?? answers[String(i)];
    if (Number(picked) === Number(q.correct)) correct++;
  });
  const total = questions.length;
  const points = correct * 10;
  const percentage = total ? Math.round((correct / total) * 100) : 0;
  // Clamp the client-reported duration so it can't be negative or absurd.
  const timeTaken = Math.max(0, Math.min(Number(clientTimeTaken) || 0, timeLimit));
  return { correct, total, points, percentage, timeTaken, timedOut: !!timedOut };
}

module.exports = { scoreAttempt };
