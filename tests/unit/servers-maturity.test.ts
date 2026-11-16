import { describe, expect, it } from "vitest";
import { SERVERS, getServerDef, getDirectServers, getEmbedServers } from "../../src/shared/servers";

describe("Server registry — maturity gate", () => {
  it("every server entry has required fields", () => {
    for (const s of SERVERS) {
      expect(s.id, `${s.id} missing id`).toBeTruthy();
      expect(typeof s.kind === "string", `${s.id} missing kind`).toBe(true);
      expect(["direct", "embed", "animesalt"].includes(s.kind), `${s.id} invalid kind: ${s.kind}`).toBe(true);
    }
  });

  it("embed servers have buildEmbedUrl", () => {
    for (const s of getEmbedServers()) {
      expect(typeof s.buildEmbedUrl, `${s.id} embed server missing buildEmbedUrl`).toBe("function");
    }
  });

  it("direct servers do not have buildEmbedUrl (or it is undefined)", () => {
    for (const s of getDirectServers()) {
      if ("buildEmbedUrl" in s) {
        expect(s.buildEmbedUrl, `${s.id} direct server should not have buildEmbedUrl`).toBeUndefined();
      }
    }
  });

  it("no duplicate server ids", () => {
    const ids = SERVERS.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("getServerDef is case-insensitive and strips whitespace", () => {
    const first = SERVERS[0];
    const found = getServerDef("  " + first.id.toUpperCase() + "  ");
    expect(found).toBeDefined();
    expect(found?.id).toBe(first.id);
  });
});
