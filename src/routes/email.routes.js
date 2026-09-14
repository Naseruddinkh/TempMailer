const express = require("express");
const crypto = require("crypto");
const tempmail = require("../services/tempmail.service");
const { createMailbox } = require("../services/mailbox.service");
const config = require("../config");

const router = express.Router();

// In-memory MVP mailbox registry.
// Replace with Redis/database-backed sessions before production.
const mailboxes = new Map();

// ── Response sanitizers ─────────────────────────────────────────
// Whitelist fields from upstream API to prevent accidental data leaks.
function sanitizeInboxMessage(msg) {
  return {
    id: msg.mail_id || msg._id || msg.id,
    from: msg.mail_from,
    subject: msg.mail_subject,
    preview: msg.mail_preview,
    timestamp: msg.mail_timestamp,
    attachmentsCount: msg.mail_attachments_count || 0
  };
}

function sanitizeFullMessage(msg) {
  return {
    id: msg.mail_id || msg._id || msg.id,
    from: msg.mail_from,
    subject: msg.mail_subject,
    text: msg.mail_text || msg.mail_text_only,
    html: msg.mail_html,
    timestamp: msg.mail_timestamp,
    attachmentsCount: msg.mail_attachments_count || 0
  };
}
// ────────────────────────────────────────────────────────────────

function cleanupExpiredMailboxes() {
  const now = Date.now();

  for (const [id, mailbox] of mailboxes.entries()) {
    const createdAt = new Date(mailbox.createdAt).getTime();

    if (now - createdAt >= config.mailboxTtl) {
      mailboxes.delete(id);

      console.log(`Expired mailbox removed: ${id}`);
    }
  }
}

setInterval(cleanupExpiredMailboxes, 60 * 1000).unref();

function getSessionMailbox(req) {
  const mailboxId = req.session.mailboxId;

  if (!mailboxId) {
    return null;
  }

  return mailboxes.get(mailboxId) || null;
}

async function requireSessionMessage(req, res) {
  const mailbox = getSessionMailbox(req);

  if (!mailbox) {
    res.status(401).json({
      error: "No active mailbox"
    });
    return null;
  }

  const messages = await tempmail.getInbox(mailbox.email);

  if (!Array.isArray(messages)) {
    res.status(404).json({
      error: "Message not found"
    });
    return null;
  }

  const message = messages.find(
    (item) =>
      String(item.mail_id || item.id || item._id) ===
      String(req.params.messageId)
  );

  if (!message) {
    res.status(404).json({
      error: "Message not found"
    });
    return null;
  }

  return {
    mailbox,
    message
  };
}

