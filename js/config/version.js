export const APP_VERSION = {
  version: 'v1.0.0',
  githubTag: 'v1.0.0',
  buildDate: '2026-06-23',
  buildLabel: 'GitHub Pages build'
};

export function getDisplayVersion() {
  return APP_VERSION.githubTag || APP_VERSION.version;
}

export function getVersionTooltip() {
  return `${APP_VERSION.buildLabel} · ${APP_VERSION.buildDate}`;
}
