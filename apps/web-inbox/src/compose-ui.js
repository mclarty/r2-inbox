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
  .folder-nav { display: flex; gap: 6px; padding: 0 14px 8px; }
  .folder-nav button { border: 0; background: transparent; color: var(--muted); border-radius: 999px; padding: 4px 10px; }
  .folder-nav button[aria-selected="true"] { background: var(--selected); color: var(--accent); font-weight: 650; }
  .file-row, .sent-row { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); background: transparent; text-align: left; }
  .sent-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; border-bottom: 1px solid var(--line); }
  .sent-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; padding: 10px 14px; border: 0; }
  .sent-row span:nth-child(2) { grid-column: 1 / -1; }
  .sent-open, #sent-dashboard { color: var(--accent); text-decoration: none; }
  .sent-open { padding: 8px 12px 8px 0; font-size: 12px; }
  #sent-dashboard { display: inline-flex; margin: 0 0 8px; font-size: 14px; }
  .file-row span, .sent-row span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-meta, .sent-meta { color: var(--muted); font-size: 12px; flex: none; }
  .file-add { display: inline-flex; margin-top: 8px; }
  .file-add input { display: none; }
  #sent-detail { height: 100%; min-height: 0; overflow: auto; padding: 16px 22px; }
  #sent-detail h2 { margin: 0 0 8px; font-size: 22px; }
  .meta-line { margin: 0 0 6px; overflow-wrap: anywhere; }
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

