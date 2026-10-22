const args = process.argv.slice(2);
const flag = args.indexOf("--origin");
const origin = flag === -1 ? "http://localhost:8787" : args.splice(flag, 2)[1];
const path = args[0];
if (!path) {
  console.error("usage: snapshot.mjs <country>/<city>[/widget] [--origin <url>]");
  process.exit(2);
}
const res = await fetch(`${origin}/prayer-times/${path.replace(/^\/|\/$/g, "")}/`);
if (!res.ok) {
  console.error(`${res.url}: ${res.status}`);
  process.exit(1);
}
process.stdout.write(await res.text());
