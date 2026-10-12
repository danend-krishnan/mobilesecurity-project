# MobSF Mobile Security Scanner

This project connects MobSF (Mobile Security Framework) to MCP-capable clients and provides an HTTP backend for a browser-based mobile application security dashboard.



# Prerequisites

* Node.js and npm
* MobSF installed and running, with its API key
* An Anthropic API key for the chat endpoint (optional)

# 🚀 Features

- Scans APK and IPA files through the existing MCP tool and MobSF.
- Provides asynchronous scan jobs and report polling through an Express API.
- Provides scan-aware chat through the Anthropic API; the API key stays on the backend.
- Validates uploaded file types and size, and removes uploaded files after scanning.
- Keeps scan jobs and chat history in memory; they are lost when the backend restarts.


# 🎞️ Installation

Clone the repo and install dependencies:

<pre>git clone https://github.com/pullkitsan/mobsf-mcp-server.git
cd mobsf-mcp-server
npm install </pre>

# 🔐 Setup

Copy the .env.example to .env:

> cp .env.example .env

Edit `.env` to include your MobSF API key. Set the Anthropic key to enable chat:

```env
MOBSF_URL=http://localhost:8000
MOBSF_API_KEY=YOUR_MOBSF_API_KEY
PORT=3000
ANTHROPIC_API_KEY=YOUR_ANTHROPIC_API_KEY
CLAUDE_MODEL=claude-sonnet-4-20250514
```


# ▶️ Run the Dashboard Backend

Run the API from the project directory:

```sh
npm start
```

The backend listens on `127.0.0.1:3000` by default. Make sure MobSF is running at the configured `MOBSF_URL`.

To run the standalone MCP server for an MCP client, use `npm run start:mcp` or configure the client as shown below.

To check TypeScript compilation, run `npm run typecheck`.

# 🖥️ Dashboard Backend

The Express API starts the existing MCP scanner as a separate stdio process. Its routes are:

- `POST /api/scan` with a multipart `file` field (`.apk` or `.ipa`); responds with a job ID.
- `GET /api/scan/:jobId` to poll status and retrieve the completed report.
- `POST /api/chat` with JSON `{ "jobId": "...", "question": "..." }` to ask about a completed scan.
- `GET /api/health` for a health check.

The API currently stores scan jobs and chat history in memory; they are cleared when the backend restarts. Uploaded files are removed after scanning.

# Project Status

## Completed

- [x] Preserve the MobSF MCP `scanFile` tool for APK and IPA scans.
- [x] Add the Express backend and asynchronous scan job lifecycle.
- [x] Add report/status polling and a health endpoint.
- [x] Add scan-aware Anthropic chat with in-memory conversation history.
- [x] Validate file type and size, remove temporary uploads, and bind the API to localhost.
- [x] Configure a 10-minute timeout for scan requests.
- [x] Verify TypeScript compilation, API health, and rejection of unsupported uploads.

## To Do

- [ ] Build the browser UI for uploading apps, tracking scan progress, viewing findings, and chatting about results.
- [ ] Run an end-to-end APK/IPA scan against a configured MobSF instance and test chat with an Anthropic API key.
- [ ] Decide whether scan reports and conversation history should persist across backend restarts.
- [ ] Review and resolve the dependency vulnerabilities reported by `npm install`.

# 🧲 Example Input

* The server exposes tool **scanFile** . So,  use any MCP client to try the following prompt **scan <FILE>.apk** or **scan <FILE>.ipa**. It will scan the IPA or APK file and will analyze the report(json) for you.  


# 📌 Notes

- Only .apk and .ipa file types are supported.

- This tool avoids fetching large fields like raw strings or source code dumps to keep responses fast and compliant with Claude/5ire message limits.


# ✅ Claude Config file (Example)

<pre> {
  "mcpServers": {
    "mobsf": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/server.ts"]
    }
  }
} </pre>

# ✅ 5ire Config file example ( Windows)
<pre>
  {
  "key": "mobsf",
  "command": "npx",
  "args": [
    "tsx",
    "C:\\Users\\Downloads\\mobsf-mcp-server\\server.js"
  ]
}
</pre>

