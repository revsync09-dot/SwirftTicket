import asyncio
import io
from datetime import datetime, timedelta

import discord
from discord import app_commands

from .analysis import analyze_priority, find_aggressive_words, suggestions_from_text
from .charts import build_daily_series, render_chart
from .components import COMPONENTS_V2_FLAG
from .config import load_config
from .data import DataRepo
from .discord_rest import DiscordRest
from .notice import build_notice
from .panels import render_open_panel, render_settings_panel
from .render import render_ticket_message
from .supabase_client import build_supabase
from .transcript import build_transcript
from .welcome import render_welcome


config = load_config()
rest = DiscordRest(config.discord_token)
supabase = build_supabase(config)
repo = DataRepo(supabase)


intents = discord.Intents.default()
intents.guilds = True
intents.guild_messages = True
intents.message_content = True

client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)


def is_owner(interaction: discord.Interaction):
    return interaction.guild and interaction.guild.owner_id == interaction.user.id


def has_permission(interaction: discord.Interaction, perm: discord.Permissions):
    if interaction.user.guild_permissions:
        return interaction.user.guild_permissions >= perm
    return False


def is_admin_or_owner(interaction: discord.Interaction):
    if is_owner(interaction):
        return True
    return interaction.user.guild_permissions.manage_guild or interaction.user.guild_permissions.administrator


def has_staff_role(interaction: discord.Interaction, staff_role_id: str):
    if is_owner(interaction):
        return True
    if not staff_role_id or not interaction.guild:
        return False
    member = interaction.guild.get_member(interaction.user.id)
    if not member:
        return False
    return any(str(r.id) == str(staff_role_id) for r in member.roles)


def with_defaults(settings: dict | None):
    base = settings or {}
    return {
        **base,
        "warn_threshold": base.get("warn_threshold", 3),
        "warn_timeout_minutes": base.get("warn_timeout_minutes", 10),
        "enable_smart_replies": base.get("enable_smart_replies", True),
        "enable_ai_suggestions": base.get("enable_ai_suggestions", True),
        "enable_auto_priority": base.get("enable_auto_priority", True),
    }


async def send_interaction_message(interaction: discord.Interaction, payload: dict, ephemeral: bool = False):
    flags = payload.get("flags", 0) | COMPONENTS_V2_FLAG | (1 << 6 if ephemeral else 0)
    payload["flags"] = flags
    await rest.post_interaction_response(
        interaction.id,
        interaction.token,
        {"type": 4, "data": payload},
    )


async def update_interaction_message(interaction: discord.Interaction, payload: dict):
    payload["flags"] = payload.get("flags", 0) | COMPONENTS_V2_FLAG
    await rest.post_interaction_response(
        interaction.id,
        interaction.token,
        {"type": 7, "data": payload},
    )


async def show_modal(interaction: discord.Interaction, title: str, custom_id: str, inputs: list[dict]):
    await rest.post_interaction_response(
        interaction.id,
        interaction.token,
        {"type": 9, "data": {"title": title, "custom_id": custom_id, "components": [{"type": 1, "components": [i]} for i in inputs]}},
    )


async def create_ticket_surface(guild: discord.Guild, parent_id: int, staff_role_id: str, user_id: int, username: str):
    parent = guild.get_channel(parent_id)
    if not parent or not isinstance(parent, discord.CategoryChannel):
        raise RuntimeError("Ticket parent must be a category channel.")
    staff_role = guild.get_role(int(staff_role_id)) if staff_role_id else None
    member = guild.get_member(user_id)
    if not member:
        try:
            member = await guild.fetch_member(user_id)
        except Exception:
            member = None
    if not staff_role:
        raise RuntimeError("Staff role not found. Run /ticket setup again.")
    if not member:
        raise RuntimeError("User not found in guild.")
    overwrites = {
        guild.default_role: discord.PermissionOverwrite(view_channel=False),
        staff_role: discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True, attach_files=True),
        member: discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True, attach_files=True),
    }
    channel = await guild.create_text_channel(
        name=f"ticket-{int(datetime.utcnow().timestamp())}",
        category=parent,
        overwrites=overwrites,
        topic=f"SwiftTicket for {username}",
        reason="Ticket created",
    )
    return channel


