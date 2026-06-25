export const SORT_DIRECTIONS = Object.freeze({
  ASC: 'asc',
  DESC: 'desc'
});

export function compareText(firstValue, secondValue) {
  return String(firstValue || '').localeCompare(String(secondValue || ''), undefined, {
    sensitivity: 'base',
    numeric: true
  });
}

export function compareIsoDates(firstValue, secondValue) {
  const firstTime = Date.parse(firstValue || '');
  const secondTime = Date.parse(secondValue || '');

  if (Number.isFinite(firstTime) && Number.isFinite(secondTime)) {
    return firstTime - secondTime;
  }

  return compareText(firstValue, secondValue);
}

export function applySortDirection(comparison, direction) {
  return direction === SORT_DIRECTIONS.DESC ? comparison * -1 : comparison;
}
