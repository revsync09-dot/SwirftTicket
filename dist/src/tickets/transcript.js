import { nanoid } from 'nanoid';
function escapeHtml(input) {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
async function fetchAllMessages(channel) {
    let before;
    const messages = [];
    while (true) {
        const batch = await channel.messages.fetch({ limit: 100, before });
        const list = Array.from(batch.values());
        messages.push(...list);
        if (list.length < 100)
            break;
        before = list[list.length - 1].id;
    }
    return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}
export async function buildTranscript(channel, ticket) {
    const messages = await fetchAllMessages(channel);
    const rows = messages
        .map((msg) => {
        const author = `${msg.author.username}#${msg.author.discriminator}`;
        const timestamp = new Date(msg.createdTimestamp).toISOString();
        const content = escapeHtml(msg.cleanContent || '[no content]');
        return `<div class="message"><div class="meta"><span class="author">${author}</span><span class="time">${timestamp}</span></div><div class="body">${content}</div></div>`;
    })
        .join('\n');
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Ticket #${ticket.id} Transcript</title>
    <style>
      body { background: #0d1117; color: #e6edf3; font-family: 'Segoe UI', sans-serif; padding: 24px; }
      .message { padding: 8px 0; border-bottom: 1px solid #1f2937; }
      .meta { color: #94a3b8; font-size: 12px; display: flex; gap: 12px; }
      .author { color: #bfdbfe; font-weight: 600; }
      .body { margin-top: 4px; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h2>Ticket #${ticket.id}</h2>
    <p>Channel: ${escapeHtml(channel.id)} • Created: ${escapeHtml(ticket.created_at)}</p>
    ${rows}
  </body>
</html>`;
    return {
        filename: `ticket-${ticket.id}-transcript-${nanoid(6)}.html`,
        buffer: Buffer.from(html, 'utf-8'),
    };
}