async def build_context(ticket: dict, settings: dict):
    mod = await repo.mod_summary(ticket["guild_id"], ticket["creator_id"])
    history = await repo.user_ticket_history(ticket["guild_id"], ticket["creator_id"])
    links = await repo.list_links(ticket["id"])
    return {
        "moderation": {
            "warnings": mod["warnings"],
            "mutes": mod["mutes"],
            "bans": mod["bans"],
            "previous": history["total"],
            "last_support": history["last"],
        },
        "links": [l["linked_ticket_id"] for l in links],
        "suggestions": suggestions_from_text(ticket["query_text"]) if settings.get("enable_ai_suggestions") else [],
    }


async def create_ticket(interaction: discord.Interaction, settings: dict, reason: str, category: dict | None):
    await send_interaction_message(interaction, build_notice("info", "Creating", "Opening your ticket..."), ephemeral=True)
    if not settings.get("ticket_parent_channel_id") or not settings.get("staff_role_id"):
        await send_interaction_message(interaction, build_notice("error", "Not configured", "Ticket parent or staff role is missing. Run /ticket setup."), ephemeral=True)
        return
    try:
        channel = await create_ticket_surface(
            interaction.guild,
            int(settings["ticket_parent_channel_id"]),
            settings["staff_role_id"],
            interaction.user.id,
            str(interaction.user),
        )
    except Exception as exc:
        await send_interaction_message(interaction, build_notice("error", "Setup error", str(exc)), ephemeral=True)
        return
    normalized = with_defaults(settings)
    recent = await repo.count_recent_tickets(interaction.guild_id, interaction.user.id, (datetime.utcnow() - timedelta(hours=24)).isoformat())
    analysis = analyze_priority(reason, recent, 0) if normalized["enable_auto_priority"] else {"priority": "NORMAL", "reason": None}
    ticket = await repo.create_ticket({
        "guild_id": interaction.guild_id,
        "channel_id": str(channel.id),
        "creator_id": str(interaction.user.id),
        "query_text": reason,
        "status": "OPEN",
        "priority": analysis["priority"],
        "suspicion_reason": analysis["reason"],
        "category_id": category["id"] if category else None,
        "category_name": category["name"] if category else None,
        "category_description": category.get("description") if category else None,
        "created_at": datetime.utcnow().isoformat(),
    })
    context = await build_context(ticket, normalized)
    rendered = render_ticket_message(ticket, f"<@{interaction.user.id}>", settings.get("timezone") or config.timezone, context["moderation"], context["links"], context["suggestions"])
    msg = await rest.send_channel_message(channel.id, rendered)
    await repo.update_ticket(ticket["id"], {"message_id": str(msg["id"])})
    await rest.edit_original_response(int(config.discord_app_id), interaction.token, build_notice("success", "Ticket created", f"Ticket #{ticket['id']} created in <#{channel.id}>."))


@client.event
async def on_ready():
    print(f"SwiftTicket ready as {client.user}")
    if config.guild_id:
        guild = discord.Object(id=int(config.guild_id))
        await tree.sync(guild=guild)
    else:
        await tree.sync()


@client.event
async def on_guild_join(guild: discord.Guild):
    payload = render_welcome(guild.name)
    channel = guild.system_channel or next((c for c in guild.text_channels if c.permissions_for(guild.me).send_messages), None)
    if channel:
        await rest.send_channel_message(channel.id, payload)


ticket_group = app_commands.Group(name="ticket", description="Ticket actions")


