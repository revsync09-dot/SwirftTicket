import io
import html
from datetime import datetime


async def build_transcript(channel):
    lines = []
    async for msg in channel.history(limit=None, oldest_first=True):
        author = html.escape(f"{msg.author} ({msg.author.id})")
        content = html.escape(msg.content or "")
        created = msg.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")
        lines.append(f"<p><strong>{author}</strong> <em>{created}</em><br>{content}</p>")

    html_body = "<html><head><meta charset='utf-8'><style>body{font-family:Arial;background:#111;color:#ddd}p{margin:8px 0}</style></head><body>"
    html_body += "\n".join(lines)
    html_body += "</body></html>"
    buf = io.BytesIO(html_body.encode("utf-8"))
    return {"buffer": buf, "filename": f"ticket-transcript-{int(datetime.utcnow().timestamp())}.html"}
