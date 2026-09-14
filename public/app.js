const API_BASE = "/api";
const POLL_INTERVAL = 10_000;

const emailAddress = document.getElementById("emailAddress");
const messageList = document.getElementById("messageList");
const messageCount = document.getElementById("messageCount");
const drawer = document.getElementById("emailDrawer");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const drawerContent = document.getElementById("drawerContent");
const modal = document.getElementById("newMailboxModal");
const modalBackdrop = document.getElementById("modalBackdrop");
const toast = document.getElementById("toast");
const confirmNewBtn = document.getElementById("confirmNew");

let messages = [];
let activeMailbox = null;
let activeMessage = null;
let toastTimer;
let pollTimer;
let inboxRequestInFlight = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));
}

function formatTimestamp(timestamp) {
  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric)) return String(timestamp || "");

  const date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  if (Number.isNaN(date.getTime())) return String(timestamp);

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatFullDate(timestamp) {
  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric)) return String(timestamp || "");

  const date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  if (Number.isNaN(date.getTime())) return String(timestamp);

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function setMailboxUI(mailbox) {
  activeMailbox = mailbox || null;

  if (mailbox) {
    emailAddress.textContent = mailbox.email;
  } else {
    emailAddress.textContent = "No active mailbox";
  }
}

function renderMessages() {
  const count = messages.length;
  messageCount.textContent = `${count} message${count === 1 ? "" : "s"}`;

  if (!count) {
    messageList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <strong>Your inbox is empty</strong>
        <span>Waiting for incoming messages...</span>
      </div>`;
    return;
  }

  messageList.innerHTML = messages.map((message, index) => `
    <button class="message-row" type="button" data-message-id="${escapeHtml(message.id)}">
      <span class="unread-dot" aria-hidden="true"></span>
      <span class="avatar ${index % 2 ? "alt" : ""}" aria-hidden="true">${escapeHtml((message.from || "?").trim().charAt(0).toUpperCase())}</span>
      <span class="message-main">
        <span class="sender">${escapeHtml(message.from || "Unknown sender")}</span>
        <span class="subject">${escapeHtml(message.subject || "(No subject)")}</span>
        <span class="preview">${escapeHtml(message.preview || "")}</span>
      </span>
      <span class="message-meta">
        <span>${escapeHtml(formatTimestamp(message.timestamp))}</span>
        ${message.attachmentsCount ? `<span class="attachments">⌕ ${escapeHtml(message.attachmentsCount)}</span>` : ""}
      </span>
    </button>
  `).join("");
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  let data = null;
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else if (response.status !== 204) {
    data = await response.text();
  }

  if (!response.ok) {
    const error = new Error(
      typeof data === "object" && data?.error
        ? data.error
        : `Request failed (${response.status})`
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function loadSession({ loadInbox = true, showError = true } = {}) {
  try {
    const data = await apiFetch("/session");

    if (data.active && data.mailbox) {
      setMailboxUI(data.mailbox);
      if (loadInbox) await loadInboxMessages({ showError });
    } else {
      setMailboxUI(null);
      messages = [];
      renderMessages();
    }

    return data;
  } catch (error) {
    console.error("Session error:", error);
    if (showError) showToast("Could not connect to TempMailer backend");
    return null;
  }
}

async function loadInboxMessages({ showError = true } = {}) {
  if (!activeMailbox || inboxRequestInFlight) return;

  inboxRequestInFlight = true;

  try {
    const data = await apiFetch("/mailbox/messages");
    messages = Array.isArray(data) ? data : [];
    renderMessages();
  } catch (error) {
    console.error("Inbox error:", error);

    if (error.status === 404 || error.status === 401) {
      await loadSession({ loadInbox: false, showError: false });
    } else if (showError) {
      showToast("Could not load your inbox");
    }
  } finally {
    inboxRequestInFlight = false;
  }
}

async function refreshInbox() {
  if (!activeMailbox) {
    showToast("Create a mailbox first");
    return;
  }

  await loadInboxMessages();
  showToast("Inbox refreshed");
}

async function createMailbox() {
  confirmNewBtn.disabled = true;
  confirmNewBtn.textContent = "Creating...";

  try {
    const mailbox = await apiFetch("/mailboxes", {
      method: "POST"
    });

    setMailboxUI(mailbox);
    messages = [];
    renderMessages();
    closeModal();
    showToast("New mailbox created");

    await loadInboxMessages();
  } catch (error) {
    console.error("Mailbox creation error:", error);
    showToast(error.status === 429
      ? "Too many mailboxes created. Try again later."
      : "Could not create a mailbox");
  } finally {
    confirmNewBtn.disabled = false;
    confirmNewBtn.textContent = "Create New";
  }
}

async function openMessage(id) {
  if (!activeMailbox) return;

  drawerContent.innerHTML = `<div class="empty-state"><div class="empty-icon">✉</div><strong>Loading message...</strong></div>`;
  drawer.classList.add("open");
  drawerBackdrop.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  try {
    const message = await apiFetch(`/messages/${encodeURIComponent(id)}`);
    activeMessage = message;

    const text = message.text || "";
    const html = message.html || "";

    drawerContent.innerHTML = `
      <h2 class="drawer-subject" id="drawerSubject">${escapeHtml(message.subject || "(No subject)")}</h2>
      <dl class="meta-grid">
        <dt>From</dt><dd>${escapeHtml(message.from || "Unknown sender")}</dd>
        <dt>Date</dt><dd>${escapeHtml(formatFullDate(message.timestamp))}</dd>
      </dl>
      <div class="email-body">
        ${html ? `
          <iframe
            class="email-html-frame"
            title="Email content"
            sandbox=""
            srcdoc="${escapeHtml(html)}">
          </iframe>` : `<pre class="email-text">${escapeHtml(text)}</pre>`}
      </div>
      <div id="attachmentsContainer"></div>
    `;

    if (message.attachmentsCount) {
      await loadAttachments(message.id);
    }
  } catch (error) {
    console.error("Message error:", error);
    drawerContent.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠</div>
        <strong>Could not load this message</strong>
        <span>${escapeHtml(error.message)}</span>
      </div>`;
  }
}

