const axios = require("axios");
const crypto = require("crypto");
const { simpleParser } = require("mailparser");

const config = require("../config");

const client = axios.create({
  baseURL: `https://${config.rapidApiHost}`,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    "X-RapidAPI-Key": config.rapidApiKey,
    "X-RapidAPI-Host": config.rapidApiHost
  }
});

function md5Email(email) {
  return crypto
    .createHash("md5")
    .update(email.toLowerCase())
    .digest("hex");
}

async function getDomains() {
  const response = await client.get("/request/domains/");
  return response.data;
}

async function getInbox(email) {
  const hash = md5Email(email);

  const response = await client.get(
    `/request/mail/id/${hash}/`
  );

  return response.data;
}

async function getMessage(messageId) {
  const response = await client.get(
    `/request/one_mail/id/${encodeURIComponent(messageId)}/`
  );

  return response.data;
}

async function deleteMessage(messageId) {
  const response = await client.get(
    `/request/delete/id/${encodeURIComponent(messageId)}/`
  );

  return response.data;
}

async function getSource(messageId) {
  const response = await client.get(
    `/request/source/id/${encodeURIComponent(messageId)}/`
  );

  return response.data;
}

/*
 * Get attachment information from the upstream API.
 *
 * The Privatix attachment endpoints may return HTTP 500.
 * Therefore we use the raw email source as a fallback.
 */
async function getAttachments(messageId) {
  const sourceData = await getSource(messageId);

  const source = Array.isArray(sourceData)
    ? sourceData[0]
    : sourceData;

  if (!source || typeof source !== "string") {
    throw new Error("Invalid email source returned by upstream API");
  }

  const parsed = await simpleParser(source);

  return parsed.attachments.map((attachment, index) => ({
    id: index,
    filename: attachment.filename || `attachment-${index}`,
    contentType:
      attachment.contentType || "application/octet-stream",
    size: attachment.size || attachment.content.length
  }));
}

/*
 * Extract one attachment from the raw MIME email source.
 */
async function getAttachment(messageId, attachmentId) {
  const index = Number(attachmentId);

  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Invalid attachment ID");
  }

  const sourceData = await getSource(messageId);

  const source = Array.isArray(sourceData)
    ? sourceData[0]
    : sourceData;

  if (!source || typeof source !== "string") {
    throw new Error("Invalid email source returned by upstream API");
  }

  const parsed = await simpleParser(source);

  const attachment = parsed.attachments[index];

  if (!attachment) {
    const error = new Error("Attachment not found");
    error.statusCode = 404;
    throw error;
  }

  return {
    filename: attachment.filename || `attachment-${index}`,
    contentType:
      attachment.contentType || "application/octet-stream",
    size: attachment.size || attachment.content.length,
    content: attachment.content
  };
}

module.exports = {
  md5Email,
  getDomains,
  getInbox,
  getMessage,
  deleteMessage,
  getSource,
  getAttachments,
  getAttachment
};