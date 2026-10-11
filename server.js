import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const ROBLOX_SEARCH_URL = "https://apis.roblox.com/toolbox-service/v2/assets:search";
const ROBLOX_ASSET_URL = "https://apis.roblox.com/toolbox-service/v2/assets";

function text(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function getAssetId(item) {
  const candidates = [item?.id, item?.assetId, item?.asset?.id, item?.asset?.assetId];
  for (const value of candidates) {
    const id = String(value ?? "");
    if (/^\d{1,20}$/.test(id)) return id;
  }
  return "";
}

function normalizeAsset(item) {
  const asset = item?.asset || item || {};
  const id = getAssetId(item) || getAssetId(asset);
  const name = text(asset.name || item?.name || item?.title, 160) || `Roblox asset ${id || ""}`.trim();
  const description = text(asset.description || item?.description, 400);
  const creator = text(asset.creator?.name || item?.creator?.name || item?.creatorName, 100);
  const rawType = asset.assetType || asset.assetTypeName || item?.assetType || item?.assetTypeName;
  const assetType = typeof rawType === "string" ? rawType : text(rawType?.name, 50);
  return {
    id,
    name,
    description,
    creator,
    assetType: assetType || "Model",
    url: id ? `https://create.roblox.com/store/asset/${encodeURIComponent(id)}` : ""
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(process.env.GROQ_API_KEY) });
});

// Roblox Creator Store search. Results are cached in the browser for offline viewing.
app.get("/api/search", async (req, res) => {
  const q = text(req.query.q, 100);
  if (!q) return res.status(400).json({ error: "Enter a model name or asset ID." });

  // Numeric input can be looked up directly, avoiding a broad search.
  if (/^\d{1,20}$/.test(q)) {
    try {
      const response = await fetch(`${ROBLOX_ASSET_URL}/${encodeURIComponent(q)}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) {
        return res.status(response.status === 404 ? 404 : 502).json({
          error: response.status === 404
            ? "No public asset details were returned for that ID."
            : "Roblox could not return asset details. Try again later."
        });
      }
      const data = await response.json();
      return res.json({ results: [normalizeAsset(data)], source: "Roblox Creator Store" });
    } catch {
      return res.status(502).json({ error: "Could not reach Roblox. Check your internet and try again." });
    }
  }

  const url = new URL(ROBLOX_SEARCH_URL);
  url.searchParams.set("keyword", q);
  url.searchParams.set("searchCategoryType", "Model");
  url.searchParams.set("limit", "10");
  url.searchParams.set("searchView", "Core");

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = text(data?.message || data?.title, 180);
      return res.status(502).json({
        error: details || "Roblox search failed. The Creator Store API may require different access or parameters."
      });
    }
    const rawResults = data?.data || data?.results || data?.assets || data?.items || [];
    const results = Array.isArray(rawResults) ? rawResults.map(normalizeAsset) : [];
    return res.json({ results, source: "Roblox Creator Store" });
  } catch {
    return res.status(502).json({ error: "Could not reach Roblox. Check your internet and try again." });
  }
});

// Groq key stays on the server. This route is online-only by design.
app.post("/api/ai", async (req, res) => {
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) {
    return res.status(400).json({ error: "Send between 1 and 30 chat messages." });
  }

  const valid = messages.every((message) =>
    message &&
    ["user", "assistant"].includes(message.role) &&
    typeof message.content === "string" &&
    message.content.length > 4000 === false
  );
  if (!valid) return res.status(400).json({ error: "One or more messages are invalid or too long." });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "Groq AI is not configured yet. Add GROQ_API_KEY in Render Environment settings." });
  }

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: "You are a helpful Roblox Studio and Luau development assistant. Help with game design, supported scripting, debugging, and Creator Store asset information. Be clear when code is untested. Never claim that a web app can directly import an asset into Roblox Studio Lite unless a supported official workflow exists. Respect asset permissions and Roblox platform rules."
          },
          ...messages
        ],
        temperature: 0.6,
        max_tokens: 1200
      }),
      signal: AbortSignal.timeout(30000)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = text(data?.error?.message, 220);
      return res.status(502).json({ error: detail || "Groq did not complete the request. Try again later." });
    }

    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
      return res.status(502).json({ error: "Groq returned an empty answer." });
    }
    return res.json({ answer: answer.trim() });
  } catch {
    return res.status(502).json({ error: "Could not reach Groq. Your chat is saved locally; try again when online." });
  }
});

// Static frontend comes after API routes.
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: "1h"
}));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI Model Importer listening on port ${PORT}`);
});
