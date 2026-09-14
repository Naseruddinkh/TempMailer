require("dotenv").config();
const crypto = require("crypto");

const config = {
  port: Number(process.env.PORT || 3000),
  rapidApiKey: process.env.RAPIDAPI_KEY,
  rapidApiHost: process.env.RAPIDAPI_HOST || "privatix-temp-mail-v1.p.rapidapi.com",
  allowedOrigin: process.env.ALLOWED_ORIGIN || "http://localhost:3000",
  nodeEnv: process.env.NODE_ENV || "development",

  mailboxTtl: Number(process.env.MAILBOX_TTL || 2 * 60 * 60 * 1000),

  // In production SESSION_SECRET must be set; in dev, generate a random one
  sessionSecret: process.env.SESSION_SECRET ||
    (process.env.NODE_ENV === "production"
      ? undefined  // will trigger the check below
      : crypto.randomBytes(32).toString("hex"))

};

if (!config.sessionSecret) {
  if (config.nodeEnv === "production") {
    throw new Error("SESSION_SECRET is required in production.");
  }

  console.warn("WARNING: SESSION_SECRET is not configured.");
}

if (!config.rapidApiKey) {
  console.warn("WARNING: RAPIDAPI_KEY is not configured.");
}

module.exports = config;