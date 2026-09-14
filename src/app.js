const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const cookieSession = require("cookie-session");

const config = require("./config");
const emailRoutes = require("./routes/email.routes");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmet());

// The deployed frontend and API are same-origin, but CORS remains available
// for local development or a separately hosted frontend.
if (config.allowedOrigin) {
  app.use(
    cors({
      origin: config.allowedOrigin,
      credentials: true,
      exposedHeaders: ["Content-Disposition"]
    })
  );
}

app.use(
  cookieSession({
    name: "tempmailer.sid",
    keys: [config.sessionSecret],
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: "lax",
    maxAge: 2 * 60 * 60 * 1000
  })
);

app.use(express.json({ limit: "100kb" }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

const mailboxCreationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many mailboxes created. Please try again later.",
    code: "MAILBOX_CREATION_LIMIT"
  }
});

app.use("/api", apiLimiter);
app.post("/api/mailboxes", mailboxCreationLimiter);

app.get("/api/health", (req, res) => {
  const body = { status: "ok", service: "tempmailer" };
  if (config.nodeEnv !== "production") body.environment = config.nodeEnv;
  res.json(body);
});

app.use("/api", emailRoutes);

// Serve the postal-theme frontend from Vercel/Express.
// express.static automatically serves public/index.html at /.
app.use(express.static(path.join(__dirname, "../public")));

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  console.error({
    message: err.message,
    code: err.code,
    status: err.response?.status,
    url: err.config?.url
  });

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Invalid JSON",
      code: "INVALID_JSON"
    });
  }

  if (err.response) {
    const status = err.response.status;

    if (status === 404) {
      return res.status(404).json({
        error: "Requested resource was not found",
        code: "RESOURCE_NOT_FOUND"
      });
    }

    if (status === 429) {
      return res.status(503).json({
        error: "Temporary email service is busy. Please try again later.",
        code: "UPSTREAM_RATE_LIMIT"
      });
    }

    if (status >= 500) {
      return res.status(503).json({
        error: "Temporary email service is unavailable",
        code: "UPSTREAM_ERROR"
      });
    }

    return res.status(502).json({
      error: "Temporary email service request failed",
      code: "UPSTREAM_REQUEST_FAILED"
    });
  }

  if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
    return res.status(503).json({
      error: "Temporary email service timed out",
      code: "UPSTREAM_TIMEOUT"
    });
  }

  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  return res.status(500).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR"
  });
});

module.exports = app;