@ticket_group.command(name="create", description="Create a new ticket")
@app_commands.describe(reason="What do you need help with?")
async def ticket_create(interaction: discord.Interaction, reason: str):
    settings = await repo.get_guild_settings(str(interaction.guild_id))
    if not settings:
        await send_interaction_message(interaction, build_notice("error", "Not configured", "Run /ticket setup first."), ephemeral=True)
        return
    await create_ticket(interaction, settings, reason, None)


@ticket_group.command(name="setup", description="Configure ticket system")
@app_commands.describe(parent="Text channel under a category", staff_role="Staff role", timezone="Timezone (IANA)")
async def ticket_setup(interaction: discord.Interaction, parent: discord.TextChannel, staff_role: discord.Role, timezone: str = "UTC"):
    if not is_admin_or_owner(interaction):
        await send_interaction_message(interaction, build_notice("error", "Not allowed", "Admin only."), ephemeral=True)
        return
    if not parent.category_id:
        await send_interaction_message(interaction, build_notice("error", "Missing category", "Channel must be inside a category."), ephemeral=True)
        return
    settings = await repo.get_guild_settings(str(interaction.guild_id))
    normalized = with_defaults(settings)
    saved = await repo.upsert_guild_settings({
        "guild_id": str(interaction.guild_id),
        "ticket_parent_channel_id": str(parent.category_id),
        "staff_role_id": str(staff_role.id),
        "timezone": timezone,
        "category_slots": normalized["category_slots"] if "category_slots" in normalized else 1,
        "warn_threshold": normalized["warn_threshold"],
        "warn_timeout_minutes": normalized["warn_timeout_minutes"],
        "enable_smart_replies": normalized["enable_smart_replies"],
        "enable_ai_suggestions": normalized["enable_ai_suggestions"],
        "enable_auto_priority": normalized["enable_auto_priority"],
    })
    await send_interaction_message(interaction, build_notice("success", "Setup complete", f"Configured tickets. Category: <#{parent.category_id}>"), ephemeral=True)


@ticket_group.command(name="panel", description="Post the ticket settings panel")
async def ticket_panel(interaction: discord.Interaction):
    if not is_admin_or_owner(interaction):
        await send_interaction_message(interaction, build_notice("error", "Not allowed", "Admin only."), ephemeral=True)
        return
    settings = await repo.get_guild_settings(str(interaction.guild_id))
    categories = await repo.list_categories(str(interaction.guild_id))
    payload = render_settings_panel(settings, categories, 1)
    await send_interaction_message(interaction, payload, ephemeral=False)


@ticket_group.command(name="panelset", description="Post the public ticket panel")
@app_commands.describe(channel="Channel to post the panel")
async def ticket_panelset(interaction: discord.Interaction, channel: discord.TextChannel | None = None):
    if not is_admin_or_owner(interaction):
        await send_interaction_message(interaction, build_notice("error", "Not allowed", "Admin only."), ephemeral=True)
        return
    settings = await repo.get_guild_settings(str(interaction.guild_id))
    if not settings:
        await send_interaction_message(interaction, build_notice("error", "Not configured", "Run /ticket setup first."), ephemeral=True)
        return
    categories = await repo.list_categories(str(interaction.guild_id))
    payload = render_open_panel(categories)
    target = channel or interaction.channel
    await rest.send_channel_message(target.id, payload)
    await send_interaction_message(interaction, build_notice("success", "Panel sent", f"Ticket panel sent to <#{target.id}>."), ephemeral=True)


