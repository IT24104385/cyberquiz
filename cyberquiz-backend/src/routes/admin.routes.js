const express = require("express");
const { users, quizzes, scores } = require("../repo");
const { publicUser } = require("../passport");
const { requireAdmin, requirePrimaryAdmin } = require("../middleware/auth");

const router = express.Router();

/* ─── Stats overview ─── */
router.get("/stats", requireAdmin, async (req, res, next) => {
  try {
    const allUsers = await users.all();
    const allQuizzes = await quizzes.all();
    const allScores = await scores.allForLeaderboard();

    const totalUsers = allUsers.length;
    const disabledUsers = allUsers.filter((u) => u.is_disabled).length;
    const adminCount = allUsers.filter((u) => u.role === "admin" || u.role === "primary_admin").length;
    const totalQuizzes = allQuizzes.length;
    const totalScores = allScores.length;

    res.json({ totalUsers, disabledUsers, adminCount, totalQuizzes, totalScores });
  } catch (e) { next(e); }
});

/* ─── List all users ─── */
router.get("/users", requireAdmin, async (req, res, next) => {
  try {
    const all = await users.all();
    res.json({ users: all.map(publicUser) });
  } catch (e) { next(e); }
});

/* ─── Disable a user ─── */
router.patch("/users/:id/disable", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = await users.byId(id);
    if (!target) return res.status(404).json({ error: "User not found." });
    if (target.role === "primary_admin")
      return res.status(403).json({ error: "Cannot disable the primary admin." });
    if (target.role === "admin" && req.user.role !== "primary_admin")
      return res.status(403).json({ error: "Only the primary admin can disable other admins." });
    const updated = await users.setDisabled(id, true);
    res.json({ user: publicUser(updated) });
  } catch (e) { next(e); }
});

/* ─── Enable a user ─── */
router.patch("/users/:id/enable", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = await users.byId(id);
    if (!target) return res.status(404).json({ error: "User not found." });
    const updated = await users.setDisabled(id, false);
    res.json({ user: publicUser(updated) });
  } catch (e) { next(e); }
});

/* ─── Delete a user ─── */
router.delete("/users/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = await users.byId(id);
    if (!target) return res.status(404).json({ error: "User not found." });
    if (target.role === "primary_admin")
      return res.status(403).json({ error: "Cannot delete the primary admin." });
    if (target.role === "admin" && req.user.role !== "primary_admin")
      return res.status(403).json({ error: "Only the primary admin can delete other admins." });
    await users.deleteById(id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ─── Add admin (any admin can promote a user) ─── */
router.post("/admins", requireAdmin, async (req, res, next) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required." });
    const target = await users.byId(Number(userId));
    if (!target) return res.status(404).json({ error: "User not found." });
    if (target.role === "primary_admin")
      return res.status(400).json({ error: "User is already the primary admin." });
    if (target.role === "admin")
      return res.status(400).json({ error: "User is already an admin." });
    const updated = await users.setRole(Number(userId), "admin");
    res.json({ user: publicUser(updated) });
  } catch (e) { next(e); }
});

/* ─── Remove admin (primary admin only) ─── */
router.delete("/admins/:id", requirePrimaryAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = await users.byId(id);
    if (!target) return res.status(404).json({ error: "User not found." });
    if (target.role === "primary_admin")
      return res.status(403).json({ error: "Cannot demote the primary admin." });
    if (target.role !== "admin")
      return res.status(400).json({ error: "User is not an admin." });
    const updated = await users.setRole(id, "user");
    res.json({ user: publicUser(updated) });
  } catch (e) { next(e); }
});

/* ─── List all quizzes (admin view) ─── */
router.get("/quizzes", requireAdmin, async (req, res, next) => {
  try {
    const all = await quizzes.all();
    res.json({
      quizzes: all.map((q) => ({
        id: q.id,
        title: q.title,
        category: q.category,
        description: q.description,
        creator: q.creator_name,
        creatorId: q.creator_id,
        questionCount: q.questions.length,
        timeLimit: q.time_limit,
        createdAt: q.created_at,
      })),
    });
  } catch (e) { next(e); }
});

/* ─── Delete a quiz ─── */
router.delete("/quizzes/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const quiz = await quizzes.byId(id);
    if (!quiz) return res.status(404).json({ error: "Quiz not found." });
    await quizzes.deleteById(id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
