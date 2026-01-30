import { createCanvas } from '@napi-rs/canvas';
export function renderActivityChart(points, opts) {
    const width = 900;
    const height = 420;
    const padding = 64;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, width, height);
    const max = Math.max(...points.map((p) => p.value), 1);
    const stepX = (width - padding * 2) / Math.max(points.length - 1, 1);
    // grid
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = padding + ((height - padding * 2) / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    // labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '14px "Segoe UI", sans-serif';
    points.forEach((p, i) => {
        if (i % Math.ceil(points.length / 8) !== 0)
            return;
        const x = padding + stepX * i;
        ctx.fillText(p.label, x - 18, height - padding + 28);
    });
    // curve
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 3;
    ctx.beginPath();
    points.forEach((p, i) => {
        const x = padding + stepX * i;
        const y = height - padding - ((height - padding * 2) * p.value) / max;
        if (i === 0)
            ctx.moveTo(x, y);
        else {
            const prevX = padding + stepX * (i - 1);
            const prevY = height - padding - ((height - padding * 2) * points[i - 1].value) / max;
            const cx = (prevX + x) / 2;
            ctx.quadraticCurveTo(cx, prevY, x, y);
        }
    });
    ctx.stroke();
    // dots
    ctx.fillStyle = '#fbbf24';
    points.forEach((p, i) => {
        const x = padding + stepX * i;
        const y = height - padding - ((height - padding * 2) * p.value) / max;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    });
    if (opts?.title) {
        ctx.fillStyle = '#e5e7eb';
        ctx.font = '18px "Segoe UI Semibold", sans-serif';
        ctx.fillText(opts.title, padding, padding - 24);
    }
    return {
        filename: 'activity.png',
        buffer: canvas.toBuffer('image/png'),
    };
}
