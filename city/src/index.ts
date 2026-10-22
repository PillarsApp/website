// Entry point. Thin shell: match a route, call its handler. Static files under
// /prayer-times/_/ are answered by Workers static assets before this code runs.
//
// Invariant: every request under /prayer-times/ is answered here. There is no
// fetch(request) passthrough and no passThroughOnException(): behind
// Orange-to-Orange either would hand the request to Webflow, which 301s the
// slash away and 404s.

import { routes, canonicalRedirect, type RouteName, type RouteParams } from "./routes";
import { staticRegistry, type CityRegistry } from "./registry";

export interface Deps {
  registry: CityRegistry;
  now: () => number;
}

const defaultDeps: Deps = {
  registry: staticRegistry(),
  now: Date.now,
};

interface Call<P> {
  readonly url: URL;
  readonly params: P;
  readonly request: Request;
  readonly env: Env;
  readonly ctx: ExecutionContext;
  readonly deps: Deps;
}
type Handler<P> = (call: Call<P>) => Promise<Response>;

// Typed over the route table: a route without a handler is a compile error,
// and so is a handler for a route that does not exist.
const handlers: { [K in RouteName]: Handler<RouteParams<K>> } = {
  hub: async () => new Response("not implemented", { status: 501 }),
  country: async () => new Response("not implemented", { status: 501 }),
  city: async () => new Response("not implemented", { status: 501 }),
  widget: async () => new Response("not implemented", { status: 501 }),
};

export async function handleFetch(request: Request, env: Env, ctx: ExecutionContext, deps: Deps = defaultDeps): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const redirect = canonicalRedirect(url.pathname);
  if (redirect) return Response.redirect(`${url.origin}${redirect}${url.search}`, 301);
  for (const name of Object.keys(routes) as RouteName[]) {
    const params = routes[name].match(url.pathname);
    if (params) return (handlers[name] as Handler<unknown>)({ url, params, request, env, ctx, deps });
  }
  return notFound();
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
}

export default { fetch: handleFetch } satisfies ExportedHandler<Env>;
