import { createCanvas } from '@napi-rs/canvas';

export interface ChartPoint {
  label: string;
  value: number;
}

export function renderActivityChart(points: ChartPoint[], opts?: { filename?: string }) {
  const width = 1100;
  const height = 560;
  const padding = 72;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const radius = 28;
  const bg = '#141519';
  const panel = '#1c1e22';
  const grid = '#2a2d33';
  const text = '#b6bcc7';
  const line = '#6c79ff';
  const dot = '#8aa2ff';

  // background with rounded corners
  ctx.fillStyle = bg;
  roundedRect(ctx, 0, 0, width, height, radius);
  ctx.fill();

  // inner panel
  ctx.fillStyle = panel;
  roundedRect(ctx, 20, 20, width - 40, height - 40, radius - 6);
  ctx.fill();

  const plotLeft = padding;
  const plotRight = width - padding;
  const plotTop = 90;
  const plotBottom = height - 90;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const max = Math.max(...points.map((p) => p.value), 1);
  const stepX = plotWidth / Math.max(points.length - 1, 1);

  // grid
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 8]);
  for (let i = 0; i <= 5; i++) {
    const y = plotTop + (plotHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // x labels
  ctx.fillStyle = text;
  ctx.font = '14px "Segoe UI", sans-serif';
  const labelEvery = Math.max(1, Math.ceil(points.length / 10));
  points.forEach((p, i) => {
    if (i % labelEvery !== 0) return;
    const x = plotLeft + stepX * i;
    ctx.save();
    ctx.translate(x - 14, plotBottom + 22);
    ctx.rotate(-Math.PI / 6);
    ctx.fillText(p.label, 0, 0);
    ctx.restore();
  });

  // line
  ctx.strokeStyle = line;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = plotLeft + stepX * i;
    const y = plotBottom - (plotHeight * p.value) / max;
    if (i === 0) ctx.moveTo(x, y);
    else {
      const prevX = plotLeft + stepX * (i - 1);
      const prevY = plotBottom - (plotHeight * points[i - 1].value) / max;
      const cx = (prevX + x) / 2;
      ctx.quadraticCurveTo(cx, prevY, x, y);
    }
  });
  ctx.stroke();

  // dots and values
  points.forEach((p, i) => {
    const x = plotLeft + stepX * i;
    const y = plotBottom - (plotHeight * p.value) / max;
    ctx.fillStyle = dot;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e5e7eb';
    ctx.font = '12px "Segoe UI Semibold", sans-serif';
    ctx.fillText(String(p.value), x - 6, y - 10);
  });

  return {
    filename: opts?.filename ?? 'activity.png',
    buffer: canvas.toBuffer('image/png'),
  };
}

function roundedRect(
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
