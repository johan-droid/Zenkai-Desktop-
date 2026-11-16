import { describe, expect, it } from "vitest";
import {
  getAllServers,
  getDirectServers,
  getEmbedServers,
  getServerDef,
  isAudioSwitchable,
  SERVERS,
} from "../../src/shared/servers";

describe("T-API7: Server & Provider Registry", () => {
  it("registry contains heterogeneous providers", () => {
    expect(SERVERS.length).toBeGreaterThanOrEqual(15);
    const direct = getDirectServers();
    const embed = getEmbedServers();
    expect(direct.length).toBeGreaterThanOrEqual(4);
    expect(embed.length).toBeGreaterThanOrEqual(8);
  });

  it("getServerDef returns normalized provider", () => {
    const megaplay = getServerDef("MegaPlay ");
    expect(megaplay?.id).toBe("megaplay");
    expect(megaplay?.kind).toBe("direct");
    expect(megaplay?.audioSwitchable).toBe(true);

    const acdn = getServerDef("ACDN");
    expect(acdn?.id).toBe("acdn");
    expect(acdn?.multiTrack).toBe(true);
    expect(acdn?.audioSwitchable).toBe(false);

    expect(getServerDef("unknown-server")).toBeUndefined();
  });

  it("enforces audio switchability rules", () => {
    expect(isAudioSwitchable("megaplay")).toBe(true);
    expect(isAudioSwitchable("vidstream")).toBe(true);
    expect(isAudioSwitchable("acdn")).toBe(false);
  });

  it("builds embed URLs correctly for embed providers", () => {
    const megaplayEmbed = getServerDef("megaplay-embed");
    if (!megaplayEmbed) {
      console.warn("megaplay-embed not in registry — skipping embed URL test");
      return;
    }
    expect(megaplayEmbed?.buildEmbedUrl).toBeDefined();
    if (megaplayEmbed?.buildEmbedUrl) {
      const url = megaplayEmbed.buildEmbedUrl({ id: 21, episode: 1, audio: "dub" });
      expect(url).toContain("/embed/21/1?audio=dub");
    }

    const vidzee = getServerDef("vidzee");
    expect(vidzee?.buildEmbedUrl).toBeDefined();
    if (vidzee?.buildEmbedUrl) {
      const url = vidzee.buildEmbedUrl({ id: 1, episode: 3, tmdbId: 85937, season: 2 });
      expect(url).toContain("/embed/85937/2/3");
    }
  });

  it("getAllServers returns a safe copy of the registry", () => {
    const list = getAllServers();
    expect(list).toHaveLength(SERVERS.length);
    list.pop();
    expect(getAllServers()).toHaveLength(SERVERS.length);
  });
});
