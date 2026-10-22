// Escaping and template regions. Shared by the page, the widget, the index
// stubs and the 404; nothing else builds HTML strings from untrusted text.

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// JSON inside <script>: a mosque called "</script><script>..." must not end
// the block. `<` becomes \u003c, and U+2028/2029 are escaped for old parsers.
export function jsonInScript(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// Visible text of an HTML fragment, for the FAQPage schema.
export function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

// Headings in Title Case (first letter of every word; existing capitals such
// as BST, GMT and prayer names are left as they are). Text only, never
// tags or attributes. build.mjs:507-511.
const titleWords = (t: string) => t.replace(/(^|[\s(])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
export function titleHeadings(html: string): string {
  return html.replace(/<(h[1-3])([^>]*)>([\s\S]*?)<\/\1>/g, (_, tag: string, attrs: string, inner: string) =>
    `<${tag}${attrs}>${inner.split(/(<[^>]+>)/).map((part) => (part.startsWith("<") ? part : titleWords(part.replace(/\s*—\s*/g, " | ")))).join("")}</${tag}>`);
}

// The template's <!-- build:NAME --> ... <!-- /build:NAME --> regions.
const REGION_RE = /<!-- build:([a-z-]+) -->[\s\S]*?<!-- \/build:\1 -->/g;

export function regionNames(template: string): readonly string[] {
  return [...template.matchAll(REGION_RE)].map((m) => m[1]);
}

// `fill` must provide every region in the template and nothing else; a
// mismatch throws, so a renamed region in a template fails the first test
// instead of shipping an empty section.
export function fillRegions(template: string, fill: Readonly<Record<string, string>>): string {
  const names = new Set(regionNames(template));
  for (const name of Object.keys(fill)) if (!names.has(name)) throw new Error(`template has no region "${name}"`);
  for (const name of names) if (!(name in fill)) throw new Error(`no content for template region "${name}"`);
  return template.replace(REGION_RE, (_, name: string) => `<!-- build:${name} -->\n${fill[name]}\n<!-- /build:${name} -->`);
}

// Removes CSS comments and collapses whitespace: build.mjs:542-543.
export function minifyCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{}:;,>])\s*/g, "$1").replace(/;}/g, "}").trim();
}
