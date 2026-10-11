
import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();

app.use(cors());
app.use(express.json({ limit: "20kb" }));

const PORT = process.env.PORT || 3000;
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const AI_API_KEY = process.env.AI_API_KEY;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "AI Model Importer" });
});

app.get("/api/search", async (req, res) => {
  const q = String(req.query.q || "").trim();

  if (!q || q.length > 100) {
    return res.status(400).json({
      error: "Enter a search term up to 100 characters."
    });
  }

  if (!ROBLOX_API_KEY) {
    return res.status(503).json({
      error: "Creator Store API key is not configured."
    });
  }

  try {
    const url = new URL(
      "https://apis.roblox.com/toolbox-service/v2/assets:search"
    );
    url.searchParams.set("keyword", q);
    url.searchParams.set("limit", "10");

    const response = await fetch(url, {
      headers: {
        "x-api-key": ROBLOX_API_KEY
      },
      signal: AbortSignal.timeout(12000)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Roblox search failed. Check API permissions and parameters.",
        details: data
      });
    }

    res.json(data);
  } catch {
    res.status(502).json({
      error: "Unable to reach the Roblox Creator Store."
    });
  }
});

app.get("/api/asset/:id", async (req, res) => {
  const id = req.params.id;

  if (!/^\d{1,20}$/.test(id)) {
    return res.status(400).json({ error: "Invalid asset ID." });
  }

  if (!ROBLOX_API_KEY) {
    return res.status(503).json({
      error: "Creator Store API key is not configured."
    });
  }

  try {
    const response = await fetch(
      `https://apis.roblox.com/toolbox-service/v2/assets/${id}`,
      {
        headers: { "x-api-key": ROBLOX_API_KEY },
        signal: AbortSignal.timeout(12000)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Asset details unavailable.",
        details: data
      });
    }

    res.json(data);
  } catch {
    res.status(502).json({ error: "Asset lookup failed." });
  }
});

app.post("/api/ai", async (req, res) => {
  const prompt = String(req.body?.prompt || "").trim();

  if (!prompt || prompt.length > 2000) {
    return res.status(400).json({
      error: "Enter a prompt up to 2000 characters."
    });
  }

  if (!AI_API_KEY || !process.env.AI_API_URL) {
    return res.status(503).json({
      error: "Configure AI_API_KEY and AI_API_URL on Render."
    });
  }

  try {
    const response = await fetch(process.env.AI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "your-model-name",
        messages: [
          {
            role: "system",
            content:
              "You are a Roblox development assistant. Help with " +
              "Luau, debugging, game design, and safe asset use. " +
              "Never claim code was tested if it was not."
          },
          { role: "user", content: prompt }
        ]
      }),
      signal: AbortSignal.timeout(30000)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        error: "AI provider returned an error."
      });
    }

    res.json({
      answer: data.choices?.[0]?.message?.content
        || "The AI provider returned no text."
    });
  } catch {
    res.status(502).json({ error: "AI request failed." });
  }
});

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#101318">
<title>AI Model Importer</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#101318;color:#e8edf5;
font:16px system-ui,sans-serif;padding:20px;max-width:760px;
margin-inline:auto}
h1{font-size:25px;margin-bottom:5px}
p{color:#9aa6b7}
nav{display:flex;gap:8px;margin:24px 0;flex-wrap:wrap}
button,input,textarea{font:inherit;border-radius:10px;padding:12px;
border:1px solid #303846;background:#191f28;color:#e8edf5}
button{cursor:pointer;background:#3949ab;border:0}
nav button{flex:1}
input,textarea{width:100%;margin:8px 0}
section{background:#171c24;border:1px solid #2b3340;
border-radius:15px;padding:16px;margin:12px 0}
.result{padding:12px 0;border-bottom:1px solid #303846}
a{color:#9db6ff;overflow-wrap:anywhere}
#output{white-space:pre-wrap;overflow-wrap:anywhere}
</style>
</head>
<body>
<h1>AI Model Importer</h1>
<p>Mobile developer tools · Version 1.0</p>
<nav>
<button onclick="show('search')">Model Search</button>
<button onclick="show('id')">Asset ID</button>
<button onclick="show('ai')">AI Assistant</button>
</nav>

<section id="search">
<h2>Search Creator Store</h2>
<form id="searchForm">
<input id="query" placeholder="Search models by name" required>
<button>Search</button>
</form>
</section>

<section id="id" hidden>
<h2>Look up an asset</h2>
<form id="idForm">
<input id="assetId" inputmode="numeric"
placeholder="Enter asset ID" required>
<button>Look up</button>
</form>
</section>

<section id="ai" hidden>
<h2>AI Assistant</h2>
<form id="aiForm">
<textarea id="prompt" rows="4"
placeholder="Ask about Luau or your game..." required></textarea>
<button>Ask AI</button>
</form>
</section>

<section><h2>Results</h2><div id="output">Ready.</div></section>
<script>
const output = document.getElementById("output");

function show(id) {
  for (const section of ["search","id","ai"]) {
    document.getElementById(section).hidden = section !== id;
  }
}

async function callApi(url, options) {
  output.textContent = "Loading...";
  try {
    const r = await fetch(url, options);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Request failed");
    output.replaceChildren();
    if (data.answer) {
      output.textContent = data.answer;
    } else {
      output.textContent = JSON.stringify(data, null, 2);
    }
  } catch (e) {
    output.textContent = e.message;
  }
}

document.getElementById("searchForm").onsubmit = e => {
  e.preventDefault();
  callApi("/api/search?q=" +
    encodeURIComponent(document.getElementById("query").value));
};

document.getElementById("idForm").onsubmit = e => {
  e.preventDefault();
  callApi("/api/asset/" +
    encodeURIComponent(document.getElementById("assetId").value));
};

document.getElementById("aiForm").onsubmit = e => {
  e.preventDefault();
  callApi("/api/ai", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      prompt: document.getElementById("prompt").value
    })
  });
};
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`AI Model Importer running on port ${PORT}`);
});
                        