@tree.command(name="info", description="Show ticket analytics for a user")
@app_commands.describe(user="Target user")
async def info(interaction: discord.Interaction, user: discord.User | None = None):
    target = user or interaction.user
    if not config.discord_app_id or not str(config.discord_app_id).isdigit():
        await send_interaction_message(interaction, build_notice("error", "Missing App ID", "Set DISCORD_APP_ID in the environment."), ephemeral=True)
        return
    settings = await repo.get_guild_settings(str(interaction.guild_id))
    if not settings:
        await send_interaction_message(interaction, build_notice("error", "Not configured", "Run /ticket setup first."), ephemeral=True)
        return
    await send_interaction_message(interaction, build_notice("info", "Loading", "Generating charts..."), ephemeral=True)
    since = (datetime.utcnow() - timedelta(days=90)).isoformat()
    timeline = await repo.rolling_tickets_by_creator(str(interaction.guild_id), str(target.id), since)
    points90 = build_daily_series(90, timeline, settings.get("timezone") or config.timezone)
    chart7 = render_chart(points90[-7:], "activity-7d.png")
    chart30 = render_chart(points90[-30:], "activity-30d.png")
    chart90 = render_chart(points90, "activity-90d.png")
    stats = await repo.user_ticket_stats(str(interaction.guild_id), str(target.id))
    history = await repo.user_ticket_history(str(interaction.guild_id), str(target.id))
    summary = (
        f"## {target.name}'s Ticket Summary\n"
        f"- **Total tickets:** {history['total']}\n"
        f"- **Created:** {stats['created']}\n"
        f"- **Claimed:** {stats['claimed']}\n"
        f"- **Closed:** {stats['closed']}\n"
        f"- **Last activity:** {history['last'] or '-'}"
    )
    from .components import text_display, separator, container
    gallery = {
        "type": 12,
        "items": [
            {"media": {"url": f"attachment://{chart7['filename']}"}},
            {"media": {"url": f"attachment://{chart30['filename']}"}},
            {"media": {"url": f"attachment://{chart90['filename']}"}},
        ],
    }
    comps = [text_display(summary), separator(), gallery]
    payload = {"flags": COMPONENTS_V2_FLAG, "components": [container(comps, 0x22C55E)]}
    files = [
        (chart7["filename"], chart7["buffer"].getvalue()),
        (chart30["filename"], chart30["buffer"].getvalue()),
        (chart90["filename"], chart90["buffer"].getvalue()),
    ]
    await rest.edit_original_response_with_files(int(config.discord_app_id), interaction.token, payload, files)


mod_group = app_commands.Group(name="mod", description="Moderation utilities")


@mod_group.command(name="log", description="Log a moderation action")
@app_commands.describe(user="Target user", action="Action type", reason="Reason")
@app_commands.choices(action=[
    app_commands.Choice(name="Warn", value="WARN"),
    app_commands.Choice(name="Mute", value="MUTE"),
    app_commands.Choice(name="Ban", value="BAN"),
])
async def mod_log(interaction: discord.Interaction, user: discord.User, action: app_commands.Choice[str], reason: str | None = None):
    if not is_admin_or_owner(interaction):
        await send_interaction_message(interaction, build_notice("error", "Not allowed", "Manage Server required."), ephemeral=True)
        return
    await repo.create_mod_action({
        "guild_id": str(interaction.guild_id),
        "user_id": str(user.id),
        "action_type": action.value,
        "reason": reason,
        "created_by": str(interaction.user.id),
    })
    settings = with_defaults(await repo.get_guild_settings(str(interaction.guild_id)))
    if action.value == "WARN":
        summary = await repo.mod_summary(str(interaction.guild_id), str(user.id))
        if summary["warnings"] >= settings["warn_threshold"]:
            member = interaction.guild.get_member(user.id)
            if member:
                await member.timeout(timedelta(minutes=settings["warn_timeout_minutes"]), reason="Auto-timeout threshold reached")
    await send_interaction_message(interaction, build_notice("success", "Action logged", f"{action.value} logged for {user.mention}."), ephemeral=True)


@mod_group.command(name="config", description="Configure auto-timeout for warnings")
@app_commands.describe(warn_threshold="Warnings before timeout", timeout_minutes="Timeout duration in minutes")
async def mod_config(interaction: discord.Interaction, warn_threshold: int, timeout_minutes: int):
    if not is_admin_or_owner(interaction):
        await send_interaction_message(interaction, build_notice("error", "Not allowed", "Manage Server required."), ephemeral=True)
        return
    settings = await repo.get_guild_settings(str(interaction.guild_id))
    if not settings:
        await send_interaction_message(interaction, build_notice("error", "Not configured", "Run /ticket setup first."), ephemeral=True)
        return
    await repo.upsert_guild_settings({
        **settings,
        "warn_threshold": warn_threshold,
        "warn_timeout_minutes": timeout_minutes,
    })
    await send_interaction_message(interaction, build_notice("success", "Moderation configured", f"Auto-timeout after {warn_threshold} warnings for {timeout_minutes} minutes."), ephemeral=True)


