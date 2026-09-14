# TempMailer Backend

A Node.js + Express backend for a temporary email service. TempMailer acts as a secure server-side wrapper around the **Privatix Temp Mail API on RapidAPI**, keeping RapidAPI credentials away from the frontend.

> **Status:** MVP / development-ready backend  
> **Runtime:** Node.js  
> **Framework:** Express.js  
> **Upstream service:** Privatix Temp Mail API via RapidAPI

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Running the Server](#running-the-server)
- [API Endpoints](#api-endpoints)
- [Testing with cURL](#testing-with-curl)
- [Mailbox and Session Behavior](#mailbox-and-session-behavior)
- [Attachments](#attachments)
- [Security](#security)
- [Important MVP Limitations](#important-mvp-limitations)
- [Production Checklist](#production-checklist)
- [Upstream API](#upstream-api)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- Generate a random temporary email address.
- Automatically select an available upstream email domain.
- Retrieve the current mailbox inbox.
- Retrieve individual messages.
- Delete messages.
- Retrieve raw MIME email source.
- List and download email attachments.
- Attachment fallback through raw MIME parsing when the upstream attachment endpoints fail.
- Browser-session-based mailbox ownership.
- Protection against mailbox/message IDOR.
- API rate limiting.
- CORS protection.
- HTTP security headers with Helmet.
- Server-side RapidAPI credentials.
- Input validation for mailbox creation and attachment IDs.
- Sanitized API responses.
- Centralized error handling.
- Automatic cleanup of expired local mailbox records.

---

## Architecture

The frontend should **never communicate directly with RapidAPI**.

```text
┌──────────────┐
│   Frontend   │
│ Web / Mobile │
└──────┬───────┘
       │
       │ HTTP / JSON
       ▼
┌──────────────────────┐
│   TempMailer API     │
│   Node.js + Express  │
│                      │
│ • Sessions           │
│ • Rate limiting      │
│ • CORS               │
│ • Helmet             │
│ • Ownership checks   │
│ • Response filtering │
└──────────┬───────────┘
           │
           │ RapidAPI credentials
           ▼
┌──────────────────────────────┐
│ Privatix Temp Mail API       │
│        via RapidAPI          │
└──────────────────────────────┘
```

The RapidAPI key and host are stored on the backend and are not exposed to the frontend.

---

## Project Structure

```text
TempMailer/
├── server.js
├── package.json
├── package-lock.json
├── .env
├── .env.example
├── .gitignore
├── README.md
└── src/
    ├── app.js
    ├── config.js
    ├── routes/
    │   └── email.routes.js
    └── services/
        ├── mailbox.service.js
        └── tempmail.service.js
```

### Main files

| File | Purpose |
|---|---|
| `server.js` | Starts the Express server |
| `src/app.js` | Express application, middleware, sessions, rate limits and error handling |
| `src/config.js` | Environment configuration |
| `src/routes/email.routes.js` | REST API routes and mailbox/message ownership checks |
| `src/services/tempmail.service.js` | Communication with the Privatix Temp Mail API |
| `src/services/mailbox.service.js` | Temporary mailbox/username generation |
| `.env` | Local secrets and configuration |
| `.env.example` | Safe environment-variable template |

---

## Requirements

Install the following before starting:

- Node.js 18+ recommended
- npm
- A RapidAPI account
- Access to the Privatix Temp Mail API on RapidAPI

Check your versions:

```bash
node --version
npm --version
```

---

## Installation

Clone or copy the project and enter the backend directory:

```bash
cd TempMailer
```

Install dependencies:

```bash
npm install
```

---

## Environment Configuration

Create a `.env` file in the project root.

### Example

```env
PORT=3000

RAPIDAPI_KEY=YOUR_RAPIDAPI_KEY
RAPIDAPI_HOST=privatix-temp-mail-v1.p.rapidapi.com

ALLOWED_ORIGIN=http://localhost:3000

NODE_ENV=development

MAILBOX_TTL=7200000

SESSION_SECRET=YOUR_LONG_RANDOM_SESSION_SECRET
```

### Variables

| Variable | Description |
|---|---|
| `PORT` | Port used by the backend |
| `RAPIDAPI_KEY` | RapidAPI authentication key |
| `RAPIDAPI_HOST` | RapidAPI host for the Privatix API |
| `ALLOWED_ORIGIN` | Frontend origin allowed by CORS |
| `NODE_ENV` | `development` or `production` |
| `MAILBOX_TTL` | Local mailbox-record lifetime in milliseconds |
| `SESSION_SECRET` | Secret used to sign Express session cookies |

### Important

**Never commit `.env` to Git.**

The `.gitignore` should contain:

```gitignore
node_modules/
.env
.env.*
!.env.example
npm-debug.log*
.DS_Store
cookies.txt
```

If an API key has ever been exposed publicly, rotate/revoke it before using the project in production.

---

## Running the Server

### Development

```bash
npm run dev
```

The server should start at:

```text
http://localhost:3000
```

### Production

```bash
npm start
```

In production, make sure:

- `NODE_ENV=production`
- `SESSION_SECRET` is explicitly configured.
- HTTPS is enabled.
- A production session store is configured.
- The mailbox registry is moved out of process memory.

---

# API Endpoints

All API routes use the `/api` prefix.

## Health

### `GET /api/health`

Checks whether the backend is running.

Example response:

```json
{
  "status": "ok",
  "service": "tempmailer"
}
```

---

## Get Available Domains

### `GET /api/domains`

Returns the currently available temporary-email domains from the upstream API.

Example:

```json
[
  "@example.com",
  "@example.net"
]
```

The exact domains are controlled by the upstream provider and may change.

---

## Create a Mailbox

### `POST /api/mailboxes`

Creates a new temporary mailbox.

The backend:

1. Requests the latest available domains.
2. Randomly selects one domain.
3. Generates a random username.
4. Creates a local mailbox record.
5. Associates the mailbox with the current browser session.

No request body is required.

Example:

```bash
curl.exe -c cookies.txt -X POST "http://localhost:3000/api/mailboxes"
```

Example response:

```json
{
  "id": "mb_...",
  "email": "cosmicorbit491@example.com",
  "domain": "@example.com",
  "createdAt": "2026-09-12T12:00:00.000Z"
}
```

The session cookie is important. Use `-c cookies.txt` with cURL to save it.

---

## Get Current Session

### `GET /api/session`

Returns information about the mailbox associated with the current browser session.

Example:

```json
{
  "active": true,
  "mailbox": {
    "id": "mb_...",
    "email": "cosmicorbit491@example.com",
    "domain": "@example.com",
    "createdAt": "2026-09-12T12:00:00.000Z"
  }
}
```

If there is no active mailbox:

```json
{
  "active": false
}
```

---

## Get Current Mailbox

### `GET /api/mailbox`

Returns the mailbox associated with the current session.

Example:

```json
{
  "id": "mb_...",
  "email": "cosmicorbit491@example.com",
  "domain": "@example.com",
  "createdAt": "2026-09-12T12:00:00.000Z"
}
```

---

## Get Current Mailbox Messages

### `GET /api/mailbox/messages`

Returns the messages belonging to the current session's mailbox.

Example:

```json
[
  {
    "id": "e99414...",
    "from": "sender@example.com",
    "subject": "Test email",
    "preview": "A test message",
    "timestamp": "2026-09-12T12:10:00.000Z",
    "attachmentsCount": 1
  }
]
```

Only selected message fields are returned.

---

## Get Mailbox by ID

### `GET /api/mailboxes/:mailboxId`

Returns mailbox information only if the mailbox belongs to the current session.

Example:

```bash
curl.exe -b cookies.txt "http://localhost:3000/api/mailboxes/MAILBOX_ID"
```

Unauthorized or invalid mailbox IDs return:

```json
{
  "error": "Mailbox not found"
}
```

---

## Get Messages by Mailbox ID

### `GET /api/mailboxes/:mailboxId/messages`

Returns messages for the requested mailbox only when the mailbox belongs to the current session.

Example:

```bash
curl.exe -b cookies.txt "http://localhost:3000/api/mailboxes/MAILBOX_ID/messages"
```

---

## Get a Message

### `GET /api/messages/:messageId`

Returns a full message after verifying that the message belongs to the active mailbox.

Example:

```bash
curl.exe -b cookies.txt "http://localhost:3000/api/messages/MESSAGE_ID"
```

Example response:

```json
{
  "id": "e99414...",
  "from": "sender@example.com",
  "subject": "Test email",
  "text": "A test message",
  "html": "<p>A test message</p>",
  "timestamp": "2026-09-12T12:10:00.000Z",
  "attachmentsCount": 1
}
```

---

## Delete a Message

### `DELETE /api/messages/:messageId`

Deletes a message after verifying ownership.

Example:

```bash
curl.exe -b cookies.txt -X DELETE \
  "http://localhost:3000/api/messages/MESSAGE_ID"
```

---

## Get Raw Message Source

### `GET /api/messages/:messageId/source`

Returns the raw MIME source of a message.

Example:

```bash
curl.exe -b cookies.txt \
  "http://localhost:3000/api/messages/MESSAGE_ID/source"
```

Raw email source can contain headers, HTML, encoded content and MIME attachments.

If displayed in a frontend, render it as plain text rather than injecting it as HTML.

---

# Attachments

## List Attachments

### `GET /api/messages/:messageId/attachments`

Returns attachment metadata.

Example:

```bash
curl.exe -b cookies.txt \
  "http://localhost:3000/api/messages/MESSAGE_ID/attachments"
```

Example response:

```json
[
  {
    "id": 0,
    "filename": "image.png",
    "contentType": "image/png",
    "size": 24456
  }
]
```

---

## Download an Attachment

### `GET /api/messages/:messageId/attachments/:attachmentId`

Downloads one attachment.

Example:

```bash
curl.exe -b cookies.txt \
  "http://localhost:3000/api/messages/MESSAGE_ID/attachments/0" \
  -o attachment.png
```

The backend sends attachments as:

```text
application/octet-stream
```

and uses:

```text
X-Content-Type-Options: nosniff
```

The filename is sanitized before being placed in the `Content-Disposition` header.

---

## Attachment Fallback

The upstream attachment endpoints may return an HTTP 500 for some messages.

To handle this, TempMailer can:

1. Request the raw MIME source.
2. Parse the MIME email with `mailparser`.
3. Extract attachment metadata.
4. Extract attachment bytes.
5. Return the attachment through the backend.

This allows attachment handling to continue even when the upstream attachment endpoint is unavailable.

---

# Testing with cURL

Because the API uses browser sessions, use a cookie jar.

## 1. Start the server

```bash
npm run dev
```

## 2. Test health

Windows:

```powershell
curl.exe "http://localhost:3000/api/health"
```

## 3. Create a mailbox

```powershell
curl.exe -c cookies.txt -X POST "http://localhost:3000/api/mailboxes"
```

Save the returned mailbox ID and email address.

## 4. Check the session

```powershell
curl.exe -b cookies.txt "http://localhost:3000/api/session"
```

## 5. Check the mailbox

```powershell
curl.exe -b cookies.txt "http://localhost:3000/api/mailbox"
```

## 6. Check the inbox

```powershell
curl.exe -b cookies.txt "http://localhost:3000/api/mailbox/messages"
```

## 7. Read a message

Replace `MESSAGE_ID`:

```powershell
curl.exe -b cookies.txt "http://localhost:3000/api/messages/MESSAGE_ID"
```

## 8. Get the raw source

```powershell
curl.exe -b cookies.txt "http://localhost:3000/api/messages/MESSAGE_ID/source"
```

## 9. List attachments

```powershell
curl.exe -b cookies.txt "http://localhost:3000/api/messages/MESSAGE_ID/attachments"
```

## 10. Download attachment 0

```powershell
curl.exe -b cookies.txt "http://localhost:3000/api/messages/MESSAGE_ID/attachments/0" -o attachment.bin
```

---

# Mailbox and Session Behavior

TempMailer currently uses two in-memory mechanisms:

### Mailbox registry

Mailbox information is stored in a JavaScript `Map`.

```text
mailbox ID
    ↓
email address
domain
createdAt
```

### Express session

The session stores the active mailbox ID:

```text
Browser
   ↓
tempmailer.sid
   ↓
mailboxId
   ↓
mailbox registry
```

Creating another mailbox in the same browser session makes the new mailbox the active mailbox for that session.

---

# Ownership and IDOR Protection

Message routes do not trust a supplied message ID by itself.

Before returning, deleting or downloading message-related data, the backend:

1. Gets the mailbox associated with the current session.
2. Retrieves the mailbox inbox.
3. Searches for the requested message ID.
4. Continues only if the message belongs to that mailbox.

This prevents a user from simply changing:

```text
/messages/MESSAGE_ID
```

to access another mailbox's message.

Mailbox-ID routes also compare the requested mailbox ID against the active session mailbox.

Unauthorized mailbox IDs return a generic 404 response to reduce enumeration.

---

# Security

The backend currently includes several security controls.

## RapidAPI key protection

RapidAPI credentials are stored in environment variables and are used only by the backend.

The frontend should never receive:

```text
RAPIDAPI_KEY
X-RapidAPI-Key
X-RapidAPI-Host
```

---

## Helmet

Helmet provides common HTTP security headers.

---

## CORS

CORS is restricted using:

```env
ALLOWED_ORIGIN=http://localhost:3000
```

Change this to the actual frontend origin when deploying.

---

## Rate Limiting

General API requests are rate limited.

Mailbox creation has a stricter limit to reduce abuse and unnecessary upstream requests.

Current mailbox creation limit:

```text
5 requests / 10 minutes
```

General API limit:

```text
60 requests / minute
```

---

## Secure Session Cookie

The session cookie is configured with:

- `httpOnly`
- `sameSite: "lax"`
- `secure` in production
- 2-hour maximum age

This prevents JavaScript from directly reading the session cookie.

---

## Response Sanitization

Inbox and message responses use whitelisted fields rather than returning the complete upstream response.

This reduces the chance of accidentally exposing upstream fields that the frontend does not need.

---

## Attachment Filename Protection

Attachment filenames are sanitized before being placed in HTTP headers.

Unsafe characters are replaced with `_`.

---

## Error Handling

The backend provides centralized error handling for:

- Invalid JSON
- Upstream 404 errors
- Upstream 429 errors
- Upstream 5xx errors
- Timeouts
- Network errors
- Route-specific errors
- Unexpected server errors

RapidAPI authentication headers are intentionally not logged.

---

# Important MVP Limitations

This project is suitable for development/MVP use, but several components should be replaced before a public production launch.

## 1. In-memory mailbox registry

Current implementation:

```js
const mailboxes = new Map();
```

This data disappears when the Node.js process restarts.

Use Redis or a database in production.

---

## 2. Express MemoryStore

The default Express session store is intended for development, not production.

Use a persistent session store such as Redis for production.

---

## 3. Mailbox lifetime

`MAILBOX_TTL` controls the local TempMailer mailbox record.

It does **not** extend the lifetime of the upstream mailbox or messages.

The upstream Temp Mail provider controls message retention.

---

## 4. Multiple server instances

The current in-memory registry/session setup is not suitable for horizontally scaled deployments.

If multiple backend instances are used, move session and mailbox state to shared infrastructure such as Redis/database storage.

---

## 5. Username collisions

The mailbox username generator is random but has a finite set of generated combinations.

A production implementation should include stronger uniqueness/collision handling.

---

## 6. Large MIME messages

The attachment fallback parses the raw email and loads attachment content into memory.

A production implementation should consider message-size limits and safer handling for very large attachments.

---

# Production Checklist

Before making TempMailer publicly accessible:

- [ ] Rotate any previously exposed RapidAPI key.
- [ ] Generate a strong `SESSION_SECRET`.
- [ ] Set `NODE_ENV=production`.
- [ ] Use HTTPS.
- [ ] Configure the correct `ALLOWED_ORIGIN`.
- [ ] Configure `app.set("trust proxy", 1)` when required by the deployment proxy.
- [ ] Replace Express MemoryStore with Redis or another production session store.
- [ ] Replace the in-memory mailbox `Map` with Redis/database storage.
- [ ] Add stronger mailbox uniqueness/collision handling.
- [ ] Review rate limits for real traffic.
- [ ] Add abuse/spam protection.
- [ ] Add request logging and monitoring without logging secrets.
- [ ] Add limits for large email/attachment processing.
- [ ] Never expose RapidAPI credentials to the frontend.
- [ ] Do not commit `.env`.
- [ ] Do not ship `node_modules` in the source repository/archive.
- [ ] Keep `package-lock.json` committed for reproducible installs.
- [ ] Review the frontend so message HTML and raw source are not inserted with unsafe `innerHTML`.

---

# Upstream API

TempMailer uses the **Privatix Temp Mail API** through RapidAPI.

RapidAPI host:

```text
privatix-temp-mail-v1.p.rapidapi.com
```

The backend service layer keeps upstream API implementation details inside:

```text
src/services/tempmail.service.js
```

The frontend therefore only needs to communicate with TempMailer's own `/api/...` endpoints.

---

# Troubleshooting

## `RAPIDAPI_KEY is not configured`

Make sure `.env` exists in the project root and contains:

```env
RAPIDAPI_KEY=YOUR_KEY
```

Restart the server after changing environment variables.

---

## CORS error

Make sure `ALLOWED_ORIGIN` exactly matches the frontend origin.

For example:

```env
ALLOWED_ORIGIN=http://localhost:3000
```

If the frontend runs on another port:

```env
ALLOWED_ORIGIN=http://localhost:5500
```

The frontend must also send credentials when using the session cookie.

Example:

```javascript
fetch("http://localhost:3000/api/session", {
  credentials: "include"
});
```

---

## `No active mailbox`

Create a mailbox first:

```powershell
curl.exe -c cookies.txt -X POST "http://localhost:3000/api/mailboxes"
```

Then reuse the cookie jar:

```powershell
curl.exe -b cookies.txt "http://localhost:3000/api/mailbox/messages"
```

---

## Attachment endpoint returns an error

The upstream attachment endpoint may fail for some messages.

TempMailer uses the raw MIME source as a fallback, so make sure the message has a valid source and that `mailparser` is installed.

---

## Session disappears after restarting the server

This is expected with the current development setup because the session store and mailbox registry are in memory.

Production deployments should use persistent shared storage.

---

# Development Notes

Useful commands:

```bash
npm install
npm run dev
npm start
```

Do not run JavaScript expressions such as:

```javascript
process.env.SESSION_SECRET
```

directly in PowerShell. Those are Node.js expressions and should be used inside JavaScript files or a Node.js shell.

---

# License

Add your project's license here before publishing.

For example:

```text
MIT License
```

if you decide to release TempMailer under MIT.
