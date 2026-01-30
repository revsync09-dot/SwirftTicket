import secrets
from urllib.parse import urlencode

import requests
import asyncio
from flask import Flask, redirect, render_template_string, request, send_from_directory, session, url_for

from .config import load_config
from .supabase_client import build_supabase
from .data import DataRepo
from .panels import render_settings_panel, render_open_panel
from .discord_rest import DiscordRest

app = Flask(__name__, static_folder="dashboard", static_url_path="")
config = load_config()
app.secret_key = config.session_secret or "dev-secret"
supabase = build_supabase(config)
repo = DataRepo(supabase)
rest = DiscordRest(config.discord_token)


PERM_MANAGE_GUILD = 0x20
INVITE_PERMS = 0x0000000000001F40 | 0x0000000000000400  # manage channels + read/send/history + attach


def discord_get(path: str, token: str):
    return requests.get(f"https://discord.com/api/v10{path}", headers={"Authorization": f"Bearer {token}"})


def discord_get_bot(path: str):
    return requests.get(f"https://discord.com/api/v10{path}", headers={"Authorization": f"Bot {config.discord_token}"})


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/auth/login")
def auth_login():
    if not config.discord_app_id or not config.oauth_redirect_uri:
        return "OAuth not configured.", 400
    state = secrets.token_urlsafe(16)
    session["oauth_state"] = state
    params = {
        "client_id": config.discord_app_id,
        "redirect_uri": config.oauth_redirect_uri,
        "response_type": "code",
        "scope": "identify guilds",
        "state": state,
        "prompt": "consent",
    }
    return redirect(f"https://discord.com/api/oauth2/authorize?{urlencode(params)}")


