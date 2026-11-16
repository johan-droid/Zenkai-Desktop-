import util from "node:util";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const useColor =
  process.env.NO_COLOR === undefined &&
  (Boolean(process.stdout?.isTTY) ||
    process.env.FORCE_COLOR === "1" ||
    process.env.NODE_ENV !== "production");

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
};

function colorize(color: string, text: string): string {
  return useColor ? `${color}${text}${ANSI.reset}` : text;
}

function getActiveLogLevel(): LogLevel {
  const env = (process.env.ZENKAI_LOG_LEVEL || process.env.LOG_LEVEL || "").toLowerCase();
  if (env in LEVEL_WEIGHT) return env as LogLevel;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function formatTimestamp(): string {
  const now = new Date();
  const time = now.toTimeString().split(" ")[0];
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return colorize(ANSI.gray, `[${time}.${ms}]`);
}

function sanitizeArg(val: unknown): unknown {
  if (!val || typeof val !== "object") return val;
  if (val instanceof Error) {
    return {
      message: val.message,
      name: val.name,
      stack: val.stack?.split("\n").slice(0, 4).join("\n"),
    };
  }
  if (Array.isArray(val)) {
    return val.length > 5 ? [...val.slice(0, 5), `... +${val.length - 5} items`] : val;
  }
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (/token|secret|password|key|authorization/i.test(k) && typeof v === "string") {
      copy[k] = v.length > 8 ? `${v.slice(0, 4)}...[REDACTED]` : "[REDACTED]";
    } else if (typeof v === "string" && v.length > 300) {
      copy[k] = `${v.slice(0, 300)}... (truncated ${v.length} bytes)`;
    } else {
      copy[k] = v;
    }
  }
  return copy;
}

export interface ScopedLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  success(...args: unknown[]): void;
}

export function createLogger(scope: string, color: string = ANSI.cyan): ScopedLogger {
  const formattedScope = colorize(`${ANSI.bold}${color}`, `[${scope.padEnd(8)}]`);

  function print(level: LogLevel, tag: string, args: unknown[]) {
    const minLevel = getActiveLogLevel();
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) return;

    const time = formatTimestamp();
    const cleanArgs = args.map((arg) => {
      const clean = sanitizeArg(arg);
      if (typeof clean === "object" && clean !== null && !(clean instanceof Error)) {
        return util.inspect(clean, { colors: useColor, depth: 3, compact: true, breakLength: 120 });
      }
      return clean;
    });

    if (level === "error") {
      console.error(time, formattedScope, tag, ...cleanArgs);
    } else if (level === "warn") {
      console.warn(time, formattedScope, tag, ...cleanArgs);
    } else {
      console.log(time, formattedScope, tag, ...cleanArgs);
    }
  }

  return {
    debug(...args: unknown[]) {
      print("debug", colorize(ANSI.gray, "DBG"), args);
    },
    info(...args: unknown[]) {
      print("info", colorize(ANSI.brightCyan, "INF"), args);
    },
    warn(...args: unknown[]) {
      print("warn", colorize(ANSI.brightYellow, "WRN"), args);
    },
    error(...args: unknown[]) {
      print("error", colorize(ANSI.brightRed, "ERR"), args);
    },
    success(...args: unknown[]) {
      print("info", colorize(ANSI.brightGreen, "OK "), args);
    },
  };
}

export const log = {
  main: createLogger("MAIN", ANSI.cyan),
  net: createLogger("NETWORK", ANSI.brightCyan),
  api: createLogger("API", ANSI.blue),
  stream: createLogger("STREAM", ANSI.magenta),
  security: createLogger("SECURITY", ANSI.yellow),
  ipc: createLogger("IPC", ANSI.green),
  ui: createLogger("RENDERER", ANSI.brightMagenta),
  playback: createLogger("PLAYBACK", ANSI.brightBlue),
  download: createLogger("DOWNLOAD", ANSI.magenta),
  updater: createLogger("UPDATER", ANSI.cyan),
  discord: createLogger("DISCORD", ANSI.blue),
  window: createLogger("WINDOW", ANSI.yellow),
  power: createLogger("POWER", ANSI.dim),
};
