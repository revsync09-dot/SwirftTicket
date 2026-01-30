from .components import container, separator, text_display


ACCENT = {"error": 0xEF4444, "info": 0x38BDF8, "success": 0x22C55E}


def build_notice(kind: str, title: str, body: str):
    comps = [
        text_display(f"### {title}"),
        separator(),
        text_display(body),
    ]
    return {"flags": 1 << 15, "components": [container(comps, ACCENT.get(kind, 0x7C5CFF))]}
