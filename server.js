const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 5173);
const envPath = path.join(root, ".env");

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 80_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function buildReviewInput({ question, modelAnswer, userAnswer }) {
  const systemPrompt = [
    "You are a COS 461 exam answer reviewer.",
    "Grade the student's answer against the model answer semantically, not by keyword overlap.",
    "Accept correct paraphrases and concise answers.",
    "Do not invent requirements outside the model answer.",
    "Return only strict JSON.",
  ].join(" ");

  const rubric = [
    "Rubric: 90-100 strong, 70-89 almost, below 70 needs_work.",
    "If the question asks for code, examples, lists, or contrasts, grade those requirements.",
    "Use 1-2 short strengths, 1-2 short gaps, and one next step.",
  ].join("\n");

  const userPrompt = [
    rubric,
    "",
    "<question>",
    question,
    "</question>",
    "",
    "<model_answer>",
    modelAnswer,
    "</model_answer>",
    "",
    "<student_answer>",
    userAnswer,
    "</student_answer>",
  ].join("\n");

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
}

function fetchWithTimeout(url, options, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timeout);
  });
}

async function reviewAnswer(req, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(res, 500, { error: "OPENAI_API_KEY is required for answer review." });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readRequestBody(req));
  } catch {
    sendJson(res, 400, { error: "Invalid review request." });
    return;
  }

  const { question, modelAnswer, userAnswer } = payload;
  if (!question || !modelAnswer || !userAnswer || !userAnswer.trim()) {
    sendJson(res, 400, { error: "Question, model answer, and your answer are required." });
    return;
  }

  try {
    const startedAt = Date.now();
    const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: buildReviewInput({ question, modelAnswer, userAnswer }),
        max_output_tokens: 260,
        text: {
          format: {
            type: "json_schema",
            name: "answer_review",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["score", "verdict", "strengths", "gaps", "nextStep"],
              properties: {
                score: { type: "integer", minimum: 0, maximum: 100 },
                verdict: { type: "string", enum: ["needs_work", "almost", "strong"] },
                strengths: {
                  type: "array",
                  minItems: 1,
                  maxItems: 3,
                  items: { type: "string" },
                },
                gaps: {
                  type: "array",
                  minItems: 1,
                  maxItems: 3,
                  items: { type: "string" },
                },
                nextStep: {
                  type: "string",
                  description: "One concise action the student should take next.",
                },
              },
            },
          },
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      sendJson(res, response.status, {
        error: data.error?.message || "OpenAI answer review failed.",
      });
      return;
    }

    const text = data.output_text || data.output?.flatMap((item) => item.content || [])
      .find((item) => item.type === "output_text")?.text;
    if (!text) {
      sendJson(res, 502, { error: "OpenAI returned an empty review." });
      return;
    }

    sendJson(res, 200, { ...JSON.parse(text), durationMs: Date.now() - startedAt });
  } catch (error) {
    const message = error.name === "AbortError"
      ? "OpenAI review timed out after 20 seconds."
      : error.message || "OpenAI answer review failed.";
    sendJson(res, 502, { error: message });
  }
}

function serveFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(root, requested));

  if (!filePath.startsWith(root) || path.basename(filePath) === ".env") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const type = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/review") {
    reviewAnswer(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveFile(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(port, () => {
  console.log(`Quiz app listening on http://127.0.0.1:${port}`);
});
