const express = require("express");
const { quizzes, scores } = require("../repo");
const { requireAuth } = require("../middleware/auth");
const { writeLimiter } = require("../middleware/security");
const { scoreAttempt } = require("../lib/scoring");

const router = express.Router();

// Strip correct-answer indices before sending a quiz to any client.
function toPublicQuiz(row, { withQuestions = true } = {}) {
  const questions = row.questions; // already a JS array (jsonb)
  const base = {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    timeLimit: row.time_limit,
    creator: row.creator_name,
    questionCount: questions.length,
    createdAt: row.created_at,
  };
  if (withQuestions) base.questions = questions.map((q) => ({ q: q.q, options: q.options }));
  return base;
}

/* list all quizzes (no questions, no answers) */
router.get("/", async (req, res, next) => {
  try {
    const all = await quizzes.all();
    res.json({ quizzes: all.map((q) => toPublicQuiz(q, { withQuestions: false })) });
  } catch (e) { next(e); }
});

/* one quiz with questions but WITHOUT correct answers */
router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid quiz id." });
    const row = await quizzes.byId(id);
    if (!row) return res.status(404).json({ error: "Quiz not found." });
    res.json({ quiz: toPublicQuiz(row) });
  } catch (e) { next(e); }
});

/* create a quiz (auth required) */
router.post("/", requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const { title, description = "", category = "General", timeLimit, questions } = req.body || {};
    if (!title || String(title).trim().length < 4)
      return res.status(400).json({ error: "Title must be at least 4 characters." });
    if (!Array.isArray(questions) || questions.length < 1)
      return res.status(400).json({ error: "Add at least one question." });
    if (questions.length > 50)
      return res.status(400).json({ error: "A quiz can have at most 50 questions." });

    const clean = [];
    for (let i = 0; i < questions.length; i++) {
      const qq = questions[i] || {};
      const text = String(qq.q || "").trim();
      const opts = (qq.options || []).map((o) => String(o).trim()).filter(Boolean);
      const correct = Number(qq.correct);
      if (!text) return res.status(400).json({ error: `Question ${i + 1} has no text.` });
      if (opts.length < 2) return res.status(400).json({ error: `Question ${i + 1} needs at least 2 options.` });
      if (!Number.isInteger(correct) || correct < 0 || correct >= opts.length)
        return res.status(400).json({ error: `Question ${i + 1} has no valid correct answer.` });
      clean.push({ q: text.slice(0, 500), options: opts.slice(0, 6).map((o) => o.slice(0, 200)), correct });
    }

    const tl = Math.max(30, Math.min(Number(timeLimit) || 300, 3600));
    const row = await quizzes.create({
      title: String(title).trim().slice(0, 100),
      description: String(description).trim().slice(0, 200),
      category: String(category).trim().slice(0, 30) || "General",
      timeLimit: tl,
      creatorId: req.user.id,
      creatorName: req.user.username,
      questions: clean,
    });
    res.status(201).json({ quiz: toPublicQuiz(row, { withQuestions: false }) });
  } catch (e) { next(e); }
});

/* submit an attempt — scored on the server from stored answers */
router.post("/:id/submit", requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await quizzes.byId(id);
    if (!row) return res.status(404).json({ error: "Quiz not found." });
    const { answers = {}, timeTaken = 0, timedOut = false } = req.body || {};
    const result = scoreAttempt(row.questions, answers, row.time_limit, timeTaken, timedOut);
    await scores.create({ userId: req.user.id, quizId: row.id, ...result });
    res.json({
      result: { quizId: row.id, quizTitle: row.title, creator: row.creator_name, ...result },
    });
  } catch (e) { next(e); }
});

module.exports = router;
