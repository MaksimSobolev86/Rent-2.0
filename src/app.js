const express = require("express");

const pool = require("./db");
const v1Routes = require("./routes/v1");
const { UPLOADS_ROOT, ensureUploadsRoot } = require("./utils/uploadsPaths");

function createApp() {
  const app = express();

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-user-id, x-owner-id");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    return next();
  });

  app.use(express.json({ limit: "2mb" }));

  ensureUploadsRoot();
  app.use(
    "/uploads",
    express.static(UPLOADS_ROOT, {
      maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
      fallthrough: true,
    }),
  );

  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  app.get("/ping", (req, res) => {
    res.json({ ok: true });
  });

  app.get("/health", async (req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok", db: true });
    } catch (e) {
      res.status(500).json({
        status: "error",
        db: false,
        error: e.message,
      });
    }
  });

  app.use("/api/v1", v1Routes);

  return app;
}

module.exports = { createApp };
