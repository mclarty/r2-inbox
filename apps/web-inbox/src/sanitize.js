import { Parser } from "htmlparser2";

const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const DROP_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "applet",
  "frame",
  "frameset",
  "meta",
  "base",
  "link",
  "form",
  "noscript",
]);

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const TRANSPARENT_TAGS = new Set(["html", "head", "body"]);

export function escapeText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(value) {
  return escapeText(value).replace(/"/g, "&quot;");
}

export function htmlToText(value) {
  return String(value || "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<\/\s*p\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function makeSnippet(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= 180) return text;
  return text.slice(0, 179).trimEnd() + "…";
}

export function detectRemote(html) {
  if (!html) return false;
  return /(?:src|href|background|poster|url)\s*(?:=|\()\s*['"]?\s*https?:/i.test(html);
}

function cleanCss(css, cidMap, allowRemote, markRemote) {
  let text = String(css || "");
  text = text.replace(/expression\s*\(/gi, "blocked(");
  text = text.replace(/javascript\s*:/gi, "");
  text = text.replace(/-moz-binding\s*:/gi, "");
  text = text.replace(/@import\b[^;]*;?/gi, "");
  text = text.replace(/<\//g, "<\\/");
  return text.replace(/url\(\s*([^)]*?)\s*\)/gi, (match, rawValue) => {
    const raw = rawValue.trim().replace(/^['"]|['"]$/g, "");
    const lowered = raw.toLowerCase();
    if (lowered.startsWith("cid:")) {
      const mapped = cidTarget(raw, cidMap);
      return mapped ? `url('${mapped}')` : "url('')";
    }
    if (lowered.startsWith("data:image/")) return match;
    if (lowered.startsWith("http://") || lowered.startsWith("https://")) {
      markRemote();
      return allowRemote ? match : "url('')";
    }
    if (raw.startsWith("/part?")) return match;
    return "url('')";
  });
}

function cidTarget(value, cidMap) {
  const cid = value.slice(4).trim().replace(/^<|>$/g, "").toLowerCase();
  if (cidMap[cid]) return cidMap[cid];
  return cidMap[cid.split("@", 1)[0]] || null;
}

function resource(value, cidMap, allowRemote, markRemote) {
  const trimmed = value.trim();
  const lowered = trimmed.toLowerCase();
  if (lowered.startsWith("cid:")) return cidTarget(trimmed, cidMap);
  if (lowered.startsWith("data:image/")) return trimmed;
  if (lowered.startsWith("http://") || lowered.startsWith("https://")) {
    markRemote();
    return allowRemote ? trimmed : PIXEL;
  }
  if (trimmed.startsWith("/part?")) return trimmed;
  return null;
}

export function sanitizeHtml(html, cidMap = {}, allowRemote = true) {
  try {
    const out = [];
    let dropDepth = 0;
    let inStyle = false;
    const markRemote = () => {};

    const attributes = (tag, attrs) => {
      const source = Object.entries(attrs || {}).map(([key, value]) => [key.toLowerCase(), value]);
      if (tag === "a") {
        const kept = source.filter(([key]) => key !== "rel" && key !== "target");
        kept.push(["rel", "noopener noreferrer"], ["target", "_blank"]);
        source.length = 0;
        source.push(...kept);
      }
      let rendered = "";
      for (const [key, value] of source) {
        if (!key || key.startsWith("on") || key === "srcdoc" || key === "formaction") continue;
        if (value == null) {
          rendered += ` ${key}`;
          continue;
        }
        const cleaned = attributeValue(tag, key, String(value));
        if (cleaned == null) continue;
        rendered += ` ${key}="${escapeAttr(cleaned)}"`;
      }
      return rendered;
    };

    const attributeValue = (tag, key, value) => {
      if (key === "style") return cleanCss(value, cidMap, allowRemote, markRemote);
      if (key === "srcset") {
        const kept = [];
        for (const piece of value.split(",")) {
          const bits = piece.trim().split(/\s+/);
          if (!bits[0]) continue;
          const url = resource(bits[0], cidMap, allowRemote, markRemote);
          if (!url || url === PIXEL) continue;
          kept.push([url, ...bits.slice(1)].join(" "));
        }
        return kept.length ? kept.join(", ") : null;
      }
      const lowered = value.trim().toLowerCase();
      if (
        lowered.startsWith("javascript:") ||
        lowered.startsWith("vbscript:") ||
        lowered.startsWith("data:text/html")
      ) {
        return null;
      }
      if (key === "src" || key === "poster" || key === "background") {
        return resource(value, cidMap, allowRemote, markRemote);
      }
      if (key === "href") {
        if (lowered.startsWith("cid:")) return cidTarget(value.trim(), cidMap);
        if (
          lowered.startsWith("#") ||
          lowered.startsWith("mailto:") ||
          lowered.startsWith("http://") ||
          lowered.startsWith("https://") ||
          lowered.startsWith("/")
        ) {
          return value.trim();
        }
        return null;
      }
      return value;
    };

    const parser = new Parser(
      {
        onopentag(tag, attrs) {
          tag = tag.toLowerCase();
          const selfClosing = VOID_TAGS.has(tag);
          if (dropDepth) {
            if (!selfClosing) dropDepth += 1;
            return;
          }
          if (DROP_TAGS.has(tag)) {
            if (!selfClosing) dropDepth = 1;
            return;
          }
          if (TRANSPARENT_TAGS.has(tag)) return;
          if (tag === "style") inStyle = true;
          out.push(`<${tag}${attributes(tag, attrs)}>`);
        },
        onclosetag(tag) {
          tag = tag.toLowerCase();
          if (VOID_TAGS.has(tag)) return;
          if (dropDepth) {
            dropDepth -= 1;
            return;
          }
          if (DROP_TAGS.has(tag) || TRANSPARENT_TAGS.has(tag)) return;
          if (tag === "style") inStyle = false;
          out.push(`</${tag}>`);
        },
        ontext(data) {
          if (dropDepth) return;
          out.push(inStyle ? cleanCss(data, cidMap, allowRemote, markRemote) : escapeText(data));
        },
      },
      { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
    );
    parser.write(String(html || ""));
    parser.end();
    return out
      .join("")
      .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "")
      .replace(/<\s*script\b[^>]*>/gi, "");
  } catch {
    return `<pre>${escapeText(htmlToText(html))}</pre>`;
  }
}

export function renderBody(view, allowRemote, requestHost = "") {
  const html = view.html || "";
  const inner = sanitizeHtml(html, view.cidMap || {}, allowRemote);
  const imageHosts = ["'self'", "http://127.0.0.1:*", "http://localhost:*"];
  const host = String(requestHost || "").split(",")[0].trim();
  if (host && /^[A-Za-z0-9._:-]+$/.test(host)) {
    imageHosts.push(`http://${host}`, `https://${host}`);
  }
  if (allowRemote) imageHosts.push("https:", "http:");
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `img-src data: blob: ${imageHosts.join(" ")}`,
    "font-src data:",
    "media-src data: blob:",
    "form-action 'none'",
  ].join("; ");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<base target="_blank">
<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">
<style>
  html, body { margin: 0; background: #fff; color: #1c1c1e; }
  body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 16px 18px 32px; overflow-wrap: anywhere; }
  img, video { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  pre { white-space: pre-wrap; font: inherit; }
  a { color: #007aff; }
  blockquote { margin: 0.6em 0 0.6em 0.8em; padding-left: 0.8em; border-left: 3px solid #d0d0d5; color: #3a3a3c; }
</style>
</head>
<body>${inner}</body>
</html>`;
}
