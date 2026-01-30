COMPONENTS_V2_FLAG = 1 << 15


def text_display(content: str) -> dict:
    return {"type": 10, "content": content}


def separator() -> dict:
    return {"type": 14}


def button(custom_id: str | None = None, style: int = 2, emoji: dict | None = None, url: str | None = None, label: str | None = None) -> dict:
    payload = {"type": 2, "style": style}
    if custom_id:
        payload["custom_id"] = custom_id
    if url:
        payload["url"] = url
    if emoji:
        payload["emoji"] = emoji
    if label:
        payload["label"] = label
    return payload


def action_row(components: list[dict]) -> dict:
    return {"type": 1, "components": components}


def select_menu(custom_id: str, options: list[dict], placeholder: str) -> dict:
    return {
        "type": 3,
        "custom_id": custom_id,
        "options": options,
        "placeholder": placeholder,
        "min_values": 1,
        "max_values": 1,
    }


def container(components: list[dict], accent_color: int = 0x7C5CFF) -> dict:
    return {"type": 17, "accent_color": accent_color, "components": components}


def media_gallery(url: str) -> dict:
    return {"type": 12, "items": [{"media": {"url": url}}]}
