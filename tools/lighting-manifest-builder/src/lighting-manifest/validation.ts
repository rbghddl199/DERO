import { BOUNCE_ROLES, LIGHTING_ROLES, LIGHT_TYPES, RENDER_PRESETS, type LightManifest, type ValidationIssue, type ValidationReport } from './types';

export function validateLightManifest(input: unknown): ValidationReport {
  const issues: ValidationIssue[] = [];
  const manifest = input as Partial<LightManifest>;
  if (!isObject(input)) return { valid: false, issues: [error('', 'INVALID_ROOT', 'Manifest must be a JSON object')] };
  if (manifest.schemaVersion !== '1.0.0') issues.push(error('/schemaVersion', 'SCHEMA_VERSION_UNSUPPORTED', 'schemaVersion must be 1.0.0'));
  if (!manifest.asset?.modelFile) issues.push(error('/asset/modelFile', 'REQUIRED', 'modelFile is required'));
  if (manifest.asset?.coordinateSpace !== 'NORMALIZED_MODEL_LOCAL' && manifest.asset?.coordinateSpace !== 'ORIGINAL_MODEL_LOCAL') issues.push(error('/asset/coordinateSpace', 'INVALID_ENUM', 'coordinateSpace is invalid'));
  if (manifest.asset?.unit !== 'METER') issues.push(error('/asset/unit', 'INVALID_ENUM', 'unit must be METER'));

  enumCheck('/classification/lightingRole', manifest.classification?.lightingRole, LIGHTING_ROLES, issues);
  enumCheck('/classification/renderPreset', manifest.classification?.renderPreset, RENDER_PRESETS, issues);
  range('/classification/confidence', manifest.classification?.confidence, 0, 1, issues);

  if (!manifest.binding) issues.push(error('/binding', 'REQUIRED', 'binding is required'));
  else {
    vec3('/binding/fallbackOrigin', manifest.binding.fallbackOrigin, issues);
    if (manifest.binding.fallbackTarget !== null) vec3('/binding/fallbackTarget', manifest.binding.fallbackTarget, issues);
  }

  const main = manifest.hybridLighting?.main;
  if (!main) issues.push(error('/hybridLighting/main', 'REQUIRED', 'main light is required'));
  else {
    enumCheck('/hybridLighting/main/type', main.type, LIGHT_TYPES, issues);
    range('/hybridLighting/main/intensityRatio', main.intensityRatio, 0, 10, issues);
    positive('/hybridLighting/main/rangeM', main.rangeM, issues);
    range('/hybridLighting/main/angleDeg', main.angleDeg, 1, 179, issues);
    range('/hybridLighting/main/penumbra', main.penumbra, 0, 1, issues);
    range('/hybridLighting/main/shadowPriority', main.shadowPriority, 0, 10, issues);
  }

  const fill = manifest.hybridLighting?.fill;
  if (!fill) issues.push(error('/hybridLighting/fill', 'REQUIRED', 'fill light is required'));
  else {
    if (fill.type !== 'POINT') issues.push(error('/hybridLighting/fill/type', 'INVALID_ENUM', 'fill type must be POINT'));
    vec3('/hybridLighting/fill/localOffset', fill.localOffset, issues);
    range('/hybridLighting/fill/intensityRatio', fill.intensityRatio, 0, 10, issues);
    positive('/hybridLighting/fill/rangeM', fill.rangeM, issues);
    if (fill.castShadow !== false) issues.push(error('/hybridLighting/fill/castShadow', 'INVALID_VALUE', 'fill must not cast shadow'));
  }

  manifest.hybridLighting?.bouncePolicies?.forEach((policy, index) => {
    enumCheck(`/hybridLighting/bouncePolicies/${index}/role`, policy.role, BOUNCE_ROLES, issues);
    range(`/hybridLighting/bouncePolicies/${index}/intensityRatio`, policy.intensityRatio, 0, 1, issues);
    range(`/hybridLighting/bouncePolicies/${index}/rangeRatio`, policy.rangeRatio, 0, 5, issues);
  });

  const color = manifest.controls?.colorTemperature;
  if (!color) issues.push(error('/controls/colorTemperature', 'REQUIRED', 'colorTemperature control is required'));
  else if (color.minK > color.maxK) issues.push(error('/controls/colorTemperature', 'COLOR_TEMPERATURE_RANGE_INVALID', 'minK must be less than or equal to maxK'));
  if ((manifest.controls?.brightness.type === 'STEP' || manifest.controls?.brightness.type === 'PRESET') && !manifest.controls.brightness.stepCount) {
    issues.push(error('/controls/brightness/stepCount', 'STEP_COUNT_REQUIRED', 'stepCount is required'));
  }
  if ((color?.type === 'STEP' || color?.type === 'PRESET') && !color.stepCount) {
    issues.push(error('/controls/colorTemperature/stepCount', 'STEP_COUNT_REQUIRED', 'stepCount is required'));
  }
  range('/review/confidence', manifest.review?.confidence, 0, 1, issues);
  return { valid: issues.length === 0, issues };
}

function enumCheck(path: string, value: unknown, allowed: readonly string[], issues: ValidationIssue[]): void {
  if (typeof value !== 'string' || !allowed.includes(value)) issues.push(error(path, 'INVALID_ENUM', `${path} has invalid value`));
}

function vec3(path: string, value: unknown, issues: ValidationIssue[]): void {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    issues.push(error(path, 'INVALID_VEC3', `${path} must be [number, number, number]`));
  }
}

function range(path: string, value: unknown, min: number, max: number, issues: ValidationIssue[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) issues.push(error(path, 'OUT_OF_RANGE', `${path} must be between ${min} and ${max}`));
}

function positive(path: string, value: unknown, issues: ValidationIssue[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) issues.push(error(path, 'NOT_POSITIVE', `${path} must be positive`));
}

function error(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message, severity: 'error' };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
