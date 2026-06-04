const { pool } = require("./db");

const q = (text, params) => pool.query(text, params);

// pg returns BIGINT as a string to avoid precision loss; our timestamps are ms
// epoch values that fit safely in a JS number, so normalise them on the way out.
function normUser(r) {
  if (!r) return r;
  return {
    ...r,
    created_at: r.created_at == null ? null : Number(r.created_at),
    last_name_change: r.last_name_change == null ? null : Number(r.last_name_change),
  };
}
function normQuiz(r) {
  if (!r) return r;
  return {
    ...r,
    created_at: r.created_at == null ? null : Number(r.created_at),
    // jsonb comes back parsed; guard in case a driver returns text.
    questions: typeof r.questions === "string" ? JSON.parse(r.questions) : r.questions,
  };
}
function normScore(r) {
  if (!r) return r;
  return { ...r, created_at: r.created_at == null ? null : Number(r.created_at) };
}

/* ───────────────────────────── users ───────────────────────────── */
const users = {
  async byId(id) {
    const { rows } = await q("SELECT * FROM users WHERE id = $1", [id]);
    return normUser(rows[0]);
  },
  async byProvider(provider, providerId) {
    const { rows } = await q(
      "SELECT * FROM users WHERE provider = $1 AND provider_id = $2",
      [provider, providerId]
    );
    return normUser(rows[0]);
  },
  async byUsername(name) {
    const { rows } = await q("SELECT * FROM users WHERE username_lower = $1", [
      String(name).toLowerCase(),
    ]);
    return normUser(rows[0]);
  },
  async create({ provider, providerId, email, displayName, avatarColor = 0 }) {
    const { rows } = await q(
      `INSERT INTO users (provider, provider_id, email, display_name, avatar_color, created_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [provider, providerId, email || null, displayName, avatarColor, Date.now()]
    );
    return normUser(rows[0]);
  },
  async setUsername(id, username, avatarColor) {
    const { rows } = await q(
      "UPDATE users SET username = $1, username_lower = $2, avatar_color = $3 WHERE id = $4 RETURNING *",
      [username, username.toLowerCase(), avatarColor, id]
    );
    return normUser(rows[0]);
  },
  async setDisplayName(id, name) {
    const { rows } = await q(
      "UPDATE users SET display_name = $1, last_name_change = $2 WHERE id = $3 RETURNING *",
      [name, Date.now(), id]
    );
    return normUser(rows[0]);
  },
  async setAvatarColor(id, color) {
    const { rows } = await q(
      "UPDATE users SET avatar_color = $1, avatar_url = NULL WHERE id = $2 RETURNING *",
      [color, id]
    );
    return normUser(rows[0]);
  },
  async setAvatarUrl(id, url) {
    const { rows } = await q(
      "UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING *",
      [url, id]
    );
    return normUser(rows[0]);
  },
  async byEmail(email) {
    const { rows } = await q(
      "SELECT * FROM users WHERE email = $1 AND provider = 'local' LIMIT 1",
      [email]
    );
    return normUser(rows[0]);
  },
  async setPasswordHash(id, hash) {
    await q("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, id]);
  },
  async setRole(id, role) {
    const { rows } = await q(
      "UPDATE users SET role = $1 WHERE id = $2 RETURNING *",
      [role, id]
    );
    return normUser(rows[0]);
  },
  async setDisabled(id, val) {
    const { rows } = await q(
      "UPDATE users SET is_disabled = $1 WHERE id = $2 RETURNING *",
      [!!val, id]
    );
    return normUser(rows[0]);
  },
  async deleteById(id) {
    await q("DELETE FROM users WHERE id = $1", [id]);
  },
  async all() {
    const { rows } = await q(
      "SELECT * FROM users ORDER BY created_at DESC"
    );
    return rows.map(normUser);
  },
  async count() {
    const { rows } = await q("SELECT COUNT(*) AS n FROM users");
    return Number(rows[0].n);
  },
};

/* ──────────────────────────── quizzes ───────────────────────────── */
const quizzes = {
  async all() {
    const { rows } = await q("SELECT * FROM quizzes ORDER BY created_at DESC");
    return rows.map(normQuiz);
  },
  async byId(id) {
    const { rows } = await q("SELECT * FROM quizzes WHERE id = $1", [id]);
    return normQuiz(rows[0]);
  },
  async byCreator(id) {
    const { rows } = await q(
      "SELECT * FROM quizzes WHERE creator_id = $1 ORDER BY created_at DESC",
      [id]
    );
    return rows.map(normQuiz);
  },
  async count() {
    const { rows } = await q("SELECT COUNT(*) AS n FROM quizzes");
    return Number(rows[0].n);
  },
  async create(quiz) {
    const { rows } = await q(
      `INSERT INTO quizzes (title, description, category, time_limit, creator_id, creator_name, questions, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        quiz.title, quiz.description, quiz.category, quiz.timeLimit,
        quiz.creatorId ?? null, quiz.creatorName, JSON.stringify(quiz.questions), Date.now(),
      ]
    );
    return normQuiz(rows[0]);
  },
  async deleteById(id) {
    await q("DELETE FROM quizzes WHERE id = $1", [id]);
  },
};

/* ───────────────────────────── scores ───────────────────────────── */
const scores = {
  async create(rec) {
    const { rows } = await q(
      `INSERT INTO scores (user_id, quiz_id, correct, total, points, percentage, time_taken, timed_out, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        rec.userId, rec.quizId, rec.correct, rec.total, rec.points,
        rec.percentage, rec.timeTaken, !!rec.timedOut, Date.now(),
      ]
    );
    return rows[0].id;
  },
  async byUser(id) {
    const { rows } = await q(
      "SELECT * FROM scores WHERE user_id = $1 ORDER BY created_at DESC",
      [id]
    );
    return rows.map(normScore);
  },
  // every attempt's (user, quiz, points, percentage) — aggregated in JS.
  async allForLeaderboard() {
    const { rows } = await q("SELECT user_id, quiz_id, points, percentage FROM scores");
    return rows;
  },
};

module.exports = { users, quizzes, scores, pool };
