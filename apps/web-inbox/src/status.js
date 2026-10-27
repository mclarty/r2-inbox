export const INBOX_PREFIX = "inbound/";

export const STATUS_KINDS = [
  { id: "dropped", label: "Dropped", prefix: "dropped/" },
  { id: "failed", label: "Failed", prefix: "failed/" },
];

function statusText(value) {
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean).join(" ");
  if (typeof value === "number") return String(value);
  return "";
}

export function statusExplanation(kind, payload) {
  if (typeof payload === "string") return statusText(payload);
  if (!payload || typeof payload !== "object") return "";
  if (kind === "failed") {
    const reason = statusText(payload.reason);
    const error = statusText(payload.error);
    if (reason && error && !error.toLowerCase().includes(reason.toLowerCase())) {
      return `${reason}: ${error}`;
    }
    return error || reason || statusText(payload.message);
  }
  for (const field of ["dropped", "reason", "error", "message", "detail"]) {
    const text = statusText(payload[field]);
    if (text) return text;
  }
  return "";
}

export function statusJsonKey(emlKey, prefix) {
  if (!emlKey.startsWith(INBOX_PREFIX) || !emlKey.toLowerCase().endsWith(".eml")) return null;
  const relative = emlKey.slice(INBOX_PREFIX.length, -4);
  if (!relative || relative.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  return prefix + relative + ".json";
}

export function emlKeyFromStatus(jsonKey, prefix) {
  if (jsonKey.includes("\\") || !jsonKey.startsWith(prefix) || !jsonKey.toLowerCase().endsWith(".json")) {
    return null;
  }
  const relative = jsonKey.slice(prefix.length, -5);
  if (!relative || relative.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  return INBOX_PREFIX + relative + ".eml";
}

export function cleanKey(key) {
  if (!key || key.includes("\u0000") || key.includes("\\")) {
    throw httpError(400, "That message key is not valid.");
  }
  if (key.split("/").includes("..")) throw httpError(400, "That message key is not valid.");
  if (!key.toLowerCase().endsWith(".eml") || !key.startsWith(INBOX_PREFIX)) {
    throw httpError(400, "That object is outside this mailbox.");
  }
  return key;
}

// Only a dated inbound message may be deleted, never a status record or any other object.
export const DELETE_KEY_PATTERN = /^inbound\/\d{4}\/\d{2}\/\d{2}\/[^/]+\.eml$/;

export function deletableKey(key) {
  if (typeof key !== "string" || !DELETE_KEY_PATTERN.test(key)) {
    throw httpError(400, "That message key cannot be deleted.");
  }
  return cleanKey(key);
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
