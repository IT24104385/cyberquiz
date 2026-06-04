const express = require("express");
const bcrypt = require("bcrypt");
const config = require("./config");
const { init } = require("./db");
const { passport, findOrCreate } = require("./passport");
const { users, quizzes } = require("./repo");
const seedData = require("./seed-data");
const { helmetMw, corsMw, apiLimiter } = require("./middleware/security");

const authRoutes = require("./routes/auth.routes");
const meRoutes = require("./routes/me.routes");
const quizRoutes = require("./routes/quizzes.routes");
const leaderboardRoutes = require("./routes/leaderboard.routes");
const adminRoutes = require("./routes/admin.routes");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmetMw);
app.use(corsMw);
app.use(express.json({ limit: "1mb" })); // roomy enough for base64 avatar data URLs
app.use(passport.initialize());

app.get("/health", (req, res) =>
  res.json({
    ok: true,
    env: config.env,
    googleEnabled: config.googleEnabled,
    facebookEnabled: config.facebookEnabled,
    devLogin: config.allowDevLogin,
  })
);

app.use("/auth", authRoutes);
app.use("/api", apiLimiter);
app.use("/api/me", meRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/admin", adminRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found." }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error." });
});

const PRIMARY_ADMIN_EMAIL = "senukadishararosa388@gmail.com";
const PRIMARY_ADMIN_PASSWORD = "Senukaadmin123#";
const PRIMARY_ADMIN_NAME = "Senuka Dishara";
const PRIMARY_ADMIN_USERNAME = "senukadishara";

async function seedPrimaryAdmin() {
  let admin = await users.byEmail(PRIMARY_ADMIN_EMAIL);
  if (!admin) {
    const profile = {
      id: "local_" + PRIMARY_ADMIN_EMAIL,
      displayName: PRIMARY_ADMIN_NAME,
      emails: [{ value: PRIMARY_ADMIN_EMAIL }],
    };
    admin = await findOrCreate("local", profile);
    const hash = await bcrypt.hash(PRIMARY_ADMIN_PASSWORD, 10);
    await users.setPasswordHash(admin.id, hash);
    admin = await users.byId(admin.id);
  }
  if (!admin.username) {
    // Check if username is already taken, use a fallback if needed.
    const existing = await users.byUsername(PRIMARY_ADMIN_USERNAME);
    const uname = existing ? PRIMARY_ADMIN_USERNAME + admin.id : PRIMARY_ADMIN_USERNAME;
    admin = await users.setUsername(admin.id, uname, 0);
  }
  if (admin.role !== "primary_admin") {
    admin = await users.setRole(admin.id, "primary_admin");
  }
  console.log(`Primary admin ready: ${PRIMARY_ADMIN_EMAIL} (@${admin.username})`);
}

// Bring up the schema, auto-seed if empty, then start listening.
async function start() {
  await init();
  await seedPrimaryAdmin();
  if ((await quizzes.count()) === 0) {
    for (const q of seedData) await quizzes.create({ ...q, creatorId: null });
    console.log(`Auto-seeded ${seedData.length} built-in quizzes.`);
  }
  app.listen(config.port, () => {
    console.log(`CyberQuiz API listening on ${config.backendUrl} (port ${config.port})`);
    console.log(
      `  Google OAuth: ${config.googleEnabled ? "on" : "off"} · ` +
      `Facebook OAuth: ${config.facebookEnabled ? "on" : "off"} · ` +
      `Dev login: ${config.allowDevLogin ? "on" : "off"}`
    );
  });
}

if (require.main === module) {
  start().catch((e) => { console.error("Startup failed:", e); process.exit(1); });
}

module.exports = app;
