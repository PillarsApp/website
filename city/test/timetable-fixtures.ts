import type { Timetable } from "../src/types";

// A slice of a London timetable: BST days before the 2026 clock change (25 Oct), GMT days after it,
// one day with an unpublished Shafi'i Asr, and 28 Feb 2027 for a 29 Feb lookup.
export const LONDON_SLICE: Timetable = {
  id: "london-unified",
  zone: "Europe/London",
  retrieved: "2026-10-22",
  days: {
    "2026-10-22": ["06:00", "07:34", "12:50", "15:21", "16:03", "17:56", "19:21"],
    "2026-10-23": ["06:02", "07:36", "12:50", null, "16:01", "17:54", "19:19"],
    "2026-10-24": ["06:04", "07:38", "12:50", "15:17", "15:59", "17:52", "19:17"],
    "2026-10-27": ["05:10", "06:43", "11:50", "14:12", "14:54", "16:46", "18:12"],
    "2026-11-01": ["05:18", "06:52", "11:50", "14:03", "14:45", "16:37", "18:03"],
    "2027-02-28": ["05:08", "06:49", "12:14", "15:03", "15:48", "17:31", "18:58"],
  },
};

export const BIRMINGHAM_SLICE: Timetable = {
  id: "birmingham-central",
  zone: "Europe/London",
  retrieved: "2026-10-22",
  days: {
    "2026-10-22": ["05:55", "07:41", "12:57", "15:25", "16:06", "18:01", "19:30"],
  },
};
