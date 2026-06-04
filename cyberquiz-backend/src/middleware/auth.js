const { verify } = require("../jwt");
const { users } = require("../repo");

function readToken(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// Requires a fully onboarded user (has chosen a username).
async function requireAuth(req, res, next) {
  try {
    const payload = verify(readToken(req));
    if (!payload || payload.stage !== "active")
      return res.status(401).json({ error: "Not authenticated." });
    const user = await users.byId(payload.uid);
    if (!user || !user.username)
      return res.status(401).json({ error: "Account not found or incomplete." });
    if (user.is_disabled)
      return res.status(403).json({ error: "Account has been disabled." });
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

// Accepts an onboarding token (used only by complete-signup).
async function requireOnboarding(req, res, next) {
  try {
    const payload = verify(readToken(req));
    if (!payload || payload.stage !== "onboarding")
      return res.status(401).json({ error: "Invalid or expired onboarding token." });
    const user = await users.byId(payload.uid);
    if (!user) return res.status(401).json({ error: "Account not found." });
    if (user.username)
      return res.status(409).json({ error: "Account already has a username." });
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

// Requires admin or primary_admin role.
async function requireAdmin(req, res, next) {
  try {
    const payload = verify(readToken(req));
    if (!payload || payload.stage !== "active")
      return res.status(401).json({ error: "Not authenticated." });
    const user = await users.byId(payload.uid);
    if (!user || !user.username)
      return res.status(401).json({ error: "Account not found or incomplete." });
    if (user.is_disabled)
      return res.status(403).json({ error: "Account has been disabled." });
    if (user.role !== "admin" && user.role !== "primary_admin")
      return res.status(403).json({ error: "Admin access required." });
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

// Requires primary_admin role only.
async function requirePrimaryAdmin(req, res, next) {
  try {
    const payload = verify(readToken(req));
    if (!payload || payload.stage !== "active")
      return res.status(401).json({ error: "Not authenticated." });
    const user = await users.byId(payload.uid);
    if (!user || !user.username)
      return res.status(401).json({ error: "Account not found or incomplete." });
    if (user.is_disabled)
      return res.status(403).json({ error: "Account has been disabled." });
    if (user.role !== "primary_admin")
      return res.status(403).json({ error: "Primary admin access required." });
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { requireAuth, requireOnboarding, requireAdmin, requirePrimaryAdmin };
