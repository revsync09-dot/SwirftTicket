from .components import media_gallery, separator

BANNER_URL = "https://cdn.discordapp.com/emojis/1466595992945299528.png?size=160"


def banner_components() -> list[dict]:
    return [separator(), media_gallery(BANNER_URL)]