export const FOLDER_NAV = `<div class="folder-nav" role="tablist" aria-label="Mailbox">
      <button id="show-inbox" type="button" role="tab" aria-selected="true">Inbox</button>
      <button id="show-sent" type="button" role="tab" aria-selected="false">Sent</button>
    </div>`;

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
      <div id="attachment-bar">
        <div id="attachment-list"></div>
        <label class="text-action file-add">Add files<input id="file-input" type="file" multiple></label>
      </div>
      <p id="compose-notes"></p>
      <p id="compose-status" role="status" aria-live="polite"></p>
    </div>
    <div id="sent-detail" hidden>
      <button id="sent-back" type="button">Back</button>
      <h2 id="sent-subject"></h2>
      <a id="sent-dashboard" hidden>Open in Cloudflare</a>
      <p id="sent-note" class="compose-from"></p>
      <div id="sent-meta"></div>
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
    files: [],
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

  function rememberSubmission(uncertain) {
    try {
      if (!window.sessionStorage || !compose.key) return;
      window.sessionStorage.setItem("r2-inbox-outbound-submission", JSON.stringify({
        key: compose.key,
        uncertain: Boolean(uncertain),
        status: statusEl.textContent,
      }));
    } catch (err) { /* private mode or a test page without storage */ }
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
    compose.files = [];
    renderAttachments();
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
        compose.files = (draft.attachments || []).map((file) => ({
          kind: "original",
          sourceKey: key,
          index: file.index,
          filename: file.filename,
          size: file.size || 0,
          type: file.contentType || "application/octet-stream",
        }));
        renderAttachments();
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
          attachments: compose.files.map((file) => file.kind === "original"
            ? { sourceKey: file.sourceKey, index: file.index }
            : { filename: file.filename, type: file.type, content: file.content }),
        }),
      });
      const body = await readJson(response);
      const failed = body.outcome === "rejected";
      compose.sent = !failed;
      compose.ambiguous = false;
      if (failed) compose.key = "";
      setStatus(outcomeText(body), failed ? "error" : "ok");
      rememberSubmission(false);
      if (failed) sendButton.disabled = false;
    } catch (err) {
      const message = err.message || "Could not send.";
      compose.ambiguous = /not sent again|already in progress|did not finish|may already have been accepted/.test(message);
      if (!compose.ambiguous) compose.key = "";
      setStatus(message, "error");
      rememberSubmission(compose.ambiguous);
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
      setStatus("Images pasted into the text were left out. Use Add files to attach a file.", "error");
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
  function renderAttachments() {
    const list = document.getElementById("attachment-list");
    if (!list) return;
    list.replaceChildren();
    for (const file of compose.files) {
      const row = document.createElement("div");
      row.className = "file-row";
      const name = document.createElement("span");
      name.textContent = file.filename;
      const meta = document.createElement("span");
      meta.className = "file-meta";
      meta.textContent = (typeof humanSize === "function" ? humanSize(file.size) : String(file.size)) + (file.kind === "original" ? " · original" : "");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "text-action";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", "Remove " + file.filename);
      remove.addEventListener("click", () => {
        compose.files = compose.files.filter((item) => item !== file);
        renderAttachments();
      });
      row.append(name, meta, remove);
      list.appendChild(row);
    }
  }

  function addUpload(file, content) {
    const size = file.size || 0;
    const used = compose.files.reduce((sum, item) => sum + (item.size || 0), 0);
    if (used + size > 25 * 1024 * 1024) {
      setStatus("Those files would pass the 25 MiB Email Sending limit.", "error");
      return;
    }
    compose.files.push({
      kind: "upload",
      filename: file.name || "attachment",
      size,
      type: file.type || "application/octet-stream",
      content,
    });
    renderAttachments();
  }

  const fileInput = document.getElementById("file-input");
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const files = [...(fileInput.files || [])];
      fileInput.value = "";
      for (const file of files) {
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result || "");
          const content = text.includes(",") ? text.split(",")[1] : "";
          if (content) addUpload(file, content);
        };
        reader.readAsDataURL(file);
      }
    });
  }

  function setFolder(view) {
    state.view = view;
    const inboxTab = document.getElementById("show-inbox");
    const sentTab = document.getElementById("show-sent");
    if (inboxTab) inboxTab.setAttribute("aria-selected", view === "inbox" ? "true" : "false");
    if (sentTab) sentTab.setAttribute("aria-selected", view === "sent" ? "true" : "false");
    const search = document.getElementById("search");
    if (search) search.hidden = view === "sent";
    document.getElementById("heading").textContent = view === "sent" ? "Sent" : "Inbox";
    if (view === "inbox") {
      document.getElementById("sent-detail").hidden = true;
      load(true, true);
      return;
    }
    closeCompose();
    document.getElementById("reading").hidden = true;
    document.getElementById("empty").hidden = false;
    loadSent("");
  }

  function sentLabel(event) {
    if (event.pending) return event.label + " · not confirmed delivered";
    return event.label || event.status || "Unknown";
  }

  async function loadSent(before) {
    listEl.replaceChildren();
    const status = document.createElement("div");
    status.className = "status";
    status.textContent = "Loading sending activity…";
    listEl.appendChild(status);
    subtitleEl.textContent = "Email Sending activity";
    try {
      const response = await fetch("/api/sent" + (before ? "?before=" + encodeURIComponent(before) : ""));
      const data = await readJson(response);
      listEl.replaceChildren();
      const note = document.createElement("div");
      note.className = "status";
      note.textContent = data.note || "Metadata only.";
      listEl.appendChild(note);
      if (data.dashboard && !data.dashboard.enabled && data.dashboard.reason) {
        const off = document.createElement("div");
        off.className = "status";
        off.textContent = data.dashboard.reason;
        listEl.appendChild(off);
      }
      for (const event of data.events || []) {
        const item = document.createElement("div");
        item.className = "sent-item";
        const row = document.createElement("button");
        row.type = "button";
        row.className = "sent-row";
        const who = document.createElement("span");
        who.textContent = event.to || event.envelope_to || "Unknown recipient";
        const subject = document.createElement("span");
        subject.textContent = event.subject || "(no subject)";
        const meta = document.createElement("span");
        meta.className = "sent-meta";
        meta.textContent = sentLabel(event);
        row.append(who, subject, meta);
        row.addEventListener("click", () => showSent(event, data.note, data.dashboard));
        item.appendChild(row);
        const href = dashboardHref(event.dashboard_url);
        if (href) {
          const open = document.createElement("a");
          open.className = "sent-open";
          open.href = href;
          open.target = "_blank";
          open.rel = "noopener noreferrer";
          open.textContent = "Open";
          open.setAttribute("aria-label", "Open in Cloudflare");
          item.appendChild(open);
        }
        listEl.appendChild(item);
      }
      if (!(data.events || []).length) {
        const empty = document.createElement("div");
        empty.className = "status";
        empty.textContent = "No sending activity in this window.";
        listEl.appendChild(empty);
      }
      if (data.next_before) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "text-action";
        more.textContent = "Older activity";
        more.addEventListener("click", () => loadSent(data.next_before));
        listEl.appendChild(more);
      }
    } catch (err) {
      listEl.replaceChildren();
      const failed = document.createElement("div");
      failed.className = "status";
      failed.textContent = err.message || "Could not load sending activity.";
      listEl.appendChild(failed);
    }
  }

  function dashboardHref(value) {
    if (typeof value !== "string" || !value.startsWith("https://dash.cloudflare.com/")) return "";
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.hostname !== "dash.cloudflare.com" || url.username || url.password || url.port || url.search || url.hash) return "";
      const activityPath = new RegExp("^/[0-9a-f]{32}/email-service/sending/[0-9a-f]{32}/[0-9a-f]{32}/activity-log/[^/]+$", "i");
      if (!activityPath.test(url.pathname)) return "";
      return url.href;
    } catch (err) {
      return "";
    }
  }

  function showSent(event, note, dashboard) {
    document.getElementById("empty").hidden = true;
    document.getElementById("reading").hidden = true;
    composePanel.hidden = true;
    const panel = document.getElementById("sent-detail");
    panel.hidden = false;
    appEl.classList.add("reading-open");
    document.getElementById("sent-subject").textContent = event.subject || "(no subject)";
    const link = document.getElementById("sent-dashboard");
    const href = dashboardHref(event.dashboard_url);
    if (href && link) {
      link.hidden = false;
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open in Cloudflare";
    } else if (link) {
      link.hidden = true;
      link.removeAttribute("href");
    }
    const extra = href
      ? ""
      : (event.message_id ? "" : " This event has no Message-ID, so there is no dashboard link.");
    const disabled = !href && dashboard && !dashboard.enabled ? " " + (dashboard.reason || "") : "";
    document.getElementById("sent-note").textContent = (note || "") + extra + disabled;
    const meta = document.getElementById("sent-meta");
    meta.replaceChildren();
    const rows = [
      ["Status", sentLabel(event)],
      ["When", event.datetime],
      ["From", event.from],
      ["To", event.to],
      ["Envelope recipient", event.envelope_to],
      ["Message-ID", event.message_id],
      ["Error", [event.error_cause, event.error_detail].filter(Boolean).join(" · ")],
      ["SPF", event.spf],
      ["DKIM", event.dkim],
      ["DMARC", event.dmarc],
    ];
    for (const [label, value] of rows) {
      if (!value) continue;
      const line = document.createElement("p");
      line.className = "meta-line";
      const strong = document.createElement("strong");
      strong.textContent = label + " ";
      line.append(strong, document.createTextNode(value));
      meta.appendChild(line);
    }
  }

  const showInbox = document.getElementById("show-inbox");
  const showSentButton = document.getElementById("show-sent");
  if (showInbox) showInbox.addEventListener("click", () => setFolder("inbox"));
  if (showSentButton) showSentButton.addEventListener("click", () => setFolder("sent"));
  const sentBack = document.getElementById("sent-back");
  if (sentBack) sentBack.addEventListener("click", () => {
    document.getElementById("sent-detail").hidden = true;
    appEl.classList.remove("reading-open");
  });

  try {
    if (window.sessionStorage) {
      const saved = JSON.parse(window.sessionStorage.getItem("r2-inbox-outbound-submission") || "null");
      if (saved && saved.uncertain && saved.status) {
        const search = document.getElementById("search");
        const parent = search && search.parentNode;
        if (parent && parent.insertBefore) {
          const note = document.createElement("div");
          note.className = "banner";
          note.textContent = saved.status;
          parent.insertBefore(note, search);
        }
      }
    }
  } catch (err) { /* storage or a partial document */ }
  const openMessageDirect = openMessage;
  openMessage = async function(key) {
    if (appEl.classList.contains("composing")) {
      if (!requestClose()) return;
    }
    return openMessageDirect(key);
  };
}
`;
