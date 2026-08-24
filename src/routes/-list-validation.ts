export function isValidPercent(value: string) {
  const percent = Number(value);
  return (
    /^\d+(?:\.\d+)?$/.test(value.trim()) &&
    Number.isFinite(percent) &&
    percent > 0 &&
    percent <= 100
  );
}
