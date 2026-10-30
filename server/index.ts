import "dotenv/config";
import express from "express";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
