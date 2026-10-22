import { spawn } from "node:child_process";

const children = [
  spawn("node", ["scripts/client.mjs", "--watch"], { stdio: "inherit" }),
  spawn("npx", ["wrangler", "dev", ...process.argv.slice(2)], { stdio: "inherit" }),
];

const stop = () => children.forEach((c) => c.kill("SIGINT"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((c) => c.on("exit", (code) => { stop(); process.exit(code ?? 0); }));
