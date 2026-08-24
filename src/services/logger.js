/**
 * CiviScan Logger & Diagnostic Service
 * Capture tous les événements, erreurs RPC et logs pour export et diagnostic.
 */

const MAX_LOGS = 200;
const STORAGE_KEY = "civiscan_debug_logs";

const sanitize = (text) => {
  if (typeof text !== "string") return text;
  return text
    .replace(/(X-Civi-Auth["':\s]+(?:Bearer\s+)?)["']?([a-zA-Z0-9_-]{8,})["']?/gi, '$1[CLEF_API_MASQUÉE]')
    .replace(/(Authorization["':\s]+(?:Bearer\s+)?)["']?([a-zA-Z0-9_.-]{10,})["']?/gi, '$1[TOKEN_MASQUÉ]')
    .replace(/(connectionToken["':\s]+)["']?([a-zA-Z0-9_.-]{10,})["']?/gi, '$1"[TOKEN_STRIPE_MASQUÉ]"')
    .replace(/(apiKey["':\s]+)["']?([a-zA-Z0-9_.-]{6,})["']?/gi, '$1"[CLEF_API_MASQUÉE]"')
    .replace(/(api_key["':\s]+)["']?([a-zA-Z0-9_.-]{6,})["']?/gi, '$1"[CLEF_API_MASQUÉE]"')
    .replace(/(secret["':\s]+)["']?([a-zA-Z0-9_.-]{10,})["']?/gi, '$1"[SECRET_MASQUÉ]"');
};

const sanitizeDetails = (details) => {
  if (!details) return null;
  try {
    const jsonStr = typeof details === "object" ? JSON.stringify(details) : String(details);
    return JSON.parse(sanitize(jsonStr));
  } catch {
    return sanitize(String(details));
  }
};

class Logger {
  constructor() {
    this.logs = this._loadLogs();
    this._interceptConsole();
  }

  _loadLogs() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  _saveLogs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs.slice(-MAX_LOGS)));
    } catch {
      // Ignoré si quota plein
    }
  }

  _interceptConsole() {
    if (typeof window === "undefined") return;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args) => {
      const rawText = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
      this.error("CONSOLE_ERROR", sanitize(rawText));
      originalError.apply(console, args);
    };

    console.warn = (...args) => {
      const rawText = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
      this.warn("CONSOLE_WARN", sanitize(rawText));
      originalWarn.apply(console, args);
    };
  }

  log(category, message, details = null) {
    const rawMsg = typeof message === "object" ? JSON.stringify(message) : String(message);
    const entry = {
      timestamp: new Date().toISOString(),
      level: "INFO",
      category,
      message: sanitize(rawMsg),
      details: sanitizeDetails(details),
    };
    this.logs.push(entry);
    if (this.logs.length > MAX_LOGS) {
      this.logs.shift();
    }
    this._saveLogs();
  }

  warn(category, message, details = null) {
    const rawMsg = typeof message === "object" ? JSON.stringify(message) : String(message);
    const entry = {
      timestamp: new Date().toISOString(),
      level: "WARN",
      category,
      message: sanitize(rawMsg),
      details: sanitizeDetails(details),
    };
    this.logs.push(entry);
    this._saveLogs();
  }

  error(category, message, details = null) {
    const rawMsg = typeof message === "object" ? JSON.stringify(message) : String(message);
    const entry = {
      timestamp: new Date().toISOString(),
      level: "ERROR",
      category,
      message: sanitize(rawMsg),
      details: sanitizeDetails(details),
    };
    this.logs.push(entry);
    this._saveLogs();
  }

  getLogs() {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }

  exportLogsText() {
    return this.logs
      .map(
        (l) =>
          `[${l.timestamp}] [${l.level}] [${l.category}] ${l.message}${
            l.details ? " | Details: " + JSON.stringify(l.details) : ""
          }`
      )
      .join("\n");
  }

  downloadLogsFile() {
    const text = this.exportLogsText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `civiscan-debug-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const logger = new Logger();
