from .components import action_row, button, container, separator, text_display


def render_welcome(guild_name: str):
    header = text_display("## Welcome to SwiftTicket")
    body = text_display(
        "Thanks for inviting SwiftTicket. This bot provides modern ticketing, analytics, and moderation tools."
    )
    list_block = text_display(
        "- Use **/ticket setup** to configure parent category and staff role\n"
        "- Use **/ticket panel** to configure categories\n"
        "- Use **/ticket panelset** to post the public ticket panel\n"
        "- Use **/info** to view user ticket analytics\n"
        "- Use **/mod log** to record warnings/mutes/bans"
    )
    support = action_row([button(url="https://discord.gg/FRMPgGTM", style=5, emoji={"name": "💬"})])
    comps = [header, separator(), body, separator(), list_block, separator(), support]
    return {"flags": 1 << 15, "components": [container(comps)]}
