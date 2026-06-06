const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const config = require("../config");

const corsMw = cors({
  origin: config.frontendUrl,
  credentials: true,
});

// Generous default; tighter limits for sensitive actions.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many auth attempts, Please try again later." },
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "You're doing that too fast — slow down a moment." },
});

module.exports = {
  helmetMw: helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }),
  corsMw,
  apiLimiter,
  authLimiter,
  writeLimiter,
};
