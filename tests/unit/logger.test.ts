import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, log } from "../../src/main/logger";

describe("Logger subsystem", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("exports pre-configured scoped loggers", () => {
    expect(log.main).toBeDefined();
    expect(log.api).toBeDefined();
    expect(log.net).toBeDefined();
    expect(log.stream).toBeDefined();
    expect(log.security).toBeDefined();
    expect(log.ipc).toBeDefined();
    expect(log.ui).toBeDefined();
    expect(log.playback).toBeDefined();
    expect(log.download).toBeDefined();
    expect(log.updater).toBeDefined();
    expect(log.discord).toBeDefined();
    expect(log.window).toBeDefined();
  });

  it("logs formatted info, warn, and error messages", () => {
    const testLogger = createLogger("TEST");

    testLogger.info("Information test message");
    expect(logSpy).toHaveBeenCalled();
    const infoCall = logSpy.mock.calls[0].join(" ");
    expect(infoCall).toContain("[TEST");
    expect(infoCall).toContain("Information test message");

    testLogger.warn("Warning test message");
    expect(warnSpy).toHaveBeenCalled();
    const warnCall = warnSpy.mock.calls[0].join(" ");
    expect(warnCall).toContain("[TEST");
    expect(warnCall).toContain("Warning test message");

    testLogger.error("Error test message");
    expect(errorSpy).toHaveBeenCalled();
    const errorCall = errorSpy.mock.calls[0].join(" ");
    expect(errorCall).toContain("[TEST");
    expect(errorCall).toContain("Error test message");
  });

  it("sanitizes sensitive fields like tokens and passwords", () => {
    const testLogger = createLogger("SECURITY");

    testLogger.info("Payload test", {
      token: "secret_token_12345678",
      normal: "visible_value",
    });

    const call = logSpy.mock.calls[0].join(" ");
    expect(call).not.toContain("secret_token_12345678");
    expect(call).toContain("[REDACTED]");
    expect(call).toContain("visible_value");
  });
});
