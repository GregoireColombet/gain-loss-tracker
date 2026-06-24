const FALLBACK_VERSION_INFO = {
  version: 'v1.0.0',
  githubTag: 'v1.0.0',
  commit: 'local',
  buildDate: '2026-06-23T00:00:00Z',
  buildLabel: 'Local package build',
  githubRepository: ''
};

let versionInfoPromise = null;
let resolvedVersionInfo = FALLBACK_VERSION_INFO;

function normalizeVersionInfo(rawVersionInfo) {
  if (!rawVersionInfo || typeof rawVersionInfo !== 'object') {
    return FALLBACK_VERSION_INFO;
  }

  return {
    version: rawVersionInfo.version || rawVersionInfo.githubTag || FALLBACK_VERSION_INFO.version,
    githubTag: rawVersionInfo.githubTag || rawVersionInfo.version || FALLBACK_VERSION_INFO.githubTag,
    commit: rawVersionInfo.commit || FALLBACK_VERSION_INFO.commit,
    buildDate: rawVersionInfo.buildDate || FALLBACK_VERSION_INFO.buildDate,
    buildLabel: rawVersionInfo.buildLabel || FALLBACK_VERSION_INFO.buildLabel,
    githubRepository: rawVersionInfo.githubRepository || FALLBACK_VERSION_INFO.githubRepository
  };
}

async function fetchRuntimeVersionInfo() {
  try {
    const versionUrl = new URL('../../version.json', import.meta.url);
    const response = await fetch(versionUrl, { cache: 'no-store' });
    if (!response.ok) {
      return FALLBACK_VERSION_INFO;
    }

    return normalizeVersionInfo(await response.json());
  } catch (error) {
    console.warn('Version metadata could not be loaded. Falling back to bundled version.', error);
    return FALLBACK_VERSION_INFO;
  }
}

export async function getResolvedVersionInfo() {
  if (!versionInfoPromise) {
    versionInfoPromise = fetchRuntimeVersionInfo().then((versionInfo) => {
      resolvedVersionInfo = versionInfo;
      return resolvedVersionInfo;
    });
  }

  return versionInfoPromise;
}

function getShortCommit(commit) {
  if (!commit) return '';
  return String(commit).slice(0, 7);
}

export function getDisplayVersion(versionInfo = resolvedVersionInfo) {
  const version = versionInfo.githubTag || versionInfo.version;
  const commit = getShortCommit(versionInfo.commit);
  return commit && commit !== 'local' ? `${version} · ${commit}` : version;
}

export function getVersionTooltip(versionInfo = resolvedVersionInfo) {
  const parts = [versionInfo.buildLabel, versionInfo.buildDate];
  if (versionInfo.commit) {
    parts.push(`commit ${versionInfo.commit}`);
  }
  return parts.filter(Boolean).join(' · ');
}

function formatBuildDate(buildDate) {
  if (!buildDate) return 'Not available';
  const parsedDate = new Date(buildDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return buildDate;
  }
  return parsedDate.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

function getReleaseNotesUrl(versionInfo) {
  const repository = versionInfo.githubRepository;
  const tag = versionInfo.githubTag || versionInfo.version;
  if (!repository || !tag || tag.startsWith('dev-')) {
    return '';
  }
  return `https://github.com/${repository}/releases/tag/${encodeURIComponent(tag)}`;
}

function setTextContent(parent, selector, value) {
  const element = parent.querySelector(selector);
  if (element) {
    element.textContent = value || 'Not available';
  }
}

function ensureVersionModal() {
  let modal = document.getElementById('versionInfoModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'versionInfoModal';
  modal.className = 'version-modal-overlay hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'versionInfoModalTitle');

  modal.innerHTML = `
    <div class="version-modal-card">
      <div class="version-modal-header">
        <h2 id="versionInfoModalTitle">Build Information</h2>
        <button type="button" class="version-modal-close" data-version-modal-close aria-label="Close build information">×</button>
      </div>
      <dl class="version-modal-details">
        <div><dt>Version</dt><dd data-version-detail="version"></dd></div>
        <div><dt>Commit</dt><dd data-version-detail="commit"></dd></div>
        <div><dt>Build Date</dt><dd data-version-detail="buildDate"></dd></div>
        <div><dt>Environment</dt><dd data-version-detail="environment"></dd></div>
      </dl>
      <div class="version-modal-actions">
        <a data-version-release-link href="#" target="_blank" rel="noopener noreferrer">View Release Notes</a>
        <button type="button" data-version-modal-close>Close</button>
      </div>
    </div>
  `;

  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.closest('[data-version-modal-close]')) {
      hideVersionModal(modal);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
      hideVersionModal(modal);
    }
  });

  document.body.appendChild(modal);
  return modal;
}

function hideVersionModal(modal) {
  modal.classList.add('hidden');
}

function showVersionModal(versionInfo) {
  const modal = ensureVersionModal();
  const releaseNotesUrl = getReleaseNotesUrl(versionInfo);

  setTextContent(modal, '[data-version-detail="version"]', versionInfo.githubTag || versionInfo.version);
  setTextContent(modal, '[data-version-detail="commit"]', versionInfo.commit);
  setTextContent(modal, '[data-version-detail="buildDate"]', formatBuildDate(versionInfo.buildDate));
  setTextContent(modal, '[data-version-detail="environment"]', versionInfo.buildLabel);

  const releaseLink = modal.querySelector('[data-version-release-link]');
  if (releaseLink) {
    if (releaseNotesUrl) {
      releaseLink.href = releaseNotesUrl;
      releaseLink.hidden = false;
    } else {
      releaseLink.hidden = true;
    }
  }

  modal.classList.remove('hidden');
  const closeButton = modal.querySelector('[data-version-modal-close]');
  closeButton?.focus();
}

export async function updateVersionElement(versionElement) {
  if (!versionElement) return;
  const versionInfo = await getResolvedVersionInfo();
  const displayVersion = getDisplayVersion(versionInfo);

  versionElement.textContent = displayVersion;
  versionElement.title = getVersionTooltip(versionInfo);
  versionElement.setAttribute('aria-label', `Application version ${displayVersion}. Open build information.`);

  if (!versionElement.dataset.versionClickBound) {
    versionElement.dataset.versionClickBound = 'true';
    versionElement.addEventListener('click', async () => {
      const latestVersionInfo = await getResolvedVersionInfo();
      showVersionModal(latestVersionInfo);
    });
  }
}
