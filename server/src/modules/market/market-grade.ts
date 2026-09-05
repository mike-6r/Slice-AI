export function gradeValuesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const leftNumber = numericGrade(left);
  const rightNumber = numericGrade(right);
  if (leftNumber !== null && rightNumber !== null)
    return leftNumber === rightNumber;
  return normalizeGrade(left) === normalizeGrade(right);
}

function numericGrade(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeGrade(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
