import type { Mosque, MosqueSection } from "../src/types";

const mosque = (name: string, address: string, iqamah: Mosque["iqamah"], jummah: string[]): Mosque => ({
  name, address, postcode: null, athan: {}, iqamah, jummah: jummah as Mosque["jummah"],
});

export const FOUR_MOSQUES: MosqueSection = {
  kind: "live",
  date: "2026-10-23",
  mosques: [
    mosque("Example Masjid A", "Whitechapel", { fajr: "06:20", dhuhr: "13:15", asr: "15:40", maghrib: "18:00", isha: "19:35" }, ["13:15", "14:00"]),
    mosque("Example Masjid B", "Regent's Park", { fajr: "06:15", dhuhr: "13:30", asr: "15:45", maghrib: "18:00", isha: "19:40" }, ["13:30"]),
    mosque("Example Masjid C", "Finsbury Park", { fajr: "06:25", dhuhr: "13:10", asr: "16:15", maghrib: "18:02", isha: "19:45" }, ["13:00", "13:45"]),
    mosque("Example Masjid D", "Peckham", { fajr: "06:30", dhuhr: "13:20", asr: "15:50", maghrib: "18:01", isha: "19:30" }, ["13:20"]),
  ],
};
