export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// JSON inside <script>: a mosque called "</script><script>..." must not end
// the block.
export function jsonInScript(value: unknown, indent = 2): string {
  return JSON.stringify(value, null, indent)
    .replace(/</g, "\\u003c");
}

export function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

const titleWords = (t: string) => t.replace(/(^|[\s(])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
export function titleHeadings(html: string): string {
  return html.replace(/<(h[1-3])([^>]*)>([\s\S]*?)<\/\1>/g, (_, tag: string, attrs: string, inner: string) =>
    `<${tag}${attrs}>${inner.split(/(<[^>]+>)/).map((part) => (part.startsWith("<") ? part : titleWords(part.replace(/\s*—\s*/g, " | ")))).join("")}</${tag}>`);
}

const REGION_RE = /<!-- build:([a-z-]+) -->[\s\S]*?<!-- \/build:\1 -->/g;

export function regionNames(template: string): readonly string[] {
  return [...template.matchAll(REGION_RE)].map((m) => m[1]);
}

export function fillRegions(template: string, fill: Readonly<Record<string, string>>): string {
  const names = new Set(regionNames(template));
  for (const name of Object.keys(fill)) if (!names.has(name)) throw new Error(`template has no region "${name}"`);
  for (const name of names) if (!(name in fill)) throw new Error(`no content for template region "${name}"`);
  return template.replace(REGION_RE, (_, name: string) => `<!-- build:${name} -->\n${fill[name]}\n<!-- /build:${name} -->`);
}

export function minifyCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{}:;,>])\s*/g, "$1").replace(/;}/g, "}").trim();
}
