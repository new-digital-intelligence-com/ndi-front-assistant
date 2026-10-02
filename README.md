# NDI Assistant

NDI's (New Digital Intelligence) own multi-channel front-office assistant: one AI agent, **Clara** (ElevenLabs
Agents), answers on the website (chat, voice, video avatar), the phone, email, Telegram, Instagram and Facebook
Messenger, remembers customers across all of them, and hands over to NDI staff with **Aida**, a copilot that
drafts answers during live calls. A live example of NDI's Multi-Channel Front Office Assistant.

- How it works, in plain words: the `/docs` page of the running app (`src/app/docs/page.tsx`)
- Setting up every channel: [CHANNEL_SETUP.md](CHANNEL_SETUP.md)
- Project state and how to continue: [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md)

## Run it locally

```bash
npm install
# .env.local: see CHANNEL_SETUP.md, section 13
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

Next.js 16, React 19, Tailwind 4, Supabase, LiveKit, Anam. Hosted on Railway.
