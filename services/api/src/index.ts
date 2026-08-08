import { buildServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const app = buildServer();

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    console.log(`[Ekusupo API] listening on port ${port}`);
  })
  .catch((error: unknown) => {
    console.error("[Ekusupo API] failed to start", error);
    process.exit(1);
  });
