/** Comparaison SemVer minimale pour les plages déclarées par les manifestes. */
interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

export function parseVersion(value: string): ParsedVersion | undefined {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u.exec(
      value,
    );
  if (!match) return undefined;
  if (match.slice(1, 4).some((part) => !Number.isSafeInteger(Number(part)))) return undefined;
  if (match[4]?.split('.').some((part) => /^0\d+$/u.test(part))) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

function compare(left: ParsedVersion, right: ParsedVersion): number {
  if (left.major !== right.major) return left.major < right.major ? -1 : 1;
  if (left.minor !== right.minor) return left.minor < right.minor ? -1 : 1;
  if (left.patch !== right.patch) return left.patch < right.patch ? -1 : 1;
  // 1.2.3-alpha < 1.2.3 ; sans préversion, la version l'emporte.
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  const leftParts = left.prerelease.split('.');
  const rightParts = right.prerelease.split('.');
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
    const a = leftParts[index],
      b = rightParts[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const aNumeric = /^\d+$/u.test(a),
      bNumeric = /^\d+$/u.test(b);
    if (aNumeric && bNumeric) return BigInt(a) < BigInt(b) ? -1 : 1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return 0;
}

/** Plages de la forme `>=X.Y.Z <A.B.C` (conjonction de comparateurs). */
export function satisfiesRange(version: string, range: string): boolean {
  const current = parseVersion(version);
  if (!current) return false;
  const comparators = range.trim().split(/\s+/u);
  if (!comparators.length) return false;
  for (const comparator of comparators) {
    const match = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/u.exec(comparator);
    if (!match) return false;
    const target = parseVersion(match[2]!);
    if (!target) return false;
    const order = compare(current, target);
    const operator = match[1] ?? '=';
    const ok =
      operator === '>='
        ? order >= 0
        : operator === '<='
          ? order <= 0
          : operator === '>'
            ? order > 0
            : operator === '<'
              ? order < 0
              : order === 0;
    if (!ok) return false;
  }
  return true;
}
