export const COMPOSE_STYLE = `
  .head-actions { display: flex; align-items: center; gap: 4px; }
  #compose-open {
    border: 0;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    padding: 6px 12px;
    font-weight: 650;
  }
  #compose-open:hover { filter: brightness(1.05); }
  .message-actions { display: flex; flex-wrap: wrap; gap: 6px; margin: -6px 0 12px; }
  .text-action {
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--chip);
    color: var(--accent);
    padding: 5px 10px;
    font-size: 12px;
  }
  .text-action:hover { border-color: var(--accent); }
  #compose {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 16px 22px 12px;
    gap: 8px;
  }
  .compose-bar { display: flex; align-items: center; gap: 10px; }
  #compose-title { flex: 1; margin: 0; font-size: 22px; letter-spacing: -0.02em; }
  #compose-discard, #compose-send, .tool, .link-dialog button {
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--chip);
    padding: 6px 12px;
  }
  #compose-discard { color: var(--muted); }
  #compose-send { margin-left: auto; background: var(--accent); color: #fff; border-color: transparent; font-weight: 650; }
  #compose-send:disabled, #compose-discard:disabled, .tool:disabled { opacity: 0.55; cursor: default; }
  .compose-from { margin: 0; color: var(--muted); font-size: 13px; }
  .compose-from strong { color: var(--text); font-weight: 650; }
  .compose-fields { display: flex; flex-direction: column; }
  .field { display: flex; gap: 8px; align-items: flex-start; padding: 4px 0; border-bottom: 1px solid var(--line); }
  .field-label { width: 64px; flex: none; color: var(--muted); padding-top: 8px; }
  .field-main { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .chips { display: contents; }
  .recipient-input {
    flex: 1;
    min-width: 12ch;
    border: 0;
    background: transparent;
    padding: 7px 0;
    outline: none;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    max-width: 100%;
    padding: 2px 2px 2px 8px;
    border-radius: 999px;
    background: var(--selected);
  }
  .chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip button {
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
  }
  .chip button:hover { color: var(--text); background: var(--hover); }
  #toggle-copies { margin-left: auto; border: 0; background: transparent; color: var(--accent); padding: 6px 0 6px 8px; }
  .field-error { flex: 1 0 100%; margin: 0; color: var(--banner-text); font-size: 12px; }
  #compose-subject {
    flex: 1;
    border: 0;
    background: transparent;
    padding: 8px 0;
    outline: none;
    font-size: 15px;
  }
  .toolbar { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 8px; }
  .tool { min-width: 34px; padding: 5px 8px; color: var(--text); }
  .tool[data-format="bold"] { font-weight: 750; }
  .tool[data-format="italic"] { font-style: italic; }
  .tool[aria-pressed="true"] { background: var(--selected); color: var(--accent); border-color: transparent; }
  .link-dialog { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .link-dialog input { flex: 1; min-width: 12ch; border: 1px solid var(--line); border-radius: 8px; background: var(--list-bg); padding: 6px 8px; }
  #editor {
    flex: 1;
    min-height: 160px;
    overflow: auto;
    margin-top: 4px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--list-bg);
    box-shadow: var(--shadow);
    outline: none;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    overflow-wrap: anywhere;
  }
  #editor blockquote { margin: 0.6em 0 0.6em 0.4em; padding-left: 0.8em; border-left: 3px solid var(--line); color: var(--muted); }
  #editor a { color: var(--accent); }
  #compose-notes { margin: 0; color: var(--muted); font-size: 12px; }
  #compose-status { margin: 0; min-height: 1.2em; font-size: 13px; }
  #compose-status.ok { color: var(--accent); }
  #compose-status.error { color: var(--banner-text); }
  #compose button:focus-visible, #compose input:focus-visible, #editor:focus-visible, .text-action:focus-visible, #compose-open:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent);
  }
  @media (max-width: 800px) {
    .app.composing .list-pane { display: none; }
    .app.composing .reader { display: block; }
    #compose { padding: 12px 14px 10px; }
    #compose-title { font-size: 20px; }
  }
`;

export const COMPOSE_HEAD = `<button id="compose-open" type="button">Compose</button>`;

export const COMPOSE_ACTIONS = `<div class="message-actions">
        <button id="reply" class="text-action" type="button">Reply</button>
        <button id="reply-all" class="text-action" type="button">Reply all</button>
        <button id="forward" class="text-action" type="button">Forward</button>
      </div>`;

export const COMPOSE_PANEL = `<div id="compose" class="compose" role="dialog" aria-modal="true" aria-labelledby="compose-title" hidden>
      <div class="compose-bar">
        <button id="compose-discard" type="button">Discard</button>
        <h2 id="compose-title">New message</h2>
        <button id="compose-send" type="button" title="Send (Ctrl+Enter)">Send</button>
      </div>
      <p class="compose-from" id="compose-from">From <strong id="compose-from-value"></strong></p>
      <div class="compose-fields">
        <div class="field">
          <label class="field-label" for="to-input" id="to-label">To</label>
          <div class="field-main">
            <div id="to-chips" class="chips" role="list" aria-labelledby="to-label"></div>
            <input id="to-input" class="recipient-input" type="text" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="to-error" placeholder="Add recipients">
            <button id="toggle-copies" type="button" aria-expanded="false" aria-controls="cc-row bcc-row">Cc/Bcc</button>
            <p id="to-error" class="field-error" hidden></p>
          </div>
        </div>
        <div class="field" id="cc-row" hidden>
          <label class="field-label" for="cc-input" id="cc-label">Cc</label>
          <div class="field-main">
            <div id="cc-chips" class="chips" role="list" aria-labelledby="cc-label"></div>
            <input id="cc-input" class="recipient-input" type="text" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="cc-error">
            <p id="cc-error" class="field-error" hidden></p>
          </div>
        </div>
        <div class="field" id="bcc-row" hidden>
          <label class="field-label" for="bcc-input" id="bcc-label">Bcc</label>
          <div class="field-main">
            <div id="bcc-chips" class="chips" role="list" aria-labelledby="bcc-label"></div>
            <input id="bcc-input" class="recipient-input" type="text" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="bcc-error">
            <p id="bcc-error" class="field-error" hidden></p>
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="compose-subject">Subject</label>
          <input id="compose-subject" type="text" maxlength="998" autocomplete="off">
        </div>
      </div>
      <div class="toolbar" role="toolbar" aria-label="Formatting">
        <button class="tool" type="button" data-format="bold" aria-label="Bold" title="Bold">B</button>
        <button class="tool" type="button" data-format="italic" aria-label="Italic" title="Italic"><em>I</em></button>
        <button class="tool" type="button" data-format="underline" aria-label="Underline" title="Underline"><span style="text-decoration:underline">U</span></button>
        <button class="tool" type="button" data-format="ul" aria-label="Bulleted list" title="Bulleted list">• List</button>
        <button class="tool" type="button" data-format="ol" aria-label="Numbered list" title="Numbered list">1. List</button>
        <button class="tool" type="button" data-format="link" aria-label="Link" title="Link">Link</button>
        <button class="tool" type="button" data-format="quote" aria-label="Quoted text" title="Quoted text">Quote</button>
        <button class="tool" type="button" id="undo" aria-label="Undo" title="Undo">Undo</button>
        <button class="tool" type="button" id="redo" aria-label="Redo" title="Redo">Redo</button>
      </div>
      <div id="link-dialog" class="link-dialog" hidden>
        <label for="link-url">Link address</label>
        <input id="link-url" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://example.com">
        <button id="link-apply" type="button">Apply</button>
        <button id="link-cancel" type="button">Cancel</button>
        <p id="link-error" class="field-error" hidden></p>
      </div>
      <div id="editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Message body" spellcheck="true"></div>
      <p id="compose-notes"></p>
      <p id="compose-status" role="status" aria-live="polite"></p>
    </div>`;

