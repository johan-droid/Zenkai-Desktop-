import { describe, expect, it } from "vitest";
import { isPlaybackActive, setPlaybackState } from "../../src/main/playback";

describe("Playback State Tracking (Active Playback Guard)", () => {
  it("defaults to false", () => {
    setPlaybackState(false);
    expect(isPlaybackActive()).toBe(false);
  });

  it("updates correctly on play and pause transitions", () => {
    setPlaybackState(true);
    expect(isPlaybackActive()).toBe(true);

    setPlaybackState(false);
    expect(isPlaybackActive()).toBe(false);
  });
});

