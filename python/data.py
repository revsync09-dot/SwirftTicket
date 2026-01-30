import asyncio
from typing import Any


class DataRepo:
    def __init__(self, supabase):
        self.sb = supabase

    async def _run(self, fn):
        return await asyncio.to_thread(fn)

    async def get_guild_settings(self, guild_id: str):
        def _():
            res = self.sb.table("guild_settings").select("*").eq("guild_id", guild_id).execute()
            return res.data[0] if res.data else None
        return await self._run(_)

    async def upsert_guild_settings(self, payload: dict):
        def _():
            res = self.sb.table("guild_settings").upsert(payload).execute()
            return res.data[0] if res.data else None
        return await self._run(_)

    async def list_categories(self, guild_id: str):
        def _():
            res = self.sb.table("ticket_categories").select("*").eq("guild_id", guild_id).order("id").execute()
            return res.data or []
        return await self._run(_)

    async def create_category(self, guild_id: str, name: str, description: str | None):
        def _():
            res = self.sb.table("ticket_categories").insert({
                "guild_id": guild_id,
                "name": name,
                "description": description,
            }).execute()
            return res.data[0] if res.data else None
        return await self._run(_)

    async def create_ticket(self, payload: dict):
        def _():
            res = self.sb.table("tickets").insert(payload).execute()
            return res.data[0] if res.data else None
        return await self._run(_)

    async def update_ticket(self, ticket_id: int, payload: dict):
        def _():
            res = self.sb.table("tickets").update(payload).eq("id", ticket_id).execute()
            return res.data[0] if res.data else None
        return await self._run(_)

    async def update_ticket_by_message(self, message_id: str, payload: dict):
        def _():
            res = self.sb.table("tickets").update(payload).eq("message_id", message_id).execute()
            return res.data[0] if res.data else None
        return await self._run(_)

    async def get_ticket_by_message(self, message_id: str):
        def _():
            res = self.sb.table("tickets").select("*").eq("message_id", message_id).execute()
            return res.data[0] if res.data else None
        return await self._run(_)

    async def get_ticket_by_channel(self, channel_id: str):
        def _():
            res = self.sb.table("tickets").select("*").eq("channel_id", channel_id).execute()
            return res.data[0] if res.data else None
        return await self._run(_)

    async def list_links(self, ticket_id: int):
        def _():
            res = self.sb.table("ticket_links").select("*").eq("ticket_id", ticket_id).execute()
            return res.data or []
        return await self._run(_)

    async def add_link(self, guild_id: str, ticket_id: int, linked_ticket_id: int, created_by: str):
        def _():
            res = self.sb.table("ticket_links").insert({
                "guild_id": guild_id,
                "ticket_id": ticket_id,
                "linked_ticket_id": linked_ticket_id,
                "created_by": created_by,
            }).execute()
            return res.data[0] if res.data else None
        return await self._run(_)

    async def mod_summary(self, guild_id: str, user_id: str):
        def _():
            warn = self.sb.table("mod_actions").select("id", count="exact").eq("guild_id", guild_id).eq("user_id", user_id).eq("action_type", "WARN").execute()
            mute = self.sb.table("mod_actions").select("id", count="exact").eq("guild_id", guild_id).eq("user_id", user_id).eq("action_type", "MUTE").execute()
            ban = self.sb.table("mod_actions").select("id", count="exact").eq("guild_id", guild_id).eq("user_id", user_id).eq("action_type", "BAN").execute()
            return {
                "warnings": warn.count or 0,
                "mutes": mute.count or 0,
                "bans": ban.count or 0,
            }
        return await self._run(_)

    async def create_mod_action(self, payload: dict):
        def _():
            res = self.sb.table("mod_actions").insert(payload).execute()
            return res.data[0] if res.data else None
        return await self._run(_)

    async def user_ticket_stats(self, guild_id: str, user_id: str):
        def _():
            created = self.sb.table("tickets").select("id", count="exact").eq("guild_id", guild_id).eq("creator_id", user_id).execute()
            claimed = self.sb.table("tickets").select("id", count="exact").eq("guild_id", guild_id).eq("claimed_by", user_id).execute()
            closed = self.sb.table("tickets").select("id", count="exact").eq("guild_id", guild_id).eq("closed_by", user_id).execute()
            return {
                "created": created.count or 0,
                "claimed": claimed.count or 0,
                "closed": closed.count or 0,
            }
        return await self._run(_)

    async def user_ticket_history(self, guild_id: str, user_id: str):
        def _():
            res = self.sb.table("tickets").select("created_at, closed_at").eq("guild_id", guild_id).eq("creator_id", user_id).order("created_at", desc=True).execute()
            rows = res.data or []
            last = rows[0]["closed_at"] if rows else None
            if not last and rows:
                last = rows[0]["created_at"]
            return {"total": len(rows), "last": last}
        return await self._run(_)

    async def rolling_tickets_by_creator(self, guild_id: str, user_id: str, since_iso: str):
        def _():
            res = self.sb.table("tickets").select("created_at").eq("guild_id", guild_id).eq("creator_id", user_id).gte("created_at", since_iso).order("created_at").execute()
            return res.data or []
        return await self._run(_)

    async def count_recent_tickets(self, guild_id: str, user_id: str, since_iso: str):
        def _():
            res = self.sb.table("tickets").select("id", count="exact").eq("guild_id", guild_id).eq("creator_id", user_id).gte("created_at", since_iso).execute()
            return res.count or 0
        return await self._run(_)