router.get("/domains", async (req, res, next) => {
  try {
    const data = await tempmail.getDomains();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post("/mailboxes", async (req, res, next) => {
  try {
    // Reject unexpected body content
    if (req.body && Object.keys(req.body).length > 0) {
      return res.status(400).json({
        error: "Request body not accepted",
        code: "UNEXPECTED_BODY"
      });
    }

    // Fetch the latest available domains
    const domains = await tempmail.getDomains();

    // Normalize possible upstream response shapes
    const availableDomains = Array.isArray(domains)
      ? domains
      : Array.isArray(domains?.domains)
        ? domains.domains
        : [];

    if (availableDomains.length === 0) {
      return res.status(503).json({
        error: "No email domains are currently available",
        code: "NO_DOMAINS_AVAILABLE"
      });
    }

    // Randomly select one available domain
    const selectedDomain =
      availableDomains[crypto.randomInt(0, availableDomains.length)];

    // Generate the mailbox using the selected domain
    const mailbox = createMailbox(selectedDomain);

    mailboxes.set(mailbox.id, mailbox);

    // Associate mailbox with current browser session
    req.session.mailboxId = mailbox.id;

    return res.status(201).json({
      id: mailbox.id,
      email: mailbox.email,
      domain: mailbox.domain,
      createdAt: mailbox.createdAt
    });
  } catch (err) {
    next(err);
  }
});

router.get("/session", (req, res) => {
  const mailbox = getSessionMailbox(req);

  if (!mailbox) {
    return res.json({
      active: false
    });
  }

  return res.json({
    active: true,
    mailbox: {
      id: mailbox.id,
      email: mailbox.email,
      domain: mailbox.domain,
      createdAt: mailbox.createdAt
    }
  });
});

router.get("/mailbox", (req, res) => {
  const mailbox = getSessionMailbox(req);

  if (!mailbox) {
    return res.status(404).json({
      error: "No active mailbox"
    });
  }

  return res.json({
    id: mailbox.id,
    email: mailbox.email,
    domain: mailbox.domain,
    createdAt: mailbox.createdAt
  });
});

router.get("/mailbox/messages", async (req, res, next) => {
  try {
    const mailbox = getSessionMailbox(req);

    if (!mailbox) {
      return res.status(404).json({
        error: "No active mailbox"
      });
    }

    const data = await tempmail.getInbox(mailbox.email);

    // Whitelist fields to prevent upstream data leaks
    const sanitized = Array.isArray(data)
      ? data.map(sanitizeInboxMessage)
      : data;

    res.json(sanitized);
  } catch (err) {
    next(err);
  }
});

router.get("/mailboxes/:mailboxId", (req, res) => {
  const mailbox = getSessionMailbox(req);

  // Unified 404 prevents IDOR enumeration (no 401 vs 403 distinction)
  if (!mailbox || mailbox.id !== req.params.mailboxId) {
    return res.status(404).json({
      error: "Mailbox not found"
    });
  }

  res.json({
    id: mailbox.id,
    email: mailbox.email,
    domain: mailbox.domain,
    createdAt: mailbox.createdAt
  });
});

router.get("/mailboxes/:mailboxId/messages", async (req, res, next) => {
  try {
    const mailbox = getSessionMailbox(req);

    // Unified 404 prevents IDOR enumeration
    if (!mailbox || mailbox.id !== req.params.mailboxId) {
      return res.status(404).json({
        error: "Mailbox not found"
      });
    }

    const data = await tempmail.getInbox(mailbox.email);

    // Whitelist fields to prevent upstream data leaks
    const sanitized = Array.isArray(data)
      ? data.map(sanitizeInboxMessage)
      : data;

    res.json(sanitized);
  } catch (err) {
    next(err);
  }
});

router.get("/messages/:messageId", async (req, res, next) => {
  try {
    const access = await requireSessionMessage(req, res);

    if (!access) return;

    const data = await tempmail.getMessage(req.params.messageId);

    // Whitelist fields to prevent upstream data leaks
    res.json(sanitizeFullMessage(data));
  } catch (err) {
    next(err);
  }
});

router.delete("/messages/:messageId", async (req, res, next) => {
  try {
    const access = await requireSessionMessage(req, res);

    if (!access) return;

    const data = await tempmail.deleteMessage(req.params.messageId);

    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get("/messages/:messageId/source", async (req, res, next) => {
  try {
    const access = await requireSessionMessage(req, res);

    if (!access) return;

    const data = await tempmail.getSource(req.params.messageId);

    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get("/messages/:messageId/attachments", async (req, res, next) => {
  try {
    const access = await requireSessionMessage(req, res);

    if (!access) return;

    const data = await tempmail.getAttachments(req.params.messageId);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get(
  "/messages/:messageId/attachments/:attachmentId",
  async (req, res, next) => {
    try {
      const access = await requireSessionMessage(req, res);

      if (!access) return;

      const attachment = await tempmail.getAttachment(
        req.params.messageId,
        req.params.attachmentId
      );

      // Strip everything except safe ASCII chars and truncate
      const safeFilename = attachment.filename
        .replace(/[^\w.\-]/g, "_")
        .substring(0, 255);

      // Force safe content-type to prevent XSS via attacker-controlled MIME
      res.setHeader("Content-Type", "application/octet-stream");

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeFilename}"`
      );

      res.setHeader("X-Content-Type-Options", "nosniff");

      res.send(attachment.content);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;