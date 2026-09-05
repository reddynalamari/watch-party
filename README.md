# Watch Party — Version 8

Drop-in upgrade for your existing project. Same dependencies as v7
(`@supabase/supabase-js`, `react-player`, `react-draggable`) plus two new
small ones for real icons: `@hugeicons/react` and `@hugeicons/core-free-icons`.

## How to install this update

1. Unzip this and copy the **entire `src/` folder** into your existing
   `watch-party` project, overwriting what's there.
2. Install the two new icon packages:
   ```
   npm install @hugeicons/react @hugeicons/core-free-icons
   ```
3. Confirm `vite.config.js` still has the Tailwind plugin from before:
   ```js
   import { defineConfig } from 'vite'
   import react from '@vitejs/plugin-react'
   import tailwindcss from '@tailwindcss/vite'

   export default defineConfig({
     plugins: [react(), tailwindcss()],
   })
   ```
4. Make sure your `.env` file has your Supabase values (see `.env.example`
   in this zip):
   ```
   VITE_SUPABASE_URL=https://yourproject.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```
5. Run it:
   ```
   npm run dev
   ```

## What's fixed in V8

**Real icons everywhere** — every emoji used as UI chrome (invite, chat,
participants, cam light, resync, theme, fullscreen, queue controls, host
crown, close buttons, etc.) is now a proper icon from
[Hugeicons' free stroke-rounded set](https://hugeicons.com/icons/stroke-rounded),
rendered via `@hugeicons/react`. The quick reaction picker (👍 ❤️ 😂 😮 👏 🔥)
still uses emoji on purpose — those are the actual reaction content people
send, the same way Discord or Zoom reactions work, not UI decoration. Say
the word if you'd rather those be icons too.

**Video call widget can now actually be resized** — this was the real bug
behind "I can only see my own face." The floating call window was hard-coded
to 320×288px with no resize handle, so MiroTalk's grid didn't have room to
show more than one tile. It now opens much bigger by default (480×400) and
has a drag handle in the corner to resize it to whatever fits your group,
plus a **pop out / dock** toggle so you can float it as a resizable window
even outside fullscreen — not just while fullscreen.

**Everyone joins the video call under their real name** — the call iframe
was joining MiroTalk anonymously with no name parameter, so every friend
showed up as an unlabeled "Guest" tile disconnected from their in-app
identity. It now passes each person's display name into the join link.

**Invite button actually gives feedback** — it was silently calling
`navigator.clipboard.writeText()` with no fallback and no confirmation, so a
single missing permission (very common on `localhost` or non-HTTPS) made it
look completely broken. It now: uses the native share sheet on mobile first,
falls back to the Clipboard API, falls back again to a manual copy method
for restricted browsers — and always shows a clear "Copied!" or "Couldn't
copy" state on the button itself.

**Connection problems are now visible, not silent** — if participants,
chat, or sync stop updating for everyone in the room, it's almost always
the realtime connection dropping, which used to show as nothing more than a
tiny gray dot. There's now a clear banner explaining the likely causes
(missing/incorrect Supabase keys, or Brave Shields blocking the websocket
on `localhost`) instead of failing silently.

## Everything from V7 is still here

Light/dark theme toggle, the Cam Light fill-light panel, chat, participants
list with host badges and handoff, automatic host failover, quick
reactions, invite links via `?room=CODE`, oEmbed title/thumbnail lookup,
resync button, drag-to-reorder queue, keyboard shortcuts (`Space` /
`F`), and the responsive stacked layout on mobile — see the V7 changelog
below if you want the full original description of each.

## Known limitations (unchanged from before)

- **Brave Shields**: on `localhost` during development, Brave's Shields can
  block YouTube's IFrame API and Supabase's websocket. Click the lion icon
  → turn Shields off for the site. This is much less of an issue once
  deployed to a real HTTPS domain.
- **MiroTalk P2P** (`p2p.mirotalk.com`) is a free public server with no
  login — great for casual use with friends, but it's shared infrastructure,
  so treat it as best-effort rather than enterprise-grade reliability.
- **Google Drive playback** works for direct file links but Drive throttles
  bandwidth on files over roughly 100MB.
- **noembed.com** is a free, keyless service; if it's ever down or doesn't
  recognize a particular link, the app just falls back to showing the raw
  URL — nothing breaks.
- **Supabase Realtime Authorization**: if participants still don't show up
  for each other after checking your `.env` keys and Brave Shields, open
  your Supabase project's **Realtime settings** and confirm public
  broadcast/presence isn't restricted to "private channels only." If your
  project enforces that, you'd need to either turn it off or add an RLS
  policy on `realtime.messages` — that's a project setting, not something
  this app's code can fix on its own.

## Deploying

Same as before: push to GitHub, connect the repo in Cloudflare Pages (or
Vercel). One important thing people often miss —

**Add your environment variables in the hosting dashboard too.** Your local
`.env` file is not committed to git (make sure it's in `.gitignore`), so the
deployed build won't have your Supabase keys unless you add them in
Cloudflare Pages under **Settings → Environment variables**:
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```
Add them for both Production and Preview, then redeploy.
