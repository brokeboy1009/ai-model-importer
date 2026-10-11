# AI Model Importer

An offline-first web workspace for Roblox/Luau development. It includes:
- Dark, mobile-friendly interface
- Local code editor with autosave
- Multiple AI chat histories stored locally
- Roblox Creator Store model search with cached results
- Export/import workspace backup JSON
- Export Luau source as `.lua`
- Optional Groq AI via a server-side API key
- Service worker for offline app-shell loading

## Important limitations

- This web app does **not** directly insert assets into Roblox Studio Lite. Use Roblox's supported asset workflow and only use assets you have permission to use.
- Roblox Creator Store search needs internet and the public endpoint may change. If Roblox changes access requirements or response fields, update `/api/search` in `server.js`.
- Groq replies need internet and a valid `GROQ_API_KEY`.
- Offline mode can display saved chats and cached model results, but cannot create a new remote AI response or search Roblox.
- Browser storage can be cleared by the browser. Export a backup regularly.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Deploy on Render

1. Push these files to your GitHub repository.
2. In Render, create a **Web Service** connected to the repository.
3. Runtime: Node.
4. Build command: `npm install`
5. Start command: `npm start`
6. Add `GROQ_API_KEY` under the service's Environment settings.
7. Deploy.

Do not put your real Groq API key in frontend files or commit it to GitHub.

## Updating

When a file changes, replace the whole file with the new version. After deployment, open the app online once so the service worker can cache the app shell. On some browsers, a newly deployed service worker may take a refresh or two to update.
