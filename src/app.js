const express = require("express");

const pool = require("./db");
const v1Routes = require("./routes/v1");

function createApp() {
  const app = express();

  app.use(express.json());

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
