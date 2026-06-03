const { init } = require("./db");
const { quizzes, pool } = require("./repo");
const seedData = require("./seed-data");

(async () => {
  await init();
  const existing = new Set((await quizzes.all()).map((q) => q.title));
  let added = 0;
  for (const quiz of seedData) {
    if (existing.has(quiz.title)) continue;
    await quizzes.create({ ...quiz, creatorId: null });
    added++;
  }
  console.log(added ? `Seeded ${added} built-in quiz(zes).` : "Built-in quizzes already present — nothing to do.");
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
