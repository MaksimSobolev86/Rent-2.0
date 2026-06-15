require("dotenv").config();

const { createApp } = require("./app");
const { ensureAppSchema } = require("./utils/ensureAppSchema");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

async function start() {
  await ensureAppSchema();
  const app = createApp();
  app.listen(PORT, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://0.0.0.0:${PORT} (LAN: http://<ваш-ip>:${PORT})`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
