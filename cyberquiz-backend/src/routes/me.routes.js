const express = require("express");
const { users, quizzes, scores } = require("../repo");
const { publicUser } = require("../passport");
const { requireAuth } = require("../middleware/auth");
const { writeLimiter } = require("../middleware/security");

const router = express.Router();

const DAY = 86400000;
const NAME_COOLDOWN = 21 * DAY; // 3 weeks, enforced on the server

/* current user */
router.get("/", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/* my created quizzes + my score history */
router.get("/activity", requireAuth, async (req, res, next) => {
  try {
    const created = (await quizzes.byCreator(req.user.id)).map((q) => ({
      id: q.id, title: q.title, category: q.category,
      questionCount: q.questions.length, createdAt: q.created_at,
    }));
    const myScores = await scores.byUser(req.user.id);
    res.json({ created, scores: myScores });
  } catch (e) { next(e); }
});

/* change display name — once every 3 weeks */
router.patch("/display-name", requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const name = String(req.body?.displayName || "").trim();
    if (name.length < 2 || name.length > 30)
      return res.status(400).json({ error: "Display name must be 2–30 characters." });
    const last = req.user.last_name_change;
    if (last && Date.now() - last < NAME_COOLDOWN) {
      const days = Math.ceil((NAME_COOLDOWN - (Date.now() - last)) / DAY);
      return res.status(429).json({
        error: `You can change your display name again in ${days} day(s).`,
        nextChangeAt: last + NAME_COOLDOWN,
      });
    }
    res.json({ user: publicUser(await users.setDisplayName(req.user.id, name)) });
  } catch (e) { next(e); }
});

/* change avatar colour (0–5); clears any uploaded photo */
router.patch("/avatar-color", requireAuth, async (req, res, next) => {
  try {
    const c = Number(req.body?.color);
    if (!Number.isInteger(c) || c < 0 || c > 5)
      return res.status(400).json({ error: "Colour must be an integer 0–5." });
    res.json({ user: publicUser(await users.setAvatarColor(req.user.id, c)) });
  } catch (e) { next(e); }
});

/* set a profile picture as a small base64 data URL (stored in the DB, so it
   survives restarts without any file storage). The frontend downscales to
   ~256px JPEG before sending. */
const MAX_AVATAR_CHARS = 400 * 1024; // ~300 KB image
router.patch("/avatar", requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const dataUrl = String(req.body?.dataUrl || "");
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl))
      return res.status(400).json({ error: "Expected a JPEG, PNG or WebP image data URL." });
    if (dataUrl.length > MAX_AVATAR_CHARS)
      return res.status(413).json({ error: "Image is too large (max ~300 KB after resizing)." });
    res.json({ user: publicUser(await users.setAvatarUrl(req.user.id, dataUrl)) });
  } catch (e) { next(e); }
});

module.exports = router;
