export function createOption(value, text) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  return option;
}

export function createMetaPill(label, value, className = 'analysis-meta-pill') {
  const pill = document.createElement('span');
  pill.className = className;
  pill.textContent = `${label}: ${value}`;
  return pill;
}
