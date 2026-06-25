const COMMAND_SHORTCUT_KEY = 'k';

let initialized = false;
let state = {
  overlay: null,
  input: null,
  results: null,
  commands: [],
  activeIndex: 0
};

export function initializeCommandPalette(getExtraCommands = () => []) {
  if (initialized) return;
  initialized = true;

  createPaletteMarkup();
  state.commands = getBaseCommands();

  document.addEventListener('keydown', event => {
    const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === COMMAND_SHORTCUT_KEY;
    if (isShortcut) {
      event.preventDefault();
      openCommandPalette(getExtraCommands);
      return;
    }

    if (!state.overlay || state.overlay.hidden) return;
    if (event.key === 'Escape') closeCommandPalette();
    if (event.key === 'ArrowDown') moveActiveResult(1, event);
    if (event.key === 'ArrowUp') moveActiveResult(-1, event);
    if (event.key === 'Enter') runActiveCommand(event);
  });

  state.input.addEventListener('input', renderCommandResults);
  state.overlay.addEventListener('click', event => {
    if (event.target === state.overlay) closeCommandPalette();
    const item = event.target.closest('[data-command-index]');
    if (item) runCommandAtIndex(Number(item.dataset.commandIndex));
  });
}

function createPaletteMarkup() {
  const overlay = document.createElement('div');
  overlay.className = 'command-palette-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <div class="command-palette-header">
        <label class="visually-hidden" for="commandPaletteInput">Search commands</label>
        <input id="commandPaletteInput" class="command-palette-input" type="search" placeholder="Search pages, companies, reports, prompts..." autocomplete="off">
      </div>
      <div id="commandPaletteResults" class="command-palette-results" role="listbox"></div>
    </div>
  `;
  document.body.append(overlay);
  state.overlay = overlay;
  state.input = overlay.querySelector('#commandPaletteInput');
  state.results = overlay.querySelector('#commandPaletteResults');
}

function openCommandPalette(getExtraCommands) {
  state.commands = [...getBaseCommands(), ...getExtraCommands()].filter(Boolean);
  state.activeIndex = 0;
  state.input.value = '';
  state.overlay.hidden = false;
  renderCommandResults();
  queueMicrotask(() => state.input.focus());
}

function closeCommandPalette() {
  state.overlay.hidden = true;
}

function getBaseCommands() {
  return [
    { title: 'Open Dashboard', subtitle: 'Portfolio, companies, transactions', action: () => location.href = './index.html' },
    { title: 'Open Analysis', subtitle: 'Reports, generation, prompt editor', action: () => location.href = './analysis.html' },
    { title: 'Open Edit Transactions', subtitle: 'Manage records', action: () => location.href = './edit.html' }
  ];
}

function getFilteredCommands() {
  const query = state.input.value.trim().toLowerCase();
  if (!query) return state.commands;
  return state.commands.filter(command => [command.title, command.subtitle]
    .filter(Boolean)
    .some(value => String(value).toLowerCase().includes(query)));
}

function renderCommandResults() {
  const commands = getFilteredCommands();
  state.activeIndex = Math.min(state.activeIndex, Math.max(commands.length - 1, 0));

  if (!commands.length) {
    state.results.innerHTML = '<p class="command-palette-empty">No matching commands.</p>';
    return;
  }

  state.results.replaceChildren(...commands.map((command, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `command-palette-item${index === state.activeIndex ? ' is-active' : ''}`;
    button.dataset.commandIndex = String(index);
    button.innerHTML = `<span>${escapeHtml(command.title)}</span><small>${escapeHtml(command.subtitle || '')}</small>`;
    return button;
  }));
}

function moveActiveResult(delta, event) {
  event.preventDefault();
  const commands = getFilteredCommands();
  if (!commands.length) return;
  state.activeIndex = (state.activeIndex + delta + commands.length) % commands.length;
  renderCommandResults();
}

function runActiveCommand(event) {
  event.preventDefault();
  runCommandAtIndex(state.activeIndex);
}

function runCommandAtIndex(index) {
  const command = getFilteredCommands()[index];
  if (!command) return;
  closeCommandPalette();
  command.action?.();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[character]));
}
