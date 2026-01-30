AGGRESSIVE_WORDS = [
    "idiot",
    "stupid",
    "hate",
    "kill",
    "fuck",
    "scam",
    "fraud",
    "chargeback",
    "refund",
    "paypal",
    "nitro",
    "steam",
    "crypto",
    "bastard",
    "cuxxl",
]


def analyze_priority(text: str, recent_tickets: int, repeated_reports: int):
    lower = text.lower()
    hits = [w for w in AGGRESSIVE_WORDS if w in lower]
    reasons = []
    if recent_tickets >= 3:
        reasons.append("High ticket volume in 24h")
    if repeated_reports >= 2:
        reasons.append("Repeated reports on same target")
    if hits:
        reasons.append(f"Flagged keywords: {', '.join(hits[:4])}")
    return {"priority": "HIGH" if reasons else "NORMAL", "reason": " - ".join(reasons) if reasons else None}


def find_aggressive_words(text: str):
    lower = text.lower()
    return [w for w in AGGRESSIVE_WORDS if w in lower]


SUGGESTIONS = [
    ("banned", "Provide ban-appeal steps and request context (username, reason, appeal notes)."),
    ("refund", "Ask for order ID, payment method, and transaction date."),
    ("chargeback", "Request evidence and explain chargeback policy."),
    ("scam", "Ask for screenshots, user IDs, and transaction links."),
]


def suggestions_from_text(text: str):
    lower = text.lower()
    return [s for k, s in SUGGESTIONS if k in lower]