@app.route("/auth/callback")
def auth_callback():
    code = request.args.get("code")
    state = request.args.get("state")
    if not code or not state or state != session.get("oauth_state"):
        return "Invalid OAuth state.", 400
    if not config.discord_client_secret:
        return "OAuth client secret missing.", 400
    data = {
        "client_id": config.discord_app_id,
        "client_secret": config.discord_client_secret,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": config.oauth_redirect_uri,
        "scope": "identify guilds",
    }
    token_res = requests.post("https://discord.com/api/oauth2/token", data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
    if token_res.status_code != 200:
        return f"Token exchange failed: {token_res.text}", 400
    token = token_res.json().get("access_token")
    user = requests.get("https://discord.com/api/users/@me", headers={"Authorization": f"Bearer {token}"}).json()
    guilds = requests.get("https://discord.com/api/users/@me/guilds", headers={"Authorization": f"Bearer {token}"}).json()
    session["access_token"] = token
    session["user"] = user
    session["guilds"] = guilds
    html = render_template_string(
        """
        <h2>SwiftTickets Login Success</h2>
        <p>Logged in as <strong>{{ user['username'] }}#{{ user['discriminator'] }}</strong></p>
        <h3>Servers</h3>
        <ul>
          {% for g in guilds %}
            <li>{{ g['name'] }}{% if (g['permissions'] | int) & 0x20 %} (Manage Server){% endif %}</li>
          {% endfor %}
        </ul>
        <a href="/">Back to dashboard</a>
        """,
        user=user,
        guilds=guilds,
    )
    return html


@app.route("/servers")
def servers():
    token = session.get("access_token")
    if not token:
        return redirect(url_for("index"))
    guilds = session.get("guilds") or discord_get("/users/@me/guilds", token).json()
    enriched = []
    for g in guilds:
        if (int(g.get("permissions", "0")) & PERM_MANAGE_GUILD) == 0:
            continue
        bot_status = "not-installed"
        bot_res = discord_get_bot(f"/guilds/{g['id']}")
        if bot_res.status_code == 200:
            bot_status = "installed"
        enriched.append({"id": g["id"], "name": g["name"], "status": bot_status})
    html = render_template_string(
        """
        <h2>Select a server</h2>
        <ul>
        {% for g in guilds %}
          <li>
            <strong>{{ g.name }}</strong> - {{ g.status }}
            {% if g.status == 'installed' %}
              <a href="{{ url_for('select_server', guild_id=g.id) }}">Open</a>
            {% else %}
              <a href="{{ url_for('invite', guild_id=g.id) }}">Invite bot</a>
            {% endif %}
          </li>
        {% endfor %}
        </ul>
        <a href="/">Back</a>
        """,
        guilds=enriched,
    )
    return html


@app.route("/select/<guild_id>")
def select_server(guild_id: str):
    session["selected_guild"] = guild_id
    return redirect(url_for("dashboard"))


@app.route("/invite/<guild_id>")
def invite(guild_id: str):
    if not config.discord_app_id:
        return "DISCORD_APP_ID missing", 400
    params = {
        "client_id": config.discord_app_id,
        "permissions": str(INVITE_PERMS),
        "scope": "bot applications.commands",
        "guild_id": guild_id,
    }
    return redirect(f"https://discord.com/api/oauth2/authorize?{urlencode(params)}")


@app.route("/dashboard")
def dashboard():
    token = session.get("access_token")
    if not token:
        return redirect(url_for("index"))
    guild_id = session.get("selected_guild")
    if not guild_id:
        return redirect(url_for("servers"))
    settings = asyncio_run(repo.get_guild_settings(guild_id))
    categories = asyncio_run(repo.list_categories(guild_id))
    html = render_template_string(
        """
        <h2>SwiftTickets Dashboard</h2>
        <p>Guild ID: {{ guild_id }}</p>

        <h3>Settings</h3>
        <form method="post" action="/save-settings">
          <input type="hidden" name="guild_id" value="{{ guild_id }}"/>
          <label>Parent Category ID <input name="ticket_parent_channel_id" value="{{ settings.get('ticket_parent_channel_id','') }}"/></label><br/>
          <label>Staff Role ID <input name="staff_role_id" value="{{ settings.get('staff_role_id','') }}"/></label><br/>
          <label>Timezone <input name="timezone" value="{{ settings.get('timezone','UTC') }}"/></label><br/>
          <label>Category Slots <input name="category_slots" value="{{ settings.get('category_slots',1) }}"/></label><br/>
          <label>Warn Threshold <input name="warn_threshold" value="{{ settings.get('warn_threshold',3) }}"/></label><br/>
          <label>Timeout Minutes <input name="warn_timeout_minutes" value="{{ settings.get('warn_timeout_minutes',10) }}"/></label><br/>
          <label><input type="checkbox" name="enable_smart_replies" {% if settings.get('enable_smart_replies', True) %}checked{% endif %}/> Smart Replies</label><br/>
          <label><input type="checkbox" name="enable_ai_suggestions" {% if settings.get('enable_ai_suggestions', True) %}checked{% endif %}/> AI Suggestions</label><br/>
          <label><input type="checkbox" name="enable_auto_priority" {% if settings.get('enable_auto_priority', True) %}checked{% endif %}/> Auto Priority</label><br/>
          <button type="submit">Save Settings</button>
        </form>

        <h3>Categories</h3>
        <ul>
        {% for c in categories %}
          <li>#{{ c.id }} {{ c.name }} - {{ c.description or '' }}</li>
        {% endfor %}
        </ul>
        <form method="post" action="/add-category">
          <input type="hidden" name="guild_id" value="{{ guild_id }}"/>
          <label>Name <input name="name"/></label>
          <label>Description <input name="description"/></label>
          <button type="submit">Add Category</button>
        </form>
        <form method="post" action="/delete-category">
          <input type="hidden" name="guild_id" value="{{ guild_id }}"/>
          <label>Category ID <input name="category_id"/></label>
          <button type="submit">Delete Category</button>
        </form>

        <h3>Post Panels</h3>
        <form method="post" action="/post-panel">
          <input type="hidden" name="guild_id" value="{{ guild_id }}"/>
          <label>Channel ID <input name="channel_id"/></label>
          <button type="submit">Post Settings Panel</button>
        </form>
        <form method="post" action="/post-panelset">
          <input type="hidden" name="guild_id" value="{{ guild_id }}"/>
          <label>Channel ID <input name="channel_id"/></label>
          <button type="submit">Post Public Panel</button>
        </form>

        <a href="/servers">Back to servers</a>
        """,
        guild_id=guild_id,
        settings=settings or {},
        categories=categories or [],
    )
    return html


@app.route("/save-settings", methods=["POST"])
def save_settings():
    guild_id = request.form.get("guild_id")
    payload = {
        "guild_id": guild_id,
        "ticket_parent_channel_id": request.form.get("ticket_parent_channel_id"),
        "staff_role_id": request.form.get("staff_role_id"),
        "timezone": request.form.get("timezone") or "UTC",
        "category_slots": int(request.form.get("category_slots") or 1),
        "warn_threshold": int(request.form.get("warn_threshold") or 3),
        "warn_timeout_minutes": int(request.form.get("warn_timeout_minutes") or 10),
        "enable_smart_replies": bool(request.form.get("enable_smart_replies")),
        "enable_ai_suggestions": bool(request.form.get("enable_ai_suggestions")),
        "enable_auto_priority": bool(request.form.get("enable_auto_priority")),
    }
    asyncio_run(repo.upsert_guild_settings(payload))
    return redirect(url_for("dashboard"))


@app.route("/add-category", methods=["POST"])
def add_category():
    guild_id = request.form.get("guild_id")
    name = request.form.get("name")
    description = request.form.get("description")
    asyncio_run(repo.create_category(guild_id, name, description))
    return redirect(url_for("dashboard"))


@app.route("/delete-category", methods=["POST"])
def delete_category():
    # simple delete via supabase REST
    guild_id = request.form.get("guild_id")
    category_id = request.form.get("category_id")
    if category_id:
        supabase.table("ticket_categories").delete().eq("id", int(category_id)).eq("guild_id", guild_id).execute()
    return redirect(url_for("dashboard"))


@app.route("/post-panel", methods=["POST"])
def post_panel():
    guild_id = request.form.get("guild_id")
    channel_id = int(request.form.get("channel_id") or 0)
    settings = asyncio_run(repo.get_guild_settings(guild_id))
    categories = asyncio_run(repo.list_categories(guild_id))
    payload = render_settings_panel(settings, categories, 1)
    asyncio_run(rest.send_channel_message(channel_id, payload))
    return redirect(url_for("dashboard"))


@app.route("/post-panelset", methods=["POST"])
def post_panelset():
    guild_id = request.form.get("guild_id")
    channel_id = int(request.form.get("channel_id") or 0)
    categories = asyncio_run(repo.list_categories(guild_id))
    payload = render_open_panel(categories)
    asyncio_run(rest.send_channel_message(channel_id, payload))
    return redirect(url_for("dashboard"))


def asyncio_run(coro):
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        return asyncio.run_coroutine_threadsafe(coro, loop).result()
    return asyncio.run(coro)


def main():
    app.run(host="0.0.0.0", port=8080, debug=False)


if __name__ == "__main__":
    main()
