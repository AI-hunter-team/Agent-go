import "dotenv/config";
import { createApp } from "./app";
import { SessionStore } from "./sessions";

const app = createApp({ llm: null, sessions: new SessionStore() });

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
