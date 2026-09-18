# TempMailer

TempMailer is a lightweight temporary email inbox. It creates a disposable email address, polls for incoming messages, and lets you read, delete, inspect, and download email attachments without registration.

The Express server serves the frontend from `public/` and exposes the backend API under `/api`. Mailbox and message data are provided by the Privatix temporary mail service through RapidAPI.

## Features

- Create a random temporary mailbox with an available domain.
- Keep the active mailbox in a signed, HTTP-only cookie session.
- Poll and display incoming messages.
- Read plain-text and HTML email content in a sandboxed frame.
- Delete messages.
- Inspect raw message source.
- List and download message attachments.
- Security-oriented defaults including Helmet, CORS, rate limiting, and disabled `x-powered-by` headers.

## Requirements

- Node.js 24.x
- A RapidAPI account and a subscription to the [Privatix Temp Mail API](https://rapidapi.com/Privatix/api/privatix-temp-mail-v1)

## Getting Started

1. Install dependencies:

	 ```bash
	 npm install
	 ```

2. Create a `.env` file in the project root. You can start from `.env.example`:

	 ```env
	 PORT=3000
	 RAPIDAPI_KEY=your_rapidapi_key
	 RAPIDAPI_HOST=privatix-temp-mail-v1.p.rapidapi.com
	 ALLOWED_ORIGIN=http://localhost:3000
	 NODE_ENV=development
	 MAILBOX_TTL=7200000
	 SESSION_SECRET=replace-with-a-long-random-secret
	 ```

3. Start the server:

	 ```bash
	 npm start
	 ```

4. Open [http://localhost:3000](http://localhost:3000) in a browser.

For development with automatic restarts:

```bash
npm run dev
```

The server logs a warning when `RAPIDAPI_KEY` is missing. Mailbox operations will not work until the key is configured. `SESSION_SECRET` is required when `NODE_ENV=production`; in development, a random secret is generated for the process.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port used by the local server. |
| `RAPIDAPI_KEY` | none | RapidAPI key for the upstream temporary mail API. |
| `RAPIDAPI_HOST` | `privatix-temp-mail-v1.p.rapidapi.com` | RapidAPI host used for upstream requests. |
| `ALLOWED_ORIGIN` | `http://localhost:3000` | Allowed browser origin for credentialed CORS requests. Set an empty value to disable the CORS middleware. |
| `NODE_ENV` | `development` | Runtime environment. Production sessions use secure cookies. |
| `MAILBOX_TTL` | `7200000` | Mailbox session lifetime in milliseconds. |
| `SESSION_SECRET` | generated in development | Secret used to sign the session cookie. Required in production. |

Do not commit `.env` or expose `RAPIDAPI_KEY` in frontend code. The RapidAPI request is made by the server.

## API Reference

All endpoints below are relative to `/api`. Browser requests should include credentials so the session cookie is sent.

### Health and mailbox

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Returns service health. |
| `GET` | `/api/domains` | Returns domains available from the upstream service. |
| `POST` | `/api/mailboxes` | Creates a mailbox and stores it in the current session. The request must not contain a body. |
| `GET` | `/api/session` | Returns `{ active: false }` or the active mailbox. |
| `GET` | `/api/mailbox` | Returns the active mailbox, or `404` when none exists. |
| `GET` | `/api/mailboxes/:mailboxId` | Returns the current mailbox when the ID belongs to the session. |

### Messages

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/mailbox/messages` | Lists messages in the active mailbox. |
| `GET` | `/api/mailboxes/:mailboxId/messages` | Lists messages for the current mailbox ID. |
| `GET` | `/api/messages/:messageId` | Returns a full message, including text and HTML content. |
| `DELETE` | `/api/messages/:messageId` | Deletes a message from the upstream service. |
| `GET` | `/api/messages/:messageId/source` | Returns the raw email source. |
| `GET` | `/api/messages/:messageId/attachments` | Lists attachments and their metadata. |
| `GET` | `/api/messages/:messageId/attachments/:attachmentId` | Downloads an attachment as a file. |

Message and attachment endpoints verify that the requested message belongs to the active mailbox before calling the upstream service.

Example mailbox creation request:

```bash
curl -i -c cookies.txt -X POST http://localhost:3000/api/mailboxes
```

Example inbox request using the same session:

```bash
curl -b cookies.txt http://localhost:3000/api/mailbox/messages
```

## Limits and Session Behavior

- General `/api` traffic is limited to 60 requests per minute per client.
- Mailbox creation is limited to 5 requests per 10 minutes per client.
- The active mailbox is stored in a signed, HTTP-only cookie session; mailbox contents are not stored locally by this project.
- Sessions expire after `MAILBOX_TTL` milliseconds. The default is two hours.
- Creating a new mailbox replaces the current mailbox in the session.
- Temporary mailboxes should not be used for passwords, recovery codes, financial information, or other sensitive data.

## Project Structure

```text
public/                 Static frontend
	index.html            Application shell
	app.js                Client-side mailbox and inbox behavior
	style.css             Frontend styles
src/
	app.js                Express app, middleware, API mounting, and errors
	config.js              Environment configuration and validation
	local-server.js        Local HTTP server entry point
	routes/
		email.routes.js      Mailbox, message, source, and attachment routes
	services/
		mailbox.service.js   Random mailbox address generation
		tempmail.service.js  RapidAPI client and MIME attachment parsing
```

## Troubleshooting

### `Could not create a mailbox`

Check that `RAPIDAPI_KEY` is present, valid, and subscribed to the configured RapidAPI service. Also verify that the upstream service is returning available domains.

### The frontend cannot reach the API

When the frontend is hosted separately, set `ALLOWED_ORIGIN` to its exact origin, including the scheme and port. Because the API uses cookie sessions, the client must send credentials and the server must allow credentialed CORS requests.

### Production startup fails with `SESSION_SECRET is required in production`

Set a long, unpredictable `SESSION_SECRET` in the production environment before starting the server.

## License

No license has been specified for this project.