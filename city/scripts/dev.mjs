// `npm run dev`: the design loop in one command.
//   1. builds the client once (so src/generated/client.ts exists) and keeps
//      watching page/city.js,
//   2. runs `wrangler dev`, which reloads on edits to src/, page/template.html
//      and page/city.css (imported as text) and on the regenerated client module.
// Open http://localhost:8787/prayer-times/uk/london/
import { spawn } from "node:child_process";

const children = [
  spawn("node", ["scripts/client.mjs", "--watch"], { stdio: "inherit" }),
  spawn("npx", ["wrangler", "dev", ...process.argv.slice(2)], { stdio: "inherit" }),
];

const stop = () => children.forEach((c) => c.kill("SIGINT"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// Either child ending ends the session; the other would be orphaned.
children.forEach((c) => c.on("exit", (code) => { stop(); process.exit(code ?? 0); }));