@client.event
async def on_interaction(interaction: discord.Interaction):
    if not interaction.type:
        return
    if interaction.type == discord.InteractionType.component:
        data = interaction.data or {}
        custom_id = data.get("custom_id", "")
        parts = custom_id.split(":")
        if not parts:
            return
        scope = parts[0]
        action = parts[1] if len(parts) > 1 else ""
        id_raw = parts[2] if len(parts) > 2 else ""

        if scope == "ticket" and action == "category" and id_raw == "add":
            if not is_admin_or_owner(interaction):
                await send_interaction_message(interaction, build_notice("error", "Not allowed", "Admin only."), ephemeral=True)
                return
            await show_modal(
                interaction,
                "Add Ticket Category",
                f"ticket:category:create:{interaction.message.id}",
                [
                    {"type": 4, "custom_id": "category_name", "label": "Category name", "style": 1, "max_length": 60},
                    {"type": 4, "custom_id": "category_description", "label": "Category description", "style": 2, "max_length": 200},
                ],
            )
            return

        if scope == "ticket" and action == "panel" and id_raw == "page":
            page = int(parts[3]) if len(parts) > 3 else 1
            settings = await repo.get_guild_settings(str(interaction.guild_id))
            categories = await repo.list_categories(str(interaction.guild_id))
            payload = render_settings_panel(settings, categories, page)
            await update_interaction_message(interaction, payload)
            return

        if scope == "ticket" and action == "slots":
            if not is_admin_or_owner(interaction):
                await send_interaction_message(interaction, build_notice("error", "Not allowed", "Admin only."), ephemeral=True)
                return
            value = int(data.get("values", [0])[0])
            if value < 1 or value > 35:
                await send_interaction_message(interaction, build_notice("error", "Invalid value", "Choose between 1 and 35."), ephemeral=True)
                return
            current = await repo.get_guild_settings(str(interaction.guild_id))
            if not current:
                await send_interaction_message(interaction, build_notice("error", "Not configured", "Run /ticket setup first."), ephemeral=True)
                return
            await repo.upsert_guild_settings({**current, "category_slots": value})
            categories = await repo.list_categories(str(interaction.guild_id))
            payload = render_settings_panel({**current, "category_slots": value}, categories, 1)
            await update_interaction_message(interaction, payload)
            return

        if scope == "ticket" and action == "settings" and id_raw in ("warn", "timeout"):
            if not is_admin_or_owner(interaction):
                await send_interaction_message(interaction, build_notice("error", "Not allowed", "Admin only."), ephemeral=True)
                return
            if id_raw == "warn":
                await show_modal(interaction, "Warn Threshold", f"ticket:settings:warn:{interaction.message.id}", [
                    {"type": 4, "custom_id": "warn_threshold", "label": "Warnings before timeout", "style": 1, "max_length": 3},
                ])
            else:
                await show_modal(interaction, "Timeout Duration", f"ticket:settings:timeout:{interaction.message.id}", [
                    {"type": 4, "custom_id": "warn_timeout_minutes", "label": "Timeout minutes", "style": 1, "max_length": 4},
                ])
            return

        if scope == "ticket" and action == "toggle":
            if not is_admin_or_owner(interaction):
                await send_interaction_message(interaction, build_notice("error", "Not allowed", "Admin only."), ephemeral=True)
                return
            settings = await repo.get_guild_settings(str(interaction.guild_id))
            if not settings:
                await send_interaction_message(interaction, build_notice("error", "Not configured", "Run /ticket setup first."), ephemeral=True)
                return
            normalized = with_defaults(settings)
            if id_raw == "smart":
                normalized["enable_smart_replies"] = not normalized["enable_smart_replies"]
            if id_raw == "ai":
                normalized["enable_ai_suggestions"] = not normalized["enable_ai_suggestions"]
            if id_raw == "priority":
                normalized["enable_auto_priority"] = not normalized["enable_auto_priority"]
            await repo.upsert_guild_settings({**settings, **normalized})
            categories = await repo.list_categories(str(interaction.guild_id))
            payload = render_settings_panel({**settings, **normalized}, categories, 2)
            await update_interaction_message(interaction, payload)
            return

        if scope == "ticket" and action == "open":
            category_id = int(data.get("values", [None])[0])
            categories = await repo.list_categories(str(interaction.guild_id))
            category = next((c for c in categories if c["id"] == category_id), None)
            if not category:
                await send_interaction_message(interaction, build_notice("error", "Invalid category", "Category not found."), ephemeral=True)
                return
            await show_modal(
                interaction,
                f"Open Ticket - {category['name']}"[:45],
                f"ticket:open:create:{category['id']}",
                [{"type": 4, "custom_id": "ticket_reason", "label": "Describe your issue", "style": 2, "max_length": 500}],
            )
            return

        if scope == "ticket" and action in ("claim", "close", "transcript", "reopen", "link"):
            ticket = await repo.get_ticket_by_message(str(interaction.message.id))
            if not ticket:
                await send_interaction_message(interaction, build_notice("error", "Ticket missing", "This ticket could not be found."), ephemeral=True)
                return
            settings = await repo.get_guild_settings(str(interaction.guild_id))
            if not settings:
                await send_interaction_message(interaction, build_notice("error", "Not configured", "Run /ticket setup first."), ephemeral=True)
                return
            staff_role_id = settings["staff_role_id"]
            if action == "claim":
                if not has_staff_role(interaction, staff_role_id):
                    await send_interaction_message(interaction, build_notice("error", "Not allowed", "Only staff can claim tickets."), ephemeral=True)
                    return
                if ticket["status"] != "OPEN":
                    await send_interaction_message(interaction, build_notice("error", "Invalid state", "Ticket is not open."), ephemeral=True)
                    return
                ticket = await repo.update_ticket(ticket["id"], {"status": "CLAIMED", "claimed_by": str(interaction.user.id), "claimed_at": datetime.utcnow().isoformat()})
            elif action == "close":
                if ticket["status"] != "CLAIMED":
                    await send_interaction_message(interaction, build_notice("error", "Invalid state", "Ticket is not claimed."), ephemeral=True)
                    return
                if str(ticket.get("claimed_by")) != str(interaction.user.id) and not has_staff_role(interaction, staff_role_id):
                    await send_interaction_message(interaction, build_notice("error", "Not allowed", "Only the claimer or staff can close."), ephemeral=True)
                    return
                ticket = await repo.update_ticket(ticket["id"], {"status": "CLOSED", "closed_by": str(interaction.user.id), "closed_at": datetime.utcnow().isoformat()})
                channel = client.get_channel(int(ticket["channel_id"]))
                if channel:
                    await channel.set_permissions(discord.Object(id=int(ticket["creator_id"])), send_messages=False)
            elif action == "reopen":
                if ticket["status"] != "CLOSED":
                    await send_interaction_message(interaction, build_notice("error", "Invalid state", "Ticket is not closed."), ephemeral=True)
                    return
                allowed = str(ticket["creator_id"]) == str(interaction.user.id) or has_staff_role(interaction, staff_role_id)
                if not allowed:
                    await send_interaction_message(interaction, build_notice("error", "Not allowed", "Only creator or staff can reopen."), ephemeral=True)
                    return
                ticket = await repo.update_ticket(ticket["id"], {"status": "OPEN", "reopened_by": str(interaction.user.id), "reopened_at": datetime.utcnow().isoformat()})
                channel = client.get_channel(int(ticket["channel_id"]))
                if channel:
                    await channel.set_permissions(discord.Object(id=int(ticket["creator_id"])), send_messages=True)
            elif action == "transcript":
                channel = client.get_channel(int(ticket["channel_id"]))
                if channel:
                    transcript = await build_transcript(channel)
                    await channel.send(content=f"Transcript for ticket #{ticket['id']}", file=discord.File(transcript["buffer"], filename=transcript["filename"]))
                await send_interaction_message(interaction, build_notice("success", "Transcript ready", "Transcript generated."), ephemeral=True)
                return
            elif action == "link":
                await show_modal(
                    interaction,
                    "Link Ticket",
                    f"ticket:link:create:{interaction.message.id}:{ticket['id']}",
                    [{"type": 4, "custom_id": "linked_ticket_id", "label": "Ticket ID to link", "style": 1, "max_length": 12}],
                )
                return

            normalized = with_defaults(settings)
            context = await build_context(ticket, normalized)
            rendered = render_ticket_message(ticket, f"<@{ticket['creator_id']}>", settings.get("timezone") or config.timezone, context["moderation"], context["links"], context["suggestions"])
            await rest.edit_message(int(ticket["channel_id"]), int(ticket["message_id"]), rendered)
            await send_interaction_message(interaction, build_notice("success", "Updated", "Ticket updated."), ephemeral=True)
            return

    if interaction.type == discord.InteractionType.modal_submit:
        data = interaction.data or {}
        custom_id = data.get("custom_id", "")
        parts = custom_id.split(":")
        scope = parts[0]
        kind = parts[1] if len(parts) > 1 else ""
        action = parts[2] if len(parts) > 2 else ""
        message_id = parts[3] if len(parts) > 3 else ""
        values = {c["custom_id"]: c["value"] for row in data.get("components", []) for c in row.get("components", [])}

        if scope == "ticket" and kind == "category" and action == "create":
            name = values.get("category_name", "").strip()
            description = values.get("category_description", "").strip() or None
            await repo.create_category(str(interaction.guild_id), name, description)
            settings = await repo.get_guild_settings(str(interaction.guild_id))
            categories = await repo.list_categories(str(interaction.guild_id))
            payload = render_settings_panel(settings, categories, 1)
            await update_interaction_message(interaction, payload)
            return

        if scope == "ticket" and kind == "settings" and action in ("warn", "timeout"):
            settings = await repo.get_guild_settings(str(interaction.guild_id))
            if not settings:
                await send_interaction_message(interaction, build_notice("error", "Not configured", "Run /ticket setup first."), ephemeral=True)
                return
            if action == "warn":
                value = int(values.get("warn_threshold", "0"))
                await repo.upsert_guild_settings({**settings, "warn_threshold": value})
                await send_interaction_message(interaction, build_notice("success", "Updated", f"Warn threshold set to {value}."), ephemeral=True)
                return
            if action == "timeout":
                value = int(values.get("warn_timeout_minutes", "0"))
                await repo.upsert_guild_settings({**settings, "warn_timeout_minutes": value})
                await send_interaction_message(interaction, build_notice("success", "Updated", f"Timeout set to {value} minutes."), ephemeral=True)
                return

        if scope == "ticket" and kind == "open" and action == "create":
            reason = values.get("ticket_reason", "").strip()
            settings = await repo.get_guild_settings(str(interaction.guild_id))
            categories = await repo.list_categories(str(interaction.guild_id))
            category = next((c for c in categories if str(c["id"]) == str(message_id)), None)
            await create_ticket(interaction, settings, reason, category)
            return

        if scope == "ticket" and kind == "link" and action == "create":
            linked = values.get("linked_ticket_id", "").strip()
            if not linked.isdigit():
                await send_interaction_message(interaction, build_notice("error", "Invalid ID", "Please provide a numeric ticket ID."), ephemeral=True)
                return
            linked_id = int(linked)
            source_id = int(parts[4]) if len(parts) > 4 else None
            await repo.add_link(str(interaction.guild_id), source_id, linked_id, str(interaction.user.id))
            await repo.add_link(str(interaction.guild_id), linked_id, source_id, str(interaction.user.id))
            settings = await repo.get_guild_settings(str(interaction.guild_id))
            ticket = await repo.get_ticket_by_message(str(interaction.message.id))
            if ticket and settings:
                context = await build_context(ticket, with_defaults(settings))
                rendered = render_ticket_message(ticket, f"<@{ticket['creator_id']}>", settings.get("timezone") or config.timezone, context["moderation"], context["links"], context["suggestions"])
                await rest.edit_message(int(ticket["channel_id"]), int(ticket["message_id"]), rendered)
            await send_interaction_message(interaction, build_notice("success", "Linked", f"Linked ticket #{linked_id}."), ephemeral=True)
            return


