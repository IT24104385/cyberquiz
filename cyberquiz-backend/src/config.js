require("dotenv").config();

const config = {
  port: Number(process.env.PORT || 4000),
  env: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  backendUrl: process.env.BACKEND_URL || "http://localhost:4000",
  jwtSecret: process.env.JWT_SECRET || "dev-insecure-secret-change-me",
  sessionSecret: process.env.SESSION_SECRET || "dev-insecure-session",
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  facebook: {
    appId: process.env.FACEBOOK_APP_ID,
    appSecret: process.env.FACEBOOK_APP_SECRET,
  },
  allowDevLogin: String(process.env.ALLOW_DEV_LOGIN) === "true",
  // PostgreSQL connection string, e.g.
  //   postgresql://user:pass@host:5432/dbname
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/cyberquiz",
  // Most hosted Postgres (Neon, Supabase, Render) require SSL.
  dbSsl: String(process.env.DB_SSL || (process.env.NODE_ENV === "production")) === "true",
};

config.googleEnabled = !!(config.google.clientId && config.google.clientSecret);
config.facebookEnabled = !!(config.facebook.appId && config.facebook.appSecret);

module.exports = config;