async function loadAttachments(messageId) {
  const container = document.getElementById("attachmentsContainer");
  if (!container) return;

  try {
    const attachments = await apiFetch(`/messages/${encodeURIComponent(messageId)}/attachments`);

    if (!Array.isArray(attachments) || !attachments.length) return;

    container.innerHTML = `
      <h3 class="attach-title">Attachments (${attachments.length})</h3>
      <div class="attachment-grid">
        ${attachments.map((attachment) => `
          <div class="attachment">
            <div class="attachment-thumb">▧</div>
            <div>
              <div class="attachment-name">${escapeHtml(attachment.filename)}</div>
              <div class="attachment-size">${formatBytes(attachment.size)}</div>
            </div>
            <button class="download-btn" type="button" data-attachment-id="${escapeHtml(attachment.id)}" aria-label="Download ${escapeHtml(attachment.filename)}">↓</button>
          </div>
        `).join("")}
      </div>
    `;
  } catch (error) {
    console.error("Attachment error:", error);
    container.innerHTML = `<p class="section-subtitle">Attachments could not be loaded.</p>`;
  }
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadAttachment(messageId, attachmentId) {
  try {
    const response = await fetch(
      `${API_BASE}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { credentials: "include" }
    );

    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/i);
    const filename = match?.[1] || "attachment";

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast("Attachment downloaded");
  } catch (error) {
    console.error("Download error:", error);
    showToast("Could not download attachment");
  }
}

async function deleteActiveMessage() {
  if (!activeMessage) return;

  try {
    await apiFetch(`/messages/${encodeURIComponent(activeMessage.id)}`, {
      method: "DELETE"
    });

    const deletedId = activeMessage.id;
    activeMessage = null;
    messages = messages.filter((message) => message.id !== deletedId);
    renderMessages();
    closeMessage();
    showToast("Message deleted");
  } catch (error) {
    console.error("Delete error:", error);
    showToast("Could not delete message");
  }
}

function closeMessage() {
  activeMessage = null;
  drawer.classList.remove("open");
  drawerBackdrop.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function openModal() {
  modal.classList.add("open");
  modalBackdrop.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modal.classList.remove("open");
  modalBackdrop.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

async function copyEmail() {
  if (!activeMailbox) {
    showToast("Create a mailbox first");
    return;
  }

  try {
    await navigator.clipboard.writeText(activeMailbox.email);
    document.getElementById("copyText").textContent = "Copied!";
    showToast("Email address copied");
    setTimeout(() => {
      document.getElementById("copyText").textContent = "Copy";
    }, 1400);
  } catch {
    showToast("Copy failed — select the address manually");
  }
}

messageList.addEventListener("click", (event) => {
  const downloadButton = event.target.closest("[data-attachment-id]");
  if (downloadButton && activeMessage) {
    downloadAttachment(activeMessage.id, downloadButton.dataset.attachmentId);
    return;
  }

  const row = event.target.closest("[data-message-id]");
  if (row) openMessage(row.dataset.messageId);
});

drawerContent.addEventListener("click", (event) => {
  const downloadButton = event.target.closest("[data-attachment-id]");
  if (downloadButton && activeMessage) {
    downloadAttachment(activeMessage.id, downloadButton.dataset.attachmentId);
  }
});

document.getElementById("copyBtn").addEventListener("click", copyEmail);
document.getElementById("refreshBtn").addEventListener("click", refreshInbox);
document.getElementById("inboxRefreshBtn").addEventListener("click", refreshInbox);
document.getElementById("newMailboxBtn").addEventListener("click", openModal);
document.getElementById("heroNewBtn").addEventListener("click", openModal);
document.getElementById("cancelModal").addEventListener("click", closeModal);
document.getElementById("confirmNew").addEventListener("click", createMailbox);
document.getElementById("backBtn").addEventListener("click", closeMessage);
document.getElementById("deleteBtn").addEventListener("click", deleteActiveMessage);
drawerBackdrop.addEventListener("click", closeMessage);
modalBackdrop.addEventListener("click", closeModal);
document.getElementById("menuBtn").addEventListener("click", () => showToast("Navigation coming soon"));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMessage();
    closeModal();
  }
});

async function initialize() {
  renderMessages();
  await loadSession();

  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (!document.hidden && activeMailbox) {
      loadInboxMessages({ showError: false });
    }
  }, POLL_INTERVAL);
}

initialize();
