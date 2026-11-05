import {
  CATALOG_CODE_MAX_LENGTH,
  CATALOG_CODE_PATTERN,
  CATALOG_NAME_MAX_LENGTH,
  CATALOG_SORT_MAX,
} from '@tishuashua/shared';

export function normalizeCode(value: string): string | null {
  const code = value.trim().toLowerCase();
  if (!code || code.length > CATALOG_CODE_MAX_LENGTH || !CATALOG_CODE_PATTERN.test(code)) {
    return null;
  }
  return code;
}

export function normalizeName(value: string): string | null {
  const name = value.trim();
  if (!name || name.length > CATALOG_NAME_MAX_LENGTH) {
    return null;
  }
  return name;
}

export function parseSortOrder(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed > CATALOG_SORT_MAX) {
    return null;
  }
  return parsed;
}

export function parseScore(value: string, allowEmpty: boolean): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return allowEmpty ? null : undefined;
  }
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return undefined;
  }
  return parsed;
}
