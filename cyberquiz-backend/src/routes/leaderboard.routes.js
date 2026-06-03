const express = require("express");
const { scores, users } = require("../repo");

const router = express.Router();

/* Global leaderboard: for each user, sum the points of their BEST attempt per
   quiz, then rank by total points (tie-break on average %). */
router.get("/", async (req, res, next) => {
  try {
    const all = await scores.allForLeaderboard(); // {user_id, quiz_id, points, percentage}

    // best attempt per (user, quiz)
    const best = new Map(); // user_id -> Map(quiz_id -> {points, percentage})
    for (const r of all) {
      if (!best.has(r.user_id)) best.set(r.user_id, new Map());
      const byQuiz = best.get(r.user_id);
      const cur = byQuiz.get(r.quiz_id);
      if (!cur || r.points > cur.points) byQuiz.set(r.quiz_id, r);
    }

    const rows = [];
    for (const [userId, byQuiz] of best) {
      const u = await users.byId(userId);
      if (!u || !u.username) continue;
      const recs = [...byQuiz.values()];
      rows.push({
        username: u.username,
        displayName: u.display_name,
        avatarColor: u.avatar_color,
        avatarUrl: u.avatar_url,
        totalPoints: recs.reduce((a, r) => a + r.points, 0),
        quizzesDone: recs.length,
        avgPercentage: Math.round(recs.reduce((a, r) => a + r.percentage, 0) / recs.length),
      });
    }

    rows.sort((a, b) => b.totalPoints - a.totalPoints || b.avgPercentage - a.avgPercentage);
    res.json({ leaderboard: rows.map((r, i) => ({ rank: i + 1, ...r })) });
  } catch (e) { next(e); }
});

module.exports = router;
