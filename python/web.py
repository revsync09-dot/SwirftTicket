import secrets
from pathlib import Path
from urllib.parse import urlencode

import requests
import asyncio
from flask import Flask, redirect, request, send_from_directory, session, url_for, jsonify

from .config import load_config
from .supabase_client import build_supabase
from .data import DataRepo
from .panels import render_settings_panel, render_open_panel
from .discord_rest import DiscordRest

BASE_DIR = Path(__file__).resolve().parent
DASHBOARD_DIR = (BASE_DIR.parent / "dashboard").resolve()

app = Flask(__name__, static_folder=str(DASHBOARD_DIR), static_url_path="")
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


def require_login():
    token = session.get("access_token")
    if not token:
        return None, None, None
    # Avoid storing large guild lists in the session cookie
    guilds = discord_get("/users/@me/guilds", token).json()
    return token, session.get("user"), guilds


def can_manage_guild(guilds: list, guild_id: str) -> bool:
    for g in guilds:
        if str(g.get("id")) == str(guild_id):
            return (int(g.get("permissions", 0)) & PERM_MANAGE_GUILD) != 0
    return False


def serve_dashboard(name: str):
    file_path = DASHBOARD_DIR / name
    if file_path.exists():
        return send_from_directory(DASHBOARD_DIR, name)
    return (f"Dashboard file missing: {name}", 404)


@app.route("/")
def index():
    return serve_dashboard("login.html")


@app.route("/login")
def login_page():
    return serve_dashboard("login.html")


@app.route("/servers")
def servers_page():
    return serve_dashboard("servers.html")


@app.route("/setup")
def setup_page():
    return serve_dashboard("setup.html")


@app.route("/dashboard")
def overview_page():
    return serve_dashboard("index.html")


@app.route("/assets/<path:filename>")
def assets(filename: str):
    return send_from_directory(DASHBOARD_DIR, filename)


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
    session["access_token"] = token
    # Store only minimal user info to keep cookie small
    user = requests.get("https://discord.com/api/users/@me", headers={"Authorization": f"Bearer {token}"}).json()
    session["user"] = {"id": user.get("id"), "username": user.get("username")}
    return redirect("/servers")


@app.route("/select/<guild_id>")
def select_server(guild_id: str):
    session["selected_guild"] = guild_id
    return redirect("/setup")


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


@app.route("/api/dashboard-data")
def api_dashboard_data():
    token, user, guilds = require_login()
    if not token:
        return jsonify({"error": "not_authenticated"}), 401
    selected = request.args.get("guild_id") or session.get("selected_guild")
    session["selected_guild"] = selected

    bot_tag = "SwiftTickets"
    bot_res = discord_get_bot("/users/@me")
    if bot_res.status_code == 200:
        b = bot_res.json()
        bot_tag = f"{b.get('username', 'SwiftTickets')}"

    installed = []
    for g in guilds or []:
        status = "not-installed"
        bot_res = discord_get_bot(f"/guilds/{g['id']}")
        if bot_res.status_code == 200:
            status = "installed"
        installed.append({
            "id": g.get("id"),
            "name": g.get("name"),
            "status": status,
        })

    settings = asyncio_run(repo.get_guild_settings(selected)) if selected else None
    categories = asyncio_run(repo.list_categories(selected)) if selected else []

    return jsonify({
        "botTag": bot_tag,
        "latencyMs": 0,
        "uptime": "online",
        "guilds": installed,
        "selectedGuild": selected,
        "settings": settings or {},
        "categories": categories or [],
        "inviteUrl": f"/invite/{selected}" if selected else None,
    })


@app.route("/api/settings", methods=["GET", "POST"])
def api_settings():
    token, user, guilds = require_login()
    if not token:
        return jsonify({"error": "not_authenticated"}), 401
    guild_id = request.args.get("guild_id") or request.json.get("guild_id") if request.is_json else request.form.get("guild_id")
    if not guild_id or not can_manage_guild(guilds, guild_id):
        return jsonify({"error": "not_authorized"}), 403

    if request.method == "GET":
        settings = asyncio_run(repo.get_guild_settings(guild_id))
        return jsonify(settings or {})

    data = request.json or {}
    payload = {
        "guild_id": guild_id,
        "ticket_parent_channel_id": data.get("ticket_parent_channel_id"),
        "staff_role_id": data.get("staff_role_id"),
        "timezone": data.get("timezone") or "UTC",
        "category_slots": int(data.get("category_slots") or 1),
        "warn_threshold": int(data.get("warn_threshold") or 3),
        "warn_timeout_minutes": int(data.get("warn_timeout_minutes") or 10),
        "enable_smart_replies": bool(data.get("enable_smart_replies")),
        "enable_ai_suggestions": bool(data.get("enable_ai_suggestions")),
        "enable_auto_priority": bool(data.get("enable_auto_priority")),
    }
    saved = asyncio_run(repo.upsert_guild_settings(payload))
    return jsonify(saved or payload)


@app.route("/api/categories", methods=["GET", "POST", "DELETE"])
def api_categories():
    token, user, guilds = require_login()
    if not token:
        return jsonify({"error": "not_authenticated"}), 401
    guild_id = request.args.get("guild_id") or (request.json or {}).get("guild_id")
    if not guild_id or not can_manage_guild(guilds, guild_id):
        return jsonify({"error": "not_authorized"}), 403

    if request.method == "GET":
        categories = asyncio_run(repo.list_categories(guild_id))
        return jsonify(categories or [])

    if request.method == "POST":
        data = request.json or {}
        name = data.get("name")
        description = data.get("description")
        created = asyncio_run(repo.create_category(guild_id, name, description))
        return jsonify(created or {})

    if request.method == "DELETE":
        data = request.json or {}
        category_id = data.get("category_id")
        if category_id:
            supabase.table("ticket_categories").delete().eq("id", int(category_id)).eq("guild_id", guild_id).execute()
        return jsonify({"ok": True})


@app.route("/api/post-panel", methods=["POST"])
def api_post_panel():
    token, user, guilds = require_login()
    if not token:
        return jsonify({"error": "not_authenticated"}), 401
    data = request.json or {}
    guild_id = data.get("guild_id")
    channel_id = int(data.get("channel_id") or 0)
    if not guild_id or not can_manage_guild(guilds, guild_id):
        return jsonify({"error": "not_authorized"}), 403
    settings = asyncio_run(repo.get_guild_settings(guild_id))
    categories = asyncio_run(repo.list_categories(guild_id))
    payload = render_settings_panel(settings, categories, 1)
    asyncio_run(rest.send_channel_message(channel_id, payload))
    return jsonify({"ok": True})


@app.route("/api/post-panelset", methods=["POST"])
def api_post_panelset():
    token, user, guilds = require_login()
    if not token:
        return jsonify({"error": "not_authenticated"}), 401
    data = request.json or {}
    guild_id = data.get("guild_id")
    channel_id = int(data.get("channel_id") or 0)
    if not guild_id or not can_manage_guild(guilds, guild_id):
        return jsonify({"error": "not_authorized"}), 403
    categories = asyncio_run(repo.list_categories(guild_id))
    payload = render_open_panel(categories)
    asyncio_run(rest.send_channel_message(channel_id, payload))
    return jsonify({"ok": True})


@app.route("/health")
def health():
    return jsonify({"ok": True, "dashboard_dir": str(DASHBOARD_DIR), "dashboard_exists": DASHBOARD_DIR.exists()})


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
