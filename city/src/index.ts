// Every request under /prayer-times/ is answered here or by static assets.
// There is no fetch(request) passthrough and no passThroughOnException():
// behind Orange-to-Orange either would hand the request to Webflow, which
// 301s the slash away and 404s.

export async function handleFetch(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
}

export default { fetch: handleFetch } satisfies ExportedHandler<Env>;
