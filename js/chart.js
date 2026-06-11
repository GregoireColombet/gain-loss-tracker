export function drawGainLossChart(canvasElement, timelineData) {
  const context = canvasElement.getContext('2d');
  const width = canvasElement.width;
  const height = canvasElement.height;
  context.clearRect(0, 0, width, height);

  if (!timelineData.length) {
    drawEmptyChart(context, width, height, 'No realized gain/loss history in this range.');
    return;
  }

  const values = timelineData.map(item => item.value);
  const minimumValue = Math.min(...values, 0);
  const maximumValue = Math.max(...values, 0);
  const range = maximumValue - minimumValue || 1;
  const padding = { top: 34, right: 30, bottom: 54, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  drawGrid(context, width, height, padding, minimumValue, maximumValue, range, chartHeight);
  drawCurve(context, timelineData, values, padding, chartWidth, chartHeight, minimumValue, range);
  drawXAxisLabels(context, timelineData, padding, chartWidth, height);
  drawValueLabels(context, padding, minimumValue, maximumValue, height);
}

function drawGrid(context, width, height, padding, minimumValue, maximumValue, range, chartHeight) {
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(148, 163, 184, 0.26)';

  for (let index = 0; index <= 4; index += 1) {
    const y = padding.top + (index / 4) * chartHeight;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
  }

  const zeroY = padding.top + chartHeight - ((0 - minimumValue) / range) * chartHeight;
  context.lineWidth = 1.5;
  context.strokeStyle = maximumValue === 0 && minimumValue === 0 ? 'rgba(148, 163, 184, 0.3)' : 'rgba(15, 23, 42, 0.28)';
  context.beginPath();
  context.moveTo(padding.left, zeroY);
  context.lineTo(width - padding.right, zeroY);
  context.stroke();
}

function drawCurve(context, timelineData, values, padding, chartWidth, chartHeight, minimumValue, range) {
  context.strokeStyle = values[values.length - 1] >= 0 ? '#10b981' : '#ef4444';
  context.lineWidth = 3;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.beginPath();

  timelineData.forEach((item, index) => {
    const x = padding.left + (index / Math.max(timelineData.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - ((item.value - minimumValue) / range) * chartHeight;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });

  context.stroke();

  context.fillStyle = context.strokeStyle;
  timelineData.forEach((item, index) => {
    const shouldDrawPoint = timelineData.length <= 28 || index === timelineData.length - 1 || index % Math.ceil(timelineData.length / 12) === 0;
    if (!shouldDrawPoint) return;
    const x = padding.left + (index / Math.max(timelineData.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - ((item.value - minimumValue) / range) * chartHeight;
    context.beginPath();
    context.arc(x, y, 3, 0, Math.PI * 2);
    context.fill();
  });
}

function drawXAxisLabels(context, timelineData, padding, chartWidth, height) {
  context.fillStyle = '#64748b';
  context.font = '12px Inter, Arial, sans-serif';
  context.textAlign = 'center';

  const labelStep = Math.max(1, Math.ceil(timelineData.length / 8));
  timelineData.forEach((item, index) => {
    const shouldDrawLabel = index === 0 || index === timelineData.length - 1 || index % labelStep === 0;
    if (!shouldDrawLabel) return;
    const x = padding.left + (index / Math.max(timelineData.length - 1, 1)) * chartWidth;
    context.fillText(item.label || item.date, x, height - 20);
  });
  context.textAlign = 'left';
}

function drawValueLabels(context, padding, minimumValue, maximumValue, height) {
  context.fillStyle = '#0f172a';
  context.font = '12px Inter, Arial, sans-serif';
  context.fillText(`Max ${formatMoney(maximumValue)}`, padding.left, 20);
  context.fillText(`Min ${formatMoney(minimumValue)}`, padding.left, height - 8);
}

function drawEmptyChart(context, width, height, message) {
  context.fillStyle = '#64748b';
  context.font = '16px Inter, Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText(message, width / 2, height / 2);
  context.textAlign = 'left';
}

function formatMoney(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
