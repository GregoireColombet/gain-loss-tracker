const FALLBACK_VERSION_INFO = {
  version: 'v1.0.0',
  githubTag: 'v1.0.0',
  commit: 'local',
  buildDate: '2026-06-23',
  buildLabel: 'Local package build'
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
    buildLabel: rawVersionInfo.buildLabel || FALLBACK_VERSION_INFO.buildLabel
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

export function getDisplayVersion(versionInfo = resolvedVersionInfo) {
  return versionInfo.githubTag || versionInfo.version;
}

export function getVersionTooltip(versionInfo = resolvedVersionInfo) {
  const parts = [versionInfo.buildLabel, versionInfo.buildDate];
  if (versionInfo.commit) {
    parts.push(`commit ${versionInfo.commit}`);
  }
  return parts.filter(Boolean).join(' · ');
}

export async function updateVersionElement(versionElement) {
  if (!versionElement) return;
  const versionInfo = await getResolvedVersionInfo();
  const displayVersion = getDisplayVersion(versionInfo);
  versionElement.textContent = displayVersion;
  versionElement.title = getVersionTooltip(versionInfo);
  versionElement.setAttribute('aria-label', `Application version ${displayVersion}`);
}
