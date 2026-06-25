export function renderCompanySkeleton(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="skeleton-grid" aria-label="Loading companies">
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    </div>
  `;
}
