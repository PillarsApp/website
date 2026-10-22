// wrangler's Text rule (wrangler.jsonc "rules") imports .html and .css as strings.
declare module "*.html" { const text: string; export default text; }
declare module "*.css" { const text: string; export default text; }
