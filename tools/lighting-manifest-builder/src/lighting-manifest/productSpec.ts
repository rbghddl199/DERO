import { LIGHTING_ROLES, type ControlType, type LightingRole, type ProductSpecInput } from './types';

export function normalizeProductSpecInput(input: unknown): ProductSpecInput | null {
  if (!isRecord(input)) return null;
  const roleHint = stringFrom(input, ['roleHint', 'lightingRole', 'role', 'category']);
  return {
    colorTemperatureMinK: numberFrom(input, ['colorTemperatureMinK', 'minK']),
    colorTemperatureMaxK: numberFrom(input, ['colorTemperatureMaxK', 'maxK']),
    luminousFluxMinLm: numberFrom(input, ['luminousFluxMinLm', 'minLm']),
    luminousFluxMaxLm: numberFrom(input, ['luminousFluxMaxLm', 'maxLm']),
    brightnessAdjustable: booleanFrom(input, ['brightnessAdjustable', 'isBrightnessAdjustable']),
    colorTemperatureAdjustable: booleanFrom(input, ['colorTemperatureAdjustable', 'isColorTemperatureAdjustable']),
    brightnessControlType: controlTypeFrom(input, ['brightnessControlType', 'brightnessType']),
    colorTemperatureControlType: controlTypeFrom(input, ['colorTemperatureControlType', 'colorTemperatureType']),
    reachM: numberFrom(input, ['reachM']) ?? mmToM(numberFrom(input, ['reachMm', 'reach'])),
    roleHint: normalizeRole(roleHint) ?? roleHint,
    category: stringFrom(input, ['category', 'productCategory']),
  };
}

function numberFrom(input: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function booleanFrom(input: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string' && ['true', 'false'].includes(value.toLowerCase())) return value.toLowerCase() === 'true';
  }
  return undefined;
}

function stringFrom(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function controlTypeFrom(input: Record<string, unknown>, keys: string[]): ControlType | undefined {
  const value = stringFrom(input, keys)?.toUpperCase();
  if (value === 'FIXED' || value === 'STEP' || value === 'CONTINUOUS' || value === 'PRESET') return value;
  return undefined;
}

function normalizeRole(value: string | undefined): LightingRole | undefined {
  if (!value) return undefined;
  const normalized = value.toUpperCase().replaceAll('-', '_').replaceAll(' ', '_');
  return LIGHTING_ROLES.find((role) => role === normalized);
}

function mmToM(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value / 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