@client.event
async def on_message(message: discord.Message):
    if message.author.bot or not message.guild:
        return
    ticket = await repo.get_ticket_by_channel(str(message.channel.id))
    if not ticket:
        return
    settings = with_defaults(await repo.get_guild_settings(str(message.guild.id)))
    now_iso = datetime.utcnow().isoformat()
    aggressive = find_aggressive_words(message.content or "")
    is_staff = any(str(r.id) == str(settings.get("staff_role_id")) for r in message.author.roles) if hasattr(message.author, "roles") else False
    if aggressive and not is_staff:
        await repo.create_mod_action({
            "guild_id": str(message.guild.id),
            "user_id": str(message.author.id),
            "action_type": "WARN",
            "reason": f"Flagged keywords: {', '.join(aggressive[:4])}",
            "created_by": str(client.user.id),
        })
        summary = await repo.mod_summary(str(message.guild.id), str(message.author.id))
        if summary["warnings"] >= settings["warn_threshold"]:
            member = message.guild.get_member(message.author.id)
            if member:
                await member.timeout(timedelta(minutes=settings["warn_timeout_minutes"]), reason="Auto-timeout threshold reached")
        mention = f"<@&{settings['staff_role_id']}>" if settings.get("staff_role_id") else None
        alert = build_notice("error", "Safety Alert", f"Message flagged: {', '.join(aggressive[:4])}")
        payload = {"content": mention, **alert} if mention else alert
        await rest.send_channel_message(message.channel.id, payload)
    if message.author.id == int(ticket["creator_id"]):
        await repo.update_ticket(ticket["id"], {"last_user_message_at": now_iso})
        if settings["enable_smart_replies"]:
            reply = suggestions_from_text(message.content or "")
            if reply:
                await rest.send_channel_message(message.channel.id, build_notice("info", "Smart Reply", "\n".join(reply)))
        return

    if is_staff:
        update = {"last_staff_message_at": now_iso}
        if not ticket.get("first_staff_response_at"):
            update["first_staff_response_at"] = now_iso
            try:
                created = datetime.fromisoformat(ticket["created_at"].replace("Z", "+00:00"))
                update["first_response_ms"] = int((datetime.utcnow() - created).total_seconds() * 1000)
            except Exception:
                pass
        if ticket.get("last_user_message_at"):
            try:
                last_user = datetime.fromisoformat(ticket["last_user_message_at"].replace("Z", "+00:00"))
                response_ms = int((datetime.utcnow() - last_user).total_seconds() * 1000)
                count = (ticket.get("response_count") or 0) + 1
                prev_avg = ticket.get("avg_response_ms") or 0
                update["avg_response_ms"] = int((prev_avg * (count - 1) + response_ms) / count)
                update["response_count"] = count
            except Exception:
                pass
        await repo.update_ticket(ticket["id"], update)


tree.add_command(ticket_group)
tree.add_command(mod_group)


def main():
    if not config.discord_token:
        raise SystemExit("DISCORD_TOKEN missing")
    client.run(config.discord_token)


if __name__ == "__main__":
    main()
