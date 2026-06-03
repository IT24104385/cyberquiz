const express = require("express");
const { passport, publicUser, findOrCreate } = require("../passport");
const { sign } = require("../jwt");
const { users } = require("../repo");
const { validateUsername } = require("../lib/username");
const { requireOnboarding } = require("../middleware/auth");
const { authLimiter } = require("../middleware/security");
const config = require("../config");

const router = express.Router();

function redirectWithToken(req, res) {
  const user = req.user;
  if (!user.username) {
    const token = sign(user, "onboarding");
    return res.redirect(
      `${config.frontendUrl}/#onboarding?token=${token}&name=${encodeURIComponent(user.display_name)}`
    );
  }
  const token = sign(user, "active");
  return res.redirect(`${config.frontendUrl}/#auth?token=${token}`);
}

/* ─── Google ─── */
router.get("/google", authLimiter, (req, res, next) => {
  if (!config.googleEnabled)
    return res.status(503).json({ error: "Google login is not configured." });
  passport.authenticate("google", { session: false, scope: ["profile", "email"] })(req, res, next);
});
router.get(
  "/google/callback",
  (req, res, next) =>
    passport.authenticate("google", {
      session: false, failureRedirect: `${config.frontendUrl}/#auth-error`,
    })(req, res, next),
  redirectWithToken
);

/* ─── Facebook ─── */
router.get("/facebook", authLimiter, (req, res, next) => {
  if (!config.facebookEnabled)
    return res.status(503).json({ error: "Facebook login is not configured." });
  passport.authenticate("facebook", { session: false, scope: ["email"] })(req, res, next);
});
router.get(
  "/facebook/callback",
  (req, res, next) =>
    passport.authenticate("facebook", {
      session: false, failureRedirect: `${config.frontendUrl}/#auth-error`,
    })(req, res, next),
  redirectWithToken
);

/* ─── Complete signup (choose username) ─── */
router.post("/complete-signup", authLimiter, requireOnboarding, async (req, res, next) => {
  try {
    const { username, avatarColor = 0 } = req.body || {};
    const err = validateUsername(username);
    if (err) return res.status(400).json({ error: err });
    if (await users.byUsername(username))
      return res.status(409).json({ error: "That username is already taken." });
    const color = Number.isInteger(avatarColor) ? Math.max(0, Math.min(avatarColor, 5)) : 0;
    const updated = await users.setUsername(req.user.id, username.trim(), color);
    res.json({ token: sign(updated, "active"), user: publicUser(updated) });
  } catch (e) {
    // unique-constraint race between the check and the write
    if (/unique|duplicate/i.test(String(e.message)) || e.code === "23505")
      return res.status(409).json({ error: "That username was just taken. Try another." });
    next(e);
  }
});

/* ─── Dev login (no real OAuth needed) ─── */
if (config.allowDevLogin) {
  router.post("/dev-login", authLimiter, async (req, res, next) => {
    try {
      const { email = `dev_${Date.now()}@example.com`, name = "Dev User" } = req.body || {};
      const profile = { id: "dev_" + email, displayName: name, emails: [{ value: email }] };
      const user = await findOrCreate("dev", profile);
      const stage = user.username ? "active" : "onboarding";
      res.json({ token: sign(user, stage), stage, user: publicUser(user) });
    } catch (e) { next(e); }
  });
}

module.exports = router;
