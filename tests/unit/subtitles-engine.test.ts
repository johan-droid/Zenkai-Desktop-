import { describe, expect, it } from "vitest";
import {
  cuesToSrt,
  findActiveCue,
  parseAss,
  parseSrtOrVtt,
  parseSubtitles,
  parseTimestamp,
} from "../../src/shared/subtitles";

describe("T-API8: Unified Subtitle Engine", () => {
  it("parses timestamps with comma (SRT) and dot (VTT) decimals", () => {
    expect(parseTimestamp("01:23:45,678")).toBeCloseTo(5025.678, 3);
    expect(parseTimestamp("01:23:45.678")).toBeCloseTo(5025.678, 3);
    expect(parseTimestamp("02:30.500")).toBeCloseTo(150.5, 3);
    expect(parseTimestamp("")).toBe(-1);
    expect(parseTimestamp("invalid")).toBe(-1);
  });

  it("parses ASS/SSA subtitles, strips override tags, and normalizes breaks", () => {
    const assContent = `
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:01:10.50,0:01:14.20,Default,,0,0,0,,{\\pos(192,280)}Hello\\NWorld!\\hReady.
Dialogue: 0,0:01:15.00,0:01:18.00,Default,,0,0,0,,Another line with {\\b1}bold{\\b0} text.
`;
    const cues = parseAss(assContent);
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBeCloseTo(70.5, 2);
    expect(cues[0].end).toBeCloseTo(74.2, 2);
    expect(cues[0].text).toBe("Hello\nWorld! Ready.");

    expect(cues[1].start).toBeCloseTo(75.0, 2);
    expect(cues[1].end).toBeCloseTo(78.0, 2);
    expect(cues[1].text).toBe("Another line with bold text.");
  });

  it("parses SRT subtitles with HTML tags stripped", () => {
    const srtContent = `
1
00:00:10,000 --> 00:00:14,500
<i>Welcome</i> to <b>Zenkai Desktop</b>!

2
00:00:15,200 --> 00:00:18,900
Next scene dialogue.
`;
    const cues = parseSrtOrVtt(srtContent);
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBe(10);
    expect(cues[0].end).toBe(14.5);
    expect(cues[0].text).toBe("Welcome to Zenkai Desktop!");
    expect(cues[1].start).toBe(15.2);
    expect(cues[1].end).toBe(18.9);
  });

  it("auto-detects ASS vs SRT/VTT with parseSubtitles", () => {
    const ass = `Dialogue: 0,0:00:05.00,0:00:08.00,Default,,0,0,0,,ASS Subtitle`;
    const srt = `1\n00:00:05,000 --> 00:00:08,000\nSRT Subtitle`;

    expect(parseSubtitles(ass)[0].text).toBe("ASS Subtitle");
    expect(parseSubtitles(srt)[0].text).toBe("SRT Subtitle");
    expect(parseSubtitles("")).toEqual([]);
  });

  it("findActiveCue locates cue matching playback time with sync offset", () => {
    const cues = [
      { start: 10, end: 15, text: "Cue 1" },
      { start: 20, end: 25, text: "Cue 2" },
    ];

    expect(findActiveCue(cues, 12)).toBe("Cue 1");
    expect(findActiveCue(cues, 16)).toBeNull();

    // With +1s subtitle offset, at time 9 the adjusted time is 10
    expect(findActiveCue(cues, 9, 1)).toBe("Cue 1");
    // With -1s subtitle offset, at time 11 the adjusted time is 10
    expect(findActiveCue(cues, 11, -1)).toBe("Cue 1");
  });

  it("cuesToSrt outputs numbered, valid SRT blocks", () => {
    const cues = [
      { start: 70.5, end: 74.2, text: "Hello World!" },
      { start: 75.0, end: 78.0, text: "Line 2" },
    ];
    const srt = cuesToSrt(cues);
    expect(srt).toContain("1\n00:01:10,500 --> 00:01:14,200\nHello World!");
    expect(srt).toContain("2\n00:01:15,000 --> 00:01:18,000\nLine 2");
  });
});
