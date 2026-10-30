import "dotenv/config";
import { createApp } from "./app";
import { createLlm } from "./llm";
import { SessionStore } from "./sessions";

const llm = createLlm();
const app = createApp({ llm, sessions: new SessionStore() });

const port = Number(process.env.PORT ?? 8787);
app.listen(port, "127.0.0.1", () => {
  console.log(`API listening on http://localhost:${port}`);
  console.log(llm ? `Model agent enabled: ${llm.model}` : "No model credentials: offline agent only");
});
