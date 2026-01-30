import io
from datetime import datetime, timedelta

import matplotlib.pyplot as plt


def build_daily_series(days: int, records: list[dict], timezone: str):
    today = datetime.utcnow().date()
    counts = {}
    for i in range(days):
        d = today - timedelta(days=(days - 1 - i))
        counts[d.isoformat()] = 0
    for row in records:
        key = row["created_at"][:10]
        if key in counts:
            counts[key] += 1
    series = []
    for key, value in counts.items():
        label = datetime.fromisoformat(key).strftime("%b %d")
        series.append({"label": label, "value": value})
    return series


def render_chart(points: list[dict], filename: str):
    labels = [p["label"] for p in points]
    values = [p["value"] for p in points]

    plt.style.use("dark_background")
    fig, ax = plt.subplots(figsize=(6, 3))
    ax.plot(labels, values, color="#7C5CFF", linewidth=2, marker="o", markersize=4)
    ax.fill_between(range(len(values)), values, color="#7C5CFF", alpha=0.15)
    ax.grid(color="#2a2a2a", linestyle="--", linewidth=0.6, alpha=0.6)
    ax.set_facecolor("#1b1d22")
    fig.patch.set_facecolor("#1b1d22")
    ax.tick_params(axis="x", rotation=45, labelsize=7)
    ax.tick_params(axis="y", labelsize=7)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    buf = io.BytesIO()
    fig.tight_layout()
    fig.savefig(buf, format="png", dpi=140)
    plt.close(fig)
    buf.seek(0)
    return {"buffer": buf, "filename": filename}
