require("dotenv").config();

// FRONTEND_URL may be one origin or a comma-separated list. Trailing
// slashes are stripped so "…app/" and "…app" are treated the same.
const frontendOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);

const config = {
  port: Number(process.env.PORT || 4000),
  env: process.env.NODE_ENV || "development",
  frontendUrl: frontendOrigins[0],   // primary — used for OAuth redirects
  frontendOrigins,                   // all allowed CORS origins
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
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/cyberquiz",
  dbSsl: String(process.env.DB_SSL || (process.env.NODE_ENV === "production")) === "true",
};

config.googleEnabled = !!(config.google.clientId && config.google.clientSecret);
config.facebookEnabled = !!(config.facebook.appId && config.facebook.appSecret);

module.exports = config;