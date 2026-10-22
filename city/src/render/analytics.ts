import snippet from "../../page/analytics.html";
import type { Audience } from "../types";

export const analyticsFor = (audience: Audience): string => (audience === "public" ? snippet.trim() : "");
