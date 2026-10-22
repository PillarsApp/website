// The homepage's Plausible and PostHog snippet, verbatim, so consent state and
// behavior match across the site (same origin, same localStorage keys). Only
// public pages carry it; the widget never does, because the consent banner
// must not appear inside someone else's page.

import snippet from "../../page/analytics.html";
import type { Audience } from "../types";

export const analyticsFor = (audience: Audience): string => (audience === "public" ? snippet.trim() : "");
