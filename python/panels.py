from .components import action_row, container, select_menu, separator, text_display


def render_settings_panel(settings: dict | None, categories: list[dict], page: int = 1):
    selected = (settings or {}).get("category_slots") or 1
    warn_threshold = (settings or {}).get("warn_threshold") or 3
    warn_timeout = (settings or {}).get("warn_timeout_minutes") or 10
    smart = (settings or {}).get("enable_smart_replies", True)
    ai = (settings or {}).get("enable_ai_suggestions", True)
    auto_priority = (settings or {}).get("enable_auto_priority", True)

    header = text_display("## Ticket Category Slots" if page == 1 else "## Advanced Ticket Setup")
    body = text_display(
        "Choose how many ticket categories should be available in this server.\n"
        "Select between **1 and 35** categories, then press **Add Category** to create names."
        if page == 1
        else "Configure advanced moderation and automation features.\nUse the dashboard for full controls."
    )

    if categories:
        list_text = "\n".join(
            [f"- **{i+1}.** {c['name']}" + (f" - {c['description']}" if c.get("description") else "") for i, c in enumerate(categories)]
        )
    else:
        list_text = "- No categories yet"
    list_block = text_display(f"### Current categories ({len(categories)}/{selected})\n{list_text}")

    advanced = text_display(
        "### Enabled Features\n"
        f"- Moderation history in ticket UI\n"
        f"- Auto priority: {'ON' if auto_priority else 'OFF'}\n"
        f"- Response tracking + staff ranking\n"
        f"- Ticket reopen system\n"
        f"- Ticket linking\n"
        f"- Smart replies: {'ON' if smart else 'OFF'}\n"
        f"- AI suggestions: {'ON' if ai else 'OFF'}\n"
        f"- Warn threshold: {warn_threshold} -> {warn_timeout}m timeout"
    )

    row1 = action_row([select_menu("ticket:slots:1", _range_options(1, 25, selected), "Select 1-25 categories")])
    row2 = action_row([select_menu("ticket:slots:2", _range_options(26, 35, selected), "Select 26-35 categories")])

    add_btn = action_row([{"type": 2, "custom_id": "ticket:category:add", "style": 2, "label": "Add"}])
    settings_row = action_row(
        [
            {"type": 2, "custom_id": "ticket:settings:warn", "style": 2, "label": "Warn"},
            {"type": 2, "custom_id": "ticket:settings:timeout", "style": 2, "label": "Timeout"},
            {"type": 2, "custom_id": "ticket:toggle:smart", "style": 2, "label": "Smart"},
            {"type": 2, "custom_id": "ticket:toggle:ai", "style": 2, "label": "AI"},
            {"type": 2, "custom_id": "ticket:toggle:priority", "style": 2, "label": "Priority"},
        ]
    )
    nav = action_row(
        [
            {"type": 2, "custom_id": "ticket:panel:page:1", "style": 2, "disabled": page == 1, "label": "Prev"},
            {"type": 2, "custom_id": "ticket:panel:page:2", "style": 2, "disabled": page == 2, "label": "Next"},
        ]
    )

    if page == 1:
        comps = [header, separator(), body, separator(), list_block, separator(), row1, row2, separator(), add_btn, separator(), nav]
    else:
        comps = [header, separator(), body, separator(), advanced, separator(), settings_row, separator(), nav]

    return {"flags": 1 << 15, "components": [container(comps)]}


def _range_options(start: int, end: int, selected: int):
    opts = []
    for i in range(start, end + 1):
        opts.append({"label": f"{i} categories", "value": str(i), "default": i == selected})
    return opts


def render_open_panel(categories: list[dict]):
    header = text_display("## Open a SwiftTicket")
    body = text_display("Select a category below to open a new ticket.")
    comps = [header, separator(), body, separator()]
    if not categories:
        comps.append(text_display("No categories are configured yet. Please contact an admin."))
    else:
        first = categories[:25]
        second = categories[25:35]
        comps.append(action_row([select_menu("ticket:open:1", _cat_options(first), "Choose a category (1-25)")]))
        if second:
            comps.append(separator())
            comps.append(action_row([select_menu("ticket:open:2", _cat_options(second), "Choose a category (26-35)")]))
    return {"flags": 1 << 15, "components": [container(comps)]}


def _cat_options(categories: list[dict]):
    opts = []
    for c in categories:
        opt = {"label": c["name"][:100], "value": str(c["id"])}
        if c.get("description"):
            opt["description"] = c["description"][:50]
        opts.append(opt)
    return opts
