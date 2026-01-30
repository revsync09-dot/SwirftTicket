import aiohttp


class DiscordRest:
    def __init__(self, token: str):
        self.token = token
        self.base = "https://discord.com/api/v10"

    def _headers(self):
        return {"Authorization": f"Bot {self.token}"}

    async def post_interaction_response(self, interaction_id: int, token: str, payload: dict):
        url = f"{self.base}/interactions/{interaction_id}/{token}/callback"
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=self._headers()) as resp:
                if resp.status >= 400:
                    text = await resp.text()
                    raise RuntimeError(f"Discord interaction response failed: {resp.status} {text}")

    async def edit_original_response(self, app_id: int, token: str, payload: dict):
        url = f"{self.base}/webhooks/{app_id}/{token}/messages/@original"
        async with aiohttp.ClientSession() as session:
            async with session.patch(url, json=payload, headers=self._headers()) as resp:
                if resp.status >= 400:
                    text = await resp.text()
                    raise RuntimeError(f"Discord edit original failed: {resp.status} {text}")

    async def edit_original_response_with_files(self, app_id: int, token: str, payload: dict, files: list[tuple[str, bytes]]):
        url = f"{self.base}/webhooks/{app_id}/{token}/messages/@original"
        form = aiohttp.FormData()
        import json
        form.add_field("payload_json", json.dumps(payload), content_type="application/json")
        for idx, (name, data) in enumerate(files):
            form.add_field(f"files[{idx}]", data, filename=name, content_type="application/octet-stream")
        async with aiohttp.ClientSession() as session:
            async with session.patch(url, data=form, headers={"Authorization": f"Bot {self.token}"}) as resp:
                if resp.status >= 400:
                    text = await resp.text()
                    raise RuntimeError(f"Discord edit original with files failed: {resp.status} {text}")

    async def send_channel_message(self, channel_id: int, payload: dict):
        url = f"{self.base}/channels/{channel_id}/messages"
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=self._headers()) as resp:
                if resp.status >= 400:
                    text = await resp.text()
                    raise RuntimeError(f"Discord send message failed: {resp.status} {text}")
                return await resp.json()

    async def edit_message(self, channel_id: int, message_id: int, payload: dict):
        url = f"{self.base}/channels/{channel_id}/messages/{message_id}"
        async with aiohttp.ClientSession() as session:
            async with session.patch(url, json=payload, headers=self._headers()) as resp:
                if resp.status >= 400:
                    text = await resp.text()
                    raise RuntimeError(f"Discord edit message failed: {resp.status} {text}")
                return await resp.json()
