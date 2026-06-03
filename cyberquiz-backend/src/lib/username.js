// Reserved handles that may never be registered.
const RESERVED = new Set([
  "admin", "administrator", "root", "superuser", "superadmin", "user", "users",
  "guest", "test", "tester", "demo", "mod", "moderator", "staff", "system",
  "sysadmin", "support", "helpdesk", "help", "info", "contact", "owner",
  "official", "null", "undefined", "none", "anonymous", "anon", "default",
  "operator", "webmaster", "postmaster", "security", "cyberquiz", "api", "bot",
]);

// 3–20 chars, must start with a letter, then letters/digits/underscore.
const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;

/**
 * Validate a username's FORMAT and reserved status (no DB access).
 * Uniqueness is checked separately in the route via an async DB lookup.
 * Returns null if valid, otherwise an error message string.
 */
function validateUsername(raw) {
  const name = (raw || "").trim();
  if (!name) return "Username is required.";
  if (!USERNAME_RE.test(name))
    return "3–20 characters, must start with a letter, and use only letters, numbers and underscores.";
  const lower = name.toLowerCase();
  if (RESERVED.has(lower))
    return "That username is reserved and cannot be used.";
  return null;
}

module.exports = { validateUsername, RESERVED, USERNAME_RE };
