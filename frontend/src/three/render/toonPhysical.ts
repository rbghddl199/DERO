// @ts-nocheck
// 약한 툰 램프 PBR 머티리얼 — 직접광 디퓨즈만 2~3밴드 포스터라이즈, IBL·스펙큘러는 손실 없는 PBR 유지(셀셰이딩 아님)
// TSL LANDMINE ISOLATION (woodGrainNode.ts:1 precedent): TSL node chaining lives
// under @ts-nocheck so tsc never type-infers the node graph (that path OOMs ~70GB).
//
// D17 "조금 카툰"(stylized-PBR): a WEAK toon ramp on the accumulated DIRECT-light
// diffuse only. IBL/indirect diffuse and ALL specular (direct + IBL) pass through
// as lossless PBR — so wood/metal/plastic stay distinguishable (D5 mood premise)
// and HDRI reflections survive. This is NOT cel-shading; it is a gentle 2~3-band
// posterize of the diffuse key/fill response.
//
// Implementation: override PhysicalLightingModel.finish(), which is called AFTER
// all direct/indirect passes have accumulated into context.reflectedLight and is
// where clearcoat/sheen normally recompose outgoingLight. We do NOT reimplement
// direct() — its per-light internals (diffuseContribution etc.) are module-private
// TSL and are undefined outside the module. finish() sees the finished sums, so we
// re-band directDiffuse there and rebuild outgoingLight, then defer to super for
// the clearcoat/sheen layering it already knows how to do.
import { MeshPhysicalNodeMaterial, PhysicalLightingModel } from 'three/webgpu';
import { luminance, float, mix, smoothstep, uniform } from 'three/tsl';

// Whole-scene dial shared by every product material (hero GLB + parametric), so the
// lighting response is uniform and look-inhomogeneity is removed on the lighting
// axis. Tunable live in QA.
export const TOON_BANDS = uniform(3); // 2~3 bands (D17 upper bound)
export const TOON_STRENGTH = uniform(0.55); // 0 = full PBR, 1 = hard step

class ToonPhysicalLightingModel extends PhysicalLightingModel {
  finish(builder) {
    const { context } = builder;
    const rl = context.reflectedLight;

    // Band the DIRECT diffuse by luminance only: quantise brightness into bands
    // with a soft transition, keep hue by scaling the original colour by the
    // banded/original luminance ratio. Indirect diffuse + all specular untouched.
    const lum = luminance(rl.directDiffuse).toVar();
    const scaled = lum.mul(TOON_BANDS);
    const stepN = scaled.floor();
    // soft edge between bands (values are the D17 recommended start; QA-tunable)
    const soft = smoothstep(float(0.35), float(0.65), scaled.sub(stepN));
    const bandedLum = stepN.add(soft).div(TOON_BANDS);
    const ratio = bandedLum.div(lum.max(float(1e-4))); // band brightness, preserve hue
    const bandedDiffuse = mix(rl.directDiffuse, rl.directDiffuse.mul(ratio), TOON_STRENGTH);

    context.outgoingLight.assign(
      bandedDiffuse.add(rl.indirectDiffuse).add(rl.directSpecular).add(rl.indirectSpecular),
    );

    // super re-reads context.outgoingLight and layers clearcoat/sheen back on.
    super.finish(builder);
  }
}

export class ToonPhysicalNodeMaterial extends MeshPhysicalNodeMaterial {
  setupLightingModel() {
    // arg order = MeshPhysicalNodeMaterial.setupLightingModel (source :366) verbatim
    return new ToonPhysicalLightingModel(
      this.useClearcoat,
      this.useSheen,
      this.useIridescence,
      this.useAnisotropy,
      this.useTransmission,
      this.useDispersion,
    );
  }
}