export const COMPOSE_SCRIPT = `
const composePanel = document.getElementById("compose");
const composeOpen = document.getElementById("compose-open");
if (composePanel && composeOpen) {
  const editor = document.getElementById("editor");
  const sendButton = document.getElementById("compose-send");
  const discardButton = document.getElementById("compose-discard");
  const subjectInput = document.getElementById("compose-subject");
  const statusEl = document.getElementById("compose-status");
  const notesEl = document.getElementById("compose-notes");
  const copiesButton = document.getElementById("toggle-copies");
  const linkDialog = document.getElementById("link-dialog");
  const linkInput = document.getElementById("link-url");
  const linkError = document.getElementById("link-error");
  const EMAIL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
  const fields = {
    to: { name: "To", people: [] },
    cc: { name: "Cc", people: [] },
    bcc: { name: "Bcc", people: [] },
  };
  const compose = {
    mode: "",
    key: "",
    inReplyTo: "",
    references: [],
    snapshot: "",
    sent: false,
    sending: false,
    ambiguous: false,
    history: [],
    historyAt: 0,
    savedRange: null,
    returnFocus: null,
  };

  function fieldNodes(name) {
    return {
      chips: document.getElementById(name + "-chips"),
      input: document.getElementById(name + "-input"),
      error: document.getElementById(name + "-error"),
    };
  }

  function setStatus(text, kind) {
    statusEl.textContent = text || "";
    statusEl.className = kind ? kind : "";
  }

  function showError(name, text) {
    const nodes = fieldNodes(name);
    nodes.error.hidden = !text;
    nodes.error.textContent = text || "";
    nodes.input.setAttribute("aria-invalid", text ? "true" : "false");
  }

  function parseOne(raw) {
    const value = String(raw || "").trim();
    if (!value) return null;
    if (/[\\u0000-\\u001F\\u007F]/.test(value)) return { error: "That address contains a line break." };
    let name = "";
    let email = value;
    const named = /^(?:"([^"]*)"|([^<]*?))\\s*<([^<>]+)>$/.exec(value);
    if (named) {
      name = String(named[1] || named[2] || "").replace(/[<>"]/g, "").trim();
      email = String(named[3] || "").trim();
    }
    if (!EMAIL_RE.test(email) || email.length > 254) return { error: email.slice(0, 80) + " is not a valid email address." };
    return { email: email, name: name.slice(0, 80) };
  }

  function known(email) {
    const key = email.toLowerCase();
    return ["to", "cc", "bcc"].some((name) => fields[name].people.some((person) => person.email.toLowerCase() === key));
  }

  function renderChips(name) {
    const nodes = fieldNodes(name);
    nodes.chips.replaceChildren();
    for (const person of fields[name].people) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.setAttribute("role", "listitem");
      const label = document.createElement("span");
      label.textContent = person.name ? person.name + " <" + person.email + ">" : person.email;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "\\u00d7";
      remove.setAttribute("aria-label", "Remove " + person.email + " from " + fields[name].name);
      remove.addEventListener("click", () => {
        fields[name].people = fields[name].people.filter((item) => item !== person);
        renderChips(name);
        nodes.input.focus();
      });
      chip.append(label, remove);
      nodes.chips.appendChild(chip);
    }
  }

  function addPerson(name, person) {
    if (known(person.email)) {
      showError(name, person.email + " is already in this message.");
      return false;
    }
    fields[name].people.push(person);
    renderChips(name);
    showError(name, "");
    return true;
  }

  function commitField(name) {
    const nodes = fieldNodes(name);
    const raw = nodes.input.value;
    if (!raw.trim()) return true;
    const parts = raw.split(/[,;\\n]+/);
    let ok = true;
    for (const part of parts) {
      const parsed = parseOne(part);
      if (!parsed) continue;
      if (parsed.error) {
        showError(name, parsed.error);
        ok = false;
        break;
      }
      if (!addPerson(name, parsed)) {
        ok = false;
        break;
      }
    }
    if (ok) nodes.input.value = "";
    return ok;
  }

  function snapshotNow() {
    return JSON.stringify({
      to: fields.to.people,
      cc: fields.cc.people,
      bcc: fields.bcc.people,
      subject: subjectInput.value,
      html: editor.innerHTML,
    });
  }

  function composeDirty() {
    if (!appEl.classList.contains("composing") || compose.sent) return false;
    return snapshotNow() !== compose.snapshot;
  }

  function setCopies(open) {
    document.getElementById("cc-row").hidden = !open;
    document.getElementById("bcc-row").hidden = !open;
    copiesButton.setAttribute("aria-expanded", open ? "true" : "false");
    copiesButton.textContent = open ? "Hide Cc/Bcc" : "Cc/Bcc";
  }

  function resetHistory(html) {
    compose.history = [html];
    compose.historyAt = 0;
  }

  function rememberHistory() {
    const html = editor.innerHTML;
    if (compose.history[compose.historyAt] === html) return;
    compose.history = compose.history.slice(0, compose.historyAt + 1);
    compose.history.push(html);
    if (compose.history.length > 100) compose.history.shift();
    compose.historyAt = compose.history.length - 1;
  }

  function undo() {
    if (compose.historyAt <= 0) return;
    compose.historyAt -= 1;
    editor.innerHTML = compose.history[compose.historyAt];
  }

  function redo() {
    if (compose.historyAt >= compose.history.length - 1) return;
    compose.historyAt += 1;
    editor.innerHTML = compose.history[compose.historyAt];
  }

  function saveSelection() {
    const selection = window.getSelection && window.getSelection();
    if (!selection || !selection.rangeCount || !editor.contains(selection.anchorNode)) return;
    compose.savedRange = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    const selection = window.getSelection && window.getSelection();
    if (!selection || !compose.savedRange) return;
    selection.removeAllRanges();
    selection.addRange(compose.savedRange);
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function paragraphs(text) {
    return String(text || "").replace(/\\r\\n/g, "\\n").split(/\\n{2,}/).filter((part) => part.length).map((part) => {
      return "<p>" + escapeHtml(part).replace(/\\n/g, "<br>") + "</p>";
    }).join("") || "<p><br></p>";
  }

  function sanitizePaste(html) {
    if (typeof DOMParser !== "function") return paragraphs(String(html || "").replace(/<[^>]+>/g, " "));
    const allowed = { P: 1, BR: 1, DIV: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, UL: 1, OL: 1, LI: 1, A: 1, BLOCKQUOTE: 1 };
    const parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
    function walk(node) {
      if (node.nodeType === 3) return document.createTextNode(node.textContent);
      const fragment = document.createDocumentFragment();
      if (node.nodeType !== 1) return fragment;
      const tag = node.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "IMG" || tag === "PICTURE" || tag === "SVG" || tag === "VIDEO" || tag === "IFRAME") return fragment;
      const children = [];
      for (const child of node.childNodes) children.push(walk(child));
      if (!allowed[tag]) {
        for (const child of children) fragment.appendChild(child);
        return fragment;
      }
      const el = document.createElement(tag.toLowerCase());
      if (tag === "A") {
        const href = String(node.getAttribute("href") || "").trim();
        if (!/^(https?:\\/\\/|mailto:)/i.test(href)) {
          for (const child of children) fragment.appendChild(child);
          return fragment;
        }
        el.setAttribute("href", href);
        el.setAttribute("rel", "noopener noreferrer");
      }
      for (const child of children) el.appendChild(child);
      return el;
    }
    const holder = document.createElement("div");
    for (const child of parsed.body.childNodes) holder.appendChild(walk(child));
    return holder.innerHTML || "<p><br></p>";
  }

  function insertHtml(html) {
    editor.focus();
    restoreSelection();
    let inserted = false;
    if (document.execCommand) {
      try { inserted = document.execCommand("insertHTML", false, html) !== false; } catch (err) { inserted = false; }
    }
    if (!inserted) editor.insertAdjacentHTML("beforeend", html);
    rememberHistory();
  }

  function format(command) {
    editor.focus();
    restoreSelection();
    if (!document.execCommand) return;
    try {
      if (command === "bold" || command === "italic" || command === "underline") document.execCommand(command, false, null);
      else if (command === "ul") document.execCommand("insertUnorderedList", false, null);
      else if (command === "ol") document.execCommand("insertOrderedList", false, null);
      else if (command === "quote") document.execCommand("formatBlock", false, "blockquote");
    } catch (err) { /* the button stays usable even if the browser refuses the command */ }
    rememberHistory();
  }

  function openLink() {
    saveSelection();
    linkDialog.hidden = false;
    linkError.hidden = true;
    linkInput.value = "";
    linkInput.focus();
  }

  function applyLink() {
    const href = linkInput.value.trim();
    if (!/^(https?:\\/\\/|mailto:)/i.test(href)) {
      linkError.hidden = false;
      linkError.textContent = "Use an http, https, or mailto address.";
      return;
    }
    linkDialog.hidden = true;
    editor.focus();
    restoreSelection();
    const link = document.createElement("a");
    link.href = href;
    link.rel = "noopener noreferrer";
    const selection = window.getSelection && window.getSelection();
    if (selection && selection.rangeCount && !selection.getRangeAt(0).collapsed) {
      link.appendChild(selection.getRangeAt(0).extractContents());
      selection.getRangeAt(0).insertNode(link);
    } else if (compose.savedRange) {
      link.textContent = href;
      compose.savedRange.insertNode(link);
    } else {
      link.textContent = href;
      editor.appendChild(link);
    }
    rememberHistory();
  }

  function clearCompose() {
    for (const name of ["to", "cc", "bcc"]) {
      fields[name].people = [];
      fieldNodes(name).input.value = "";
      showError(name, "");
      renderChips(name);
    }
    subjectInput.value = "";
    editor.innerHTML = "<p><br></p>";
    notesEl.textContent = "";
    setStatus("");
    setCopies(false);
    linkDialog.hidden = true;
    compose.mode = "";
    compose.key = "";
    compose.inReplyTo = "";
    compose.references = [];
    compose.sent = false;
    compose.sending = false;
    compose.ambiguous = false;
    sendButton.disabled = false;
    discardButton.disabled = false;
    resetHistory(editor.innerHTML);
    compose.snapshot = snapshotNow();
  }

  function closeCompose() {
    appEl.classList.remove("composing");
    composePanel.hidden = true;
    const back = compose.returnFocus;
    compose.returnFocus = null;
    if (state.current && state.selected) {
      document.getElementById("empty").hidden = true;
      document.getElementById("reading").hidden = false;
      if (window.matchMedia && window.matchMedia("(max-width: 800px)").matches) appEl.classList.add("reading-open");
    } else {
      document.getElementById("empty").hidden = false;
      document.getElementById("reading").hidden = true;
      appEl.classList.remove("reading-open");
    }
    if (back && back.focus) back.focus();
  }

  function requestClose() {
    if (compose.sending) return false;
    if (composeDirty() && window.confirm && !window.confirm("Discard this unsent message?")) return false;
    closeCompose();
    return true;
  }

  function fillPeople(name, people) {
    fields[name].people = [];
    for (const person of people || []) {
      const parsed = parseOne(person.name ? person.name + " <" + person.email + ">" : person.email);
      if (parsed && !parsed.error) fields[name].people.push(parsed);
    }
    renderChips(name);
  }

  function outcomeText(body) {
    if (body.duplicate) return "This send was already accepted.";
    if (body.outcome === "delivered") return "Sent.";
    if (body.outcome === "queued") return "Accepted by the mail service. Delivery is still queued, so this is not confirmed as delivered.";
    if (body.outcome === "rejected") {
      const bounced = (body.permanent_bounces || []).concat(body.suppressed || []);
      return bounced.length ? "Nobody was delivered. " + bounced.join(", ") : "The mail service accepted the request, but nobody was delivered.";
    }
    const parts = [];
    if ((body.delivered || []).length) parts.push("Delivered: " + body.delivered.join(", "));
    if ((body.queued || []).length) parts.push("Still queued: " + body.queued.join(", "));
    if ((body.permanent_bounces || []).length) parts.push("Bounced: " + body.permanent_bounces.join(", "));
    return parts.join(" ") || "Accepted with a mixed result. Delivery is not fully confirmed.";
  }

  async function openCompose(mode, key) {
    if (appEl.classList.contains("composing") && !requestClose()) return;
    compose.returnFocus = document.activeElement;
    clearCompose();
    compose.mode = mode || "";
    appEl.classList.add("composing");
    appEl.classList.remove("reading-open");
    document.getElementById("empty").hidden = true;
    document.getElementById("reading").hidden = true;
    composePanel.hidden = false;
    const titles = { reply: "Reply", "reply-all": "Reply all", forward: "Forward" };
    document.getElementById("compose-title").textContent = titles[mode] || "New message";
    setStatus(mode ? "Loading the draft…" : "");
    try {
      const info = await readJson(await fetch("/api/outbound"));
      const from = info.fromName && info.from ? info.fromName + " <" + info.from + ">" : (info.from || "Not configured");
      document.getElementById("compose-from-value").textContent = from;
      if (!info.configured) {
        const missing = (info.missing || []).join(", ");
        setStatus("Outbound mail is not configured (" + missing + "). Nothing will be sent until the worker has those settings. See the outbound mail docs.", "error");
      }
      if (key) {
        const draft = await readJson(await fetch("/api/compose?key=" + encodeURIComponent(key) + "&mode=" + encodeURIComponent(mode)));
        fillPeople("to", draft.to);
        fillPeople("cc", draft.cc);
        fillPeople("bcc", []);
        if ((draft.cc || []).length) setCopies(true);
        subjectInput.value = draft.subject || "";
        editor.innerHTML = draft.html || "<p><br></p>";
        compose.inReplyTo = draft.inReplyTo || "";
        compose.references = draft.references || [];
        notesEl.textContent = (draft.warnings || []).join(" ");
        if (!info || info.configured) setStatus("");
      }
    } catch (err) {
      setStatus(err.message || "Could not prepare this message.", "error");
    }
    resetHistory(editor.innerHTML);
    compose.snapshot = snapshotNow();
    if (mode === "forward" || !mode) fieldNodes("to").input.focus();
    else {
      editor.focus();
      const selection = window.getSelection && window.getSelection();
      if (selection && document.createRange && editor.firstChild) {
        const range = document.createRange();
        range.setStart(editor.firstChild, 0);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }

  async function sendCompose() {
    if (compose.sending || compose.ambiguous) return;
    if (!commitField("to") || !commitField("cc") || !commitField("bcc")) return;
    if (!compose.key) {
      const bytes = new Uint8Array(16);
      if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
      else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
      compose.key = "k" + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    compose.sending = true;
    sendButton.disabled = true;
    discardButton.disabled = true;
    sendButton.setAttribute("aria-busy", "true");
    setStatus("Sending…");
    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": compose.key },
        body: JSON.stringify({
          to: fields.to.people,
          cc: fields.cc.people,
          bcc: fields.bcc.people,
          subject: subjectInput.value,
          html: editor.innerHTML,
          inReplyTo: compose.inReplyTo,
          references: compose.references,
        }),
      });
      const body = await readJson(response);
      const failed = body.outcome === "rejected";
      compose.sent = !failed;
      if (failed) compose.key = "";
      setStatus(outcomeText(body), failed ? "error" : "ok");
      if (failed) sendButton.disabled = false;
    } catch (err) {
      const message = err.message || "Could not send.";
      compose.ambiguous = /not retried|may already have been accepted/i.test(message);
      if (!compose.ambiguous) compose.key = "";
      setStatus(message, "error");
      sendButton.disabled = compose.ambiguous;
    } finally {
      compose.sending = false;
      discardButton.disabled = false;
      sendButton.removeAttribute("aria-busy");
    }
  }

  for (const name of ["to", "cc", "bcc"]) {
    const input = fieldNodes(name).input;
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === "," || event.key === ";") {
        event.preventDefault();
        commitField(name);
      } else if (event.key === "Backspace" && !input.value && fields[name].people.length) {
        fields[name].people.pop();
        renderChips(name);
      }
    });
    input.addEventListener("blur", () => commitField(name));
    input.addEventListener("paste", (event) => {
      const text = event.clipboardData && event.clipboardData.getData("text/plain");
      if (!text || !/[,;\\n]/.test(text)) return;
      event.preventDefault();
      input.value = text;
      commitField(name);
    });
  }

  copiesButton.addEventListener("click", () => {
    const open = copiesButton.getAttribute("aria-expanded") !== "true";
    setCopies(open);
    if (open) fieldNodes("cc").input.focus();
  });
  composeOpen.addEventListener("click", () => openCompose("", ""));
  document.getElementById("reply").addEventListener("click", () => { if (state.current) openCompose("reply", state.current.key); });
  document.getElementById("reply-all").addEventListener("click", () => { if (state.current) openCompose("reply-all", state.current.key); });
  document.getElementById("forward").addEventListener("click", () => { if (state.current) openCompose("forward", state.current.key); });
  discardButton.addEventListener("click", requestClose);
  sendButton.addEventListener("click", sendCompose);
  document.getElementById("undo").addEventListener("click", undo);
  document.getElementById("redo").addEventListener("click", redo);
  document.getElementById("link-apply").addEventListener("click", applyLink);
  document.getElementById("link-cancel").addEventListener("click", () => { linkDialog.hidden = true; editor.focus(); });
  for (const button of document.querySelectorAll("#compose [data-format]")) {
    button.addEventListener("mousedown", (event) => { event.preventDefault(); saveSelection(); });
    button.addEventListener("click", () => {
      if (button.getAttribute("data-format") === "link") openLink();
      else format(button.getAttribute("data-format"));
    });
  }
  editor.addEventListener("input", () => rememberHistory());
  editor.addEventListener("paste", (event) => {
    const data = event.clipboardData;
    if (!data) return;
    event.preventDefault();
    const html = data.getData("text/html");
    const text = data.getData("text/plain");
    const safe = html ? sanitizePaste(html) : paragraphs(text);
    if (html && /<img\\b/i.test(html) && !/<img\\b/i.test(safe)) {
      setStatus("Images were left out. Outgoing mail keeps the text, not pictures or attachments.", "error");
    }
    insertHtml(safe);
  });
  composePanel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!linkDialog.hidden) { linkDialog.hidden = true; editor.focus(); return; }
      requestClose();
      return;
    }
    const shortcut = event.ctrlKey || event.metaKey;
    if (shortcut && event.key === "Enter") { event.preventDefault(); sendCompose(); }
    else if (shortcut && event.key.toLowerCase() === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
    else if (shortcut && (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey))) { event.preventDefault(); redo(); }
  });
  if (window.addEventListener) {
    window.addEventListener("beforeunload", (event) => {
      if (!composeDirty()) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }
  const openMessageDirect = openMessage;
  openMessage = async function(key) {
    if (appEl.classList.contains("composing")) {
      if (!requestClose()) return;
    }
    return openMessageDirect(key);
  };
}
`;
