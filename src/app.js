const express = require("express");

const v1Routes = require("./routes/v1");

function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/ping", (req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/v1", v1Routes);

  return app;
}

module.exports = { createApp };
