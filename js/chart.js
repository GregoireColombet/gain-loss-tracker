export function drawGainLossChart(canvasElement, timelineData) {
  const context = canvasElement.getContext('2d');
  const width = canvasElement.width;
  const height = canvasElement.height;
  context.clearRect(0, 0, width, height);

  if (!timelineData.length) {
    drawEmptyChart(context, width, height, 'No realized gain/loss history yet.');
    return;
  }

  const values = timelineData.map(item => item.value);
  const minimumValue = Math.min(...values, 0);
  const maximumValue = Math.max(...values, 0);
  const range = maximumValue - minimumValue || 1;
  const padding = 36;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  context.lineWidth = 2;
  context.strokeStyle = '#9ca3af';
  context.beginPath();
  const zeroY = padding + chartHeight - ((0 - minimumValue) / range) * chartHeight;
  context.moveTo(padding, zeroY);
  context.lineTo(width - padding, zeroY);
  context.stroke();

  context.strokeStyle = values[values.length - 1] >= 0 ? '#16a34a' : '#dc2626';
  context.lineWidth = 3;
  context.beginPath();

  timelineData.forEach((item, index) => {
    const x = padding + (index / Math.max(timelineData.length - 1, 1)) * chartWidth;
    const y = padding + chartHeight - ((item.value - minimumValue) / range) * chartHeight;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });

  context.stroke();

  context.fillStyle = '#111827';
  context.font = '12px Arial';
  context.fillText(`Max ${formatMoney(maximumValue)}`, padding, 18);
  context.fillText(`Min ${formatMoney(minimumValue)}`, padding, height - 12);
}

function drawEmptyChart(context, width, height, message) {
  context.fillStyle = '#6b7280';
  context.font = '16px Arial';
  context.textAlign = 'center';
  context.fillText(message, width / 2, height / 2);
  context.textAlign = 'left';
}

function formatMoney(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
