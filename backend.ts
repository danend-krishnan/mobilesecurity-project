import axios from "axios";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import express, { ErrorRequestHandler } from "express";
import multer from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env") });

type ScanStatus = "queued" | "scanning" | "complete" | "failed";
type ChatMessage = { role: "user" | "assistant"; content: string };

interface ScanJob {
  id: string;
  fileName: string;
  status: ScanStatus;
  createdAt: string;
  report?: unknown;
  error?: string;
}

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const uploadDirectory = path.join(os.tmpdir(), "mobsf-dashboard-uploads");
const jobs = new Map<string, ScanJob>();
const conversations = new Map<string, ChatMessage[]>();

fs.mkdirSync(uploadDirectory, { recursive: true });
app.use(express.json({ limit: "1mb" }));

const upload = multer({
  dest: uploadDirectory,
  limits: { fileSize: 250 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (extension !== ".apk" && extension !== ".ipa") {
      callback(new Error("Only .apk and .ipa files are supported."));
      return;
    }
    callback(null, true);
  },
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_request, file, callback) => {
      callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    }
  })
});

async function runScan(job: ScanJob, filePath: string): Promise<void> {
  const client = new Client({ name: "mobsf-dashboard", version: "1.0.0" }, {});
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", path.join(__dirname, "server.ts")],
    cwd: __dirname
  });

  try {
    job.status = "scanning";
    await client.connect(transport);
    const result = await client.callTool(
      { name: "scanFile", arguments: { file: filePath } },
      CallToolResultSchema,
      { timeout: 10 * 60 * 1000 }
    );
    const text = (result.content as Array<{ type: string; text?: string }>)
      .map((item) => item.type === "text" ? item.text : "")
      .filter(Boolean)
      .join("\n");

    if (result.isError) {
      throw new Error(text || "The MobSF scan failed.");
    }

    job.report = JSON.parse(text);
    job.status = "complete";
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "The MobSF scan failed.";
  } finally {
    await fs.promises.rm(filePath, { force: true }).catch(() => undefined);
    await client.close().catch(() => undefined);
  }
}

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.post("/api/scan", upload.single("file"), (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: "Upload a file using the 'file' field." });
    return;
  }

  const job: ScanJob = {
    id: randomUUID(),
    fileName: request.file.originalname,
    status: "queued",
    createdAt: new Date().toISOString()
  };
  jobs.set(job.id, job);
  void runScan(job, request.file.path);
  response.status(202).json({ jobId: job.id, status: job.status });
});

app.get("/api/scan/:jobId", (request, response) => {
  const job = jobs.get(request.params.jobId);
  if (!job) {
    response.status(404).json({ error: "Scan job not found." });
    return;
  }

  response.json(job);
});

app.post("/api/chat", async (request, response) => {
  const { jobId, question } = request.body as { jobId?: unknown; question?: unknown };
  if (typeof jobId !== "string" || typeof question !== "string" || !question.trim()) {
    response.status(400).json({ error: "Provide a jobId and a non-empty question." });
    return;
  }
  if (question.length > 4000) {
    response.status(400).json({ error: "Questions must be 4,000 characters or fewer." });
    return;
  }

  const job = jobs.get(jobId);
  if (!job) {
    response.status(404).json({ error: "Scan job not found." });
    return;
  }
  if (job.status !== "complete") {
    response.status(409).json({ error: "Chat is available after the scan completes." });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    response.status(503).json({ error: "Chat is not configured on the server." });
    return;
  }

  const history = conversations.get(jobId) ?? [];
  const userMessage: ChatMessage = { role: "user", content: question.trim() };
  const messages = [...history, userMessage].slice(-20);
  try {
    const result = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 1200,
        system: `You are a mobile application security analyst. Explain findings clearly, prioritize actionable risk, and do not claim the scan proves the app is safe. Base your answers on this MobSF scan report:\n${JSON.stringify(job.report)}`,
        messages
      },
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        timeout: 60_000
      }
    );
    const answer = (result.data.content as Array<{ type: string; text?: string }>)
      .filter((block) => block.type === "text")
      .map((block) => block.text || "")
      .join("\n")
      .trim();

    const updatedHistory: ChatMessage[] = [...messages, { role: "assistant", content: answer }];
    conversations.set(jobId, updatedHistory.slice(-20));
    response.json({ answer });
  } catch (error) {
    const message = axios.isAxiosError(error)
      ? error.response?.data?.error?.message || error.message
      : error instanceof Error ? error.message : "Chat request failed.";
    response.status(502).json({ error: message });
  }
});

const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    response.status(413).json({ error: "Files must be 250 MB or smaller." });
    return;
  }
  response.status(400).json({ error: error instanceof Error ? error.message : "Request failed." });
};
app.use(handleError);

app.listen(port, host, () => {
  console.log(`MobSF dashboard API listening on http://${host}:${port}`);
});