export interface Cue {
  start: number;
  end: number;
  text: string;
}

/**
 * Parses timestamp string supporting both SRT comma decimal ("00:01:23,456")
 * and VTT dot decimal ("00:01:23.456") into total seconds.
 */
export function parseTimestamp(raw: string): number {
  if (!raw) return -1;
  const t = raw.replace(",", ".").trim();
  const parts = t.split(":").map(Number);
  if (parts.some((p) => isNaN(p))) return -1;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return -1;
}

/**
 * Unified subtitle parser: auto-detects ASS/SSA by checking for "Dialogue:",
 * or falls through to SRT / WebVTT.
 */
export function parseSubtitles(content: string): Cue[] {
  if (!content || typeof content !== "string") return [];
  if (content.includes("Dialogue:")) {
    return parseAss(content);
  }
  return parseSrtOrVtt(content);
}

/**
 * Parses ASS/SSA Dialogue lines, stripping override tags and normalizing newlines/spaces.
 */
export function parseAss(content: string): Cue[] {
  const cues: Cue[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith("Dialogue:")) continue;
    const fields = line.slice("Dialogue:".length).split(",");
    if (fields.length < 10) continue;
    const start = parseTimestamp(fields[1]);
    const end = parseTimestamp(fields[2]);
    if (start < 0 || end <= start) continue;
    const text = fields
      .slice(9)
      .join(",")
      .replace(/\{[^}]*\}/g, "") // strip ASS override tags like {\pos(400,300)}
      .replace(/\\N|\\n/gi, "\n")
      .replace(/\\h/gi, " ")
      .trim();
    if (text) cues.push({ start, end, text });
  }
  return cues;
}

/**
 * Parses SRT or WebVTT timestamp blocks containing "-->".
 */
export function parseSrtOrVtt(content: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of content.split(/\r?\n\r?\n/)) {
    const lines = block.trim().split(/\r?\n/);
    const sepIdx = lines.findIndex((l) => l.includes("-->"));
    if (sepIdx < 0) continue;
    const [a, b] = lines[sepIdx].split("-->").map((s) => s.trim().split(" ")[0]);
    const start = parseTimestamp(a);
    const end = parseTimestamp(b);
    if (start < 0 || end <= start) continue;
    const text = lines
      .slice(sepIdx + 1)
      .join("\n")
      .replace(/<[^>]+>/g, "") // strip HTML tags like <i>, <b>
      .trim();
    if (text) cues.push({ start, end, text });
  }
  return cues;
}

/**
 * Finds the currently active subtitle text matching the playback time + offset.
 */
export function findActiveCue(
  cues: Cue[],
  time: number,
  offsetSeconds = 0,
): string | null {
  const t = time + offsetSeconds;
  return cues.find((c) => t >= c.start && t <= c.end)?.text ?? null;
}

/**
 * Converts parsed cues into standard numbered SRT format.
 */
export function cuesToSrt(cues: Cue[]): string {
  function formatSrtTime(sec: number): string {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  }

  return cues
    .map(
      (cue, idx) =>
        `${idx + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}`,
    )
    .join("\n\n") + "\n";
}
