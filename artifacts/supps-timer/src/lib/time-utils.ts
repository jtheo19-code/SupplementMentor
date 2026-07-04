export function timeTo12h(time24: string | null | undefined): string {
  if (!time24) return "";
  const [hours, minutes] = time24.split(":");
  if (!hours || !minutes) return "";
  let h = parseInt(hours, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  h = h ? h : 12; // 0 should be 12
  return `${h}:${minutes} ${ampm}`;
}

export function timeTo24h(time12: string | null | undefined): string {
  if (!time12) return "";
  const match = time12.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) return time12;
  let [_, hours, minutes, ampm] = match;
  let h = parseInt(hours, 10);
  if (ampm.toUpperCase() === "PM" && h < 12) h += 12;
  if (ampm.toUpperCase() === "AM" && h === 12) h = 0;
  return `${h.toString().padStart(2, "0")}:${minutes}`;
}
