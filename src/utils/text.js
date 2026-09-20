export function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function uniqueText(value) {
  const text = cleanText(value);
  if (!text) return '';
  for (let repetitions = 2; repetitions <= 6; repetitions += 1) {
    if (text.length % repetitions !== 0) continue;
    const chunk = text.slice(0, text.length / repetitions);
    if (chunk.repeat(repetitions) === text) return chunk.trim();
  }
  return text;
}

export function dedupeStrings(values) {
  const seen = new Set();
  return values.map(uniqueText).filter((value) => {
    if (!value) return false;
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
