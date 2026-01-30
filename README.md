# SwiftTicket

# SwiftTicket
- One of the best Ticketsbot of Discord Community- Be aware do not use this as your own BOT!!!
- If you use it you will get in toruble cuz of using!

## Setup
- Copy `.env.example` to `.env` and fill in: `DISCORD_TOKEN`, `DISCORD_APP_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (service role), optional `TIMEZONE`.
- Apply `supabase/schema.sql` to your Supabase/Postgres project.
- Install deps: `pip install -r requirements.txt`
- Run the bot: `python -m python.bot`
- Run the dashboard (Python): `python -m python.web` (opens on http://localhost:8080)
## OAuth
- Set `DISCORD_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, `SESSION_SECRET` in `.env`.
- Local redirect example: `http://localhost:8080/auth/callback`
- Fly.io redirect example: `https://<your-app>.fly.dev/auth/callback`

## Commands
- `/ticket_setup parent:<text-channel> staff_role:<role> [timezone]` - admin-only per guild; pick a #text channel that is inside the category where ticket channels should be created.
- `/ticket_create reason:<text>` - creates a private ticket channel, posts the Components v2 UI, and persists the record (requires prior setup in that guild).
- `/ticket_panel` - posts the category/settings panel.
- `/ticket_panelset [channel]` - posts the public category select panel.
- `/info [user]` - shows ticket counts plus a 90-day activity curve rendered server-side (per guild).

## Ticket UI Notes
- Uses real Components v2 (flag 32768) and keeps **one** message per ticket; edits re-render from Supabase state.
- Status colors: Open=blue, Claimed=yellow, Closed=gray.
- Buttons: Claim (OPEN), Close + Transcript (CLAIMED), Transcript (CLOSED).
- Claim/close permissions: staff role can claim; close allowed for claimer or staff.

## Transcripts
- Transcript button fetches channel history, renders an HTML transcript, and uploads it back to the ticket channel.

## Configuration tips
- Tickets are always created as private text channels inside the chosen category (no threads). The setup command uses the selected #text channel to detect its category.
- The bot requires the following intents and permissions: `Guilds`, `GuildMembers`, `GuildMessages`, `MessageContent`, and manage channels/messages in the chosen parent.
