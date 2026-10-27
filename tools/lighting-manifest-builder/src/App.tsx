import { useEffect, useMemo, useRef, useState } from 'react';
import { BOUNCE_ROLES, LIGHTING_ROLES, LIGHT_TYPES, PREVIEW_STAGES, type BounceRole, type LightManifest, type LightingRole, type LightType, type ModelAnalysis, type PreviewStage, type ProductSpecInput, type Vec3 } from './lighting-manifest/types';
import { createDraftManifest } from './lighting-manifest/recommend';
import { LIGHTING_PRESETS, presetForRole } from './lighting-manifest/presets';
import { normalizeProductSpecInput } from './lighting-manifest/productSpec';
import { validateLightManifest } from './lighting-manifest/validation';
import { createZipBlob, type ZipFileInput } from './lighting-manifest/zip';
import { downloadBlob, downloadJson } from './lighting-manifest/io';
import { analyzeGlbFile } from './three/analyzeGlb';
import { ReviewScene } from './three/ReviewScene';

const previewFileNames: Record<PreviewStage, string> = {
  MODEL_ONLY: 'preview-model.png',
  EMISSIVE_ONLY: 'preview-emissive.png',
  MAIN_LIGHT: 'preview-main-light.png',
  HYBRID_BASIC: 'preview-hybrid-basic.png',
  HYBRID_FINAL: 'preview-hybrid-final.png',
};

export default function App() {
  const [jobId] = useState(() => `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [createdAt] = useState(() => new Date().toISOString());
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [referenceMain, setReferenceMain] = useState<File | null>(null);
  const [referenceOff, setReferenceOff] = useState<File | null>(null);
  const [referenceOn, setReferenceOn] = useState<File | null>(null);
  const [productSpecFile, setProductSpecFile] = useState<File | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [referenceUrls, setReferenceUrls] = useState<{ main: string | null; off: string | null; on: string | null }>({ main: null, off: null, on: null });
  const [analysis, setAnalysis] = useState<ModelAnalysis | null>(null);
  const [manifest, setManifest] = useState<LightManifest | null>(null);
  const [suggestedManifest, setSuggestedManifest] = useState<LightManifest | null>(null);
  const [previewStage, setPreviewStage] = useState<PreviewStage>('HYBRID_FINAL');
  const [transformTarget, setTransformTarget] = useState<'origin' | 'target'>('origin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sceneRef = useRef<ReviewScene | null>(null);
  const validation = useMemo(() => (manifest ? validateLightManifest(manifest) : null), [manifest]);
  const meshOptions = analysis?.meshes.map((mesh) => mesh.nodeName) ?? [];

  useEffect(() => () => {
    if (modelUrl) URL.revokeObjectURL(modelUrl);
    for (const url of Object.values(referenceUrls)) if (url) URL.revokeObjectURL(url);
  }, [modelUrl, referenceUrls]);

  function updateModelFile(file: File | null): void {
    if (modelUrl) URL.revokeObjectURL(modelUrl);
    setModelFile(file);
    setModelUrl(file ? URL.createObjectURL(file) : null);
  }

  function updateReference(key: 'main' | 'off' | 'on', file: File | null): void {
    const previous = referenceUrls[key];
    if (previous) URL.revokeObjectURL(previous);
    if (key === 'main') setReferenceMain(file);
    if (key === 'off') setReferenceOff(file);
    if (key === 'on') setReferenceOn(file);
    setReferenceUrls((current) => ({ ...current, [key]: file ? URL.createObjectURL(file) : null }));
  }

  async function analyze(): Promise<void> {
    if (!modelFile) {
      setError('model.glb is required.');
      return;
    }
    if (!referenceMain) {
      setError('reference-main image is required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const spec: ProductSpecInput | null = productSpecFile ? normalizeProductSpecInput(JSON.parse(await productSpecFile.text())) : null;
      const nextAnalysis = await analyzeGlbFile(modelFile);
      const draft = createDraftManifest(nextAnalysis, spec);
      setAnalysis(nextAnalysis);
      setManifest(draft);
      setSuggestedManifest(structuredClone(draft));
      setPreviewStage('HYBRID_FINAL');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  }

  function patchManifest(recipe: (manifest: LightManifest) => void): void {
    setManifest((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      recipe(next);
      return next;
    });
  }

  function setRole(role: LightingRole): void {
    patchManifest((draft) => {
      const preset = presetForRole(role);
      draft.classification.lightingRole = role;
      draft.classification.renderPreset = preset;
      draft.hybridLighting = structuredClone(LIGHTING_PRESETS[preset].hybridLighting);
    });
  }

  async function importManifest(file: File): Promise<void> {
    try {
      setManifest(JSON.parse(await file.text()) as LightManifest);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Manifest import failed.');
    }
  }

  async function exportCurrentPng(): Promise<void> {
    const scene = sceneRef.current;
    if (!scene) return;
    downloadBlob(await scene.pngBlob(), previewFileNames[previewStage]);
  }

  async function exportZip(): Promise<void> {
    if (!manifest || !analysis || !modelFile) return;
    const report = validateLightManifest(manifest);
    const files: ZipFileInput[] = [
      { path: `${jobId}/model.original.glb`, data: modelFile },
      { path: `${jobId}/model.normalized.glb`, data: modelFile },
      { path: `${jobId}/analysis-report.json`, data: JSON.stringify(analysis, null, 2) },
      { path: `${jobId}/light.manifest.json`, data: JSON.stringify(manifest, null, 2) },
      { path: `${jobId}/validation-report.json`, data: JSON.stringify(report, null, 2) },
      { path: `${jobId}/review-history.json`, data: JSON.stringify({ jobId, suggested: suggestedManifest, confirmed: manifest, reviewDurationSeconds: Math.round((Date.now() - Date.parse(createdAt)) / 1000), confidence: manifest.review.confidence, createdAt: new Date().toISOString() }, null, 2) },
    ];
    if (referenceMain) files.push({ path: `${jobId}/reference-main.${ext(referenceMain)}`, data: referenceMain });
    if (referenceOff) files.push({ path: `${jobId}/reference-off.${ext(referenceOff)}`, data: referenceOff });
    if (referenceOn) files.push({ path: `${jobId}/reference-on.${ext(referenceOn)}`, data: referenceOn });
    const originalStage = previewStage;
    for (const stage of PREVIEW_STAGES) {
      setPreviewStage(stage);
      sceneRef.current?.setStage(stage);
      await waitFrames(2);
      if (sceneRef.current) files.push({ path: `${jobId}/${previewFileNames[stage]}`, data: await sceneRef.current.pngBlob() });
    }
    setPreviewStage(originalStage);
    sceneRef.current?.setStage(originalStage);
    downloadBlob(await createZipBlob(files), `${jobId}.zip`);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>DERO Lighting Manifest Builder</h1>
          <p>{jobId}</p>
        </div>
        <div className="actions">
          <button disabled={!manifest} onClick={() => manifest && downloadJson(manifest, 'light.manifest.json')}>Export Manifest</button>
          <button disabled={!validation} onClick={() => validation && downloadJson(validation, 'validation-report.json')}>Validation</button>
          <button disabled={!sceneRef.current} onClick={() => void exportCurrentPng()}>PNG</button>
          <button disabled={!manifest || !analysis} className="primary" onClick={() => void exportZip()}>ZIP</button>
        </div>
      </header>

      <main className="layout">
        <aside className="panel left">
          <Section title="Inputs">
            <FileField label="model.glb *" accept=".glb,model/gltf-binary" file={modelFile} onChange={updateModelFile} />
            <FileField label="reference-main *" accept="image/*" file={referenceMain} onChange={(file) => updateReference('main', file)} />
            <FileField label="reference-off" accept="image/*" file={referenceOff} onChange={(file) => updateReference('off', file)} />
            <FileField label="reference-on" accept="image/*" file={referenceOn} onChange={(file) => updateReference('on', file)} />
            <FileField label="product-spec.json" accept=".json,application/json" file={productSpecFile} onChange={setProductSpecFile} />
            <button className="primary wide" disabled={loading} onClick={() => void analyze()}>{loading ? 'Analyzing...' : 'Analyze and Draft'}</button>
            {error && <p className="error">{error}</p>}
          </Section>

          <Section title="Reference Images">
            <div className="thumbs">
              <Thumb label="main" url={referenceUrls.main} />
              <Thumb label="off" url={referenceUrls.off} />
              <Thumb label="on" url={referenceUrls.on} />
            </div>
          </Section>

          <Section title="Analysis">
            {analysis ? (
              <>
                <Stat label="Meshes" value={analysis.meshCount} />
                <Stat label="Materials" value={analysis.materialCount} />
                <Stat label="Size" value={analysis.modelSize.map((v) => v.toFixed(3)).join(', ')} />
                <Stat label="Anchors" value={analysis.anchorNodes.length} />
                <div className="chips">{analysis.assetLimitations.map((item) => <span key={item}>{item}</span>)}</div>
              </>
            ) : <p className="muted">No analysis yet.</p>}
          </Section>

          <Section title="Import">
            <input type="file" accept=".json,application/json" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importManifest(file);
              e.currentTarget.value = '';
            }} />
          </Section>
        </aside>

        <section className="canvasWrap">
          <ReviewCanvas sceneRef={sceneRef} modelUrl={modelUrl} manifest={manifest} stage={previewStage} transformTarget={transformTarget} onOrigin={(value) => patchManifest((draft) => { draft.binding.originNode = null; draft.binding.fallbackOrigin = value; })} onTarget={(value) => patchManifest((draft) => { draft.binding.targetNode = null; draft.binding.fallbackTarget = value; })} />
        </section>

        <aside className="panel right">
          <Section title="Preview Stage">
            <div className="stageGrid">{PREVIEW_STAGES.map((stage) => <button key={stage} className={previewStage === stage ? 'selected' : ''} onClick={() => setPreviewStage(stage)}>{stage}</button>)}</div>
          </Section>

          {manifest ? (
            <>
              <Section title="Classification">
                <Select label="Lighting Role" value={manifest.classification.lightingRole} options={LIGHTING_ROLES} onChange={(value) => setRole(value as LightingRole)} />
                <Stat label="Preset" value={manifest.classification.renderPreset} />
                <Stat label="Confidence" value={manifest.review.confidence.toFixed(2)} />
              </Section>

              <Section title="Binding">
                <div className="segmented">
                  <button className={transformTarget === 'origin' ? 'selected' : ''} onClick={() => setTransformTarget('origin')}>Origin</button>
                  <button className={transformTarget === 'target' ? 'selected' : ''} onClick={() => setTransformTarget('target')}>Target</button>
                </div>
                <Vec3Field label="Origin" value={manifest.binding.fallbackOrigin} onChange={(value) => patchManifest((draft) => { draft.binding.fallbackOrigin = value; })} />
                {manifest.binding.fallbackTarget ? <Vec3Field label="Target" value={manifest.binding.fallbackTarget} onChange={(value) => patchManifest((draft) => { draft.binding.fallbackTarget = value; })} /> : <button onClick={() => patchManifest((draft) => { draft.binding.fallbackTarget = [0, 0, 0]; })}>Add Target</button>}
              </Section>

              <Section title="Main Light">
                <Select label="Type" value={manifest.hybridLighting.main.type} options={LIGHT_TYPES} onChange={(value) => patchManifest((draft) => { draft.hybridLighting.main.type = value as LightType; })} />
                <NumberField label="Intensity" value={manifest.hybridLighting.main.intensityRatio} min={0} max={10} step={0.01} onChange={(value) => patchManifest((draft) => { draft.hybridLighting.main.intensityRatio = value; })} />
                <NumberField label="Range M" value={manifest.hybridLighting.main.rangeM} min={0.01} max={20} step={0.05} onChange={(value) => patchManifest((draft) => { draft.hybridLighting.main.rangeM = value; })} />
                <NumberField label="Angle Deg" value={manifest.hybridLighting.main.angleDeg} min={1} max={179} step={1} onChange={(value) => patchManifest((draft) => { draft.hybridLighting.main.angleDeg = value; })} />
                <NumberField label="Penumbra" value={manifest.hybridLighting.main.penumbra} min={0} max={1} step={0.01} onChange={(value) => patchManifest((draft) => { draft.hybridLighting.main.penumbra = value; })} />
                <label className="check"><input type="checkbox" checked={manifest.hybridLighting.main.castShadow} onChange={(e) => patchManifest((draft) => { draft.hybridLighting.main.castShadow = e.target.checked; })} /> Main Shadow</label>
              </Section>

              <Section title="Fill and Bounce">
                <label className="check"><input type="checkbox" checked={manifest.hybridLighting.fill.enabled} onChange={(e) => patchManifest((draft) => { draft.hybridLighting.fill.enabled = e.target.checked; })} /> Fill Enabled</label>
                <NumberField label="Fill Ratio" value={manifest.hybridLighting.fill.intensityRatio} min={0} max={1} step={0.01} onChange={(value) => patchManifest((draft) => { draft.hybridLighting.fill.intensityRatio = value; })} />
                <Select label="Bounce Role" value={manifest.hybridLighting.bouncePolicies[0]?.role ?? 'NO_BOUNCE'} options={BOUNCE_ROLES} onChange={(value) => patchManifest((draft) => {
                  const policy = draft.hybridLighting.bouncePolicies[0];
                  if (policy) {
                    policy.role = value as BounceRole;
                    policy.enabled = value !== 'NO_BOUNCE';
                  }
                })} />
              </Section>

              <Section title="Materials">
                <MeshSelect label="Emissive Mesh" value={manifest.materialBindings.emissiveSurfaceMesh} options={meshOptions} onChange={(value) => patchManifest((draft) => { draft.materialBindings.emissiveSurfaceMesh = value; draft.materialResponse.emissive.meshNode = value; })} />
                <MeshSelect label="Bulb Mesh" value={manifest.materialBindings.bulbMesh} options={meshOptions} onChange={(value) => patchManifest((draft) => { draft.materialBindings.bulbMesh = value; })} />
                <MeshSelect label="Shade Mesh" value={manifest.materialBindings.shadeMesh} options={meshOptions} onChange={(value) => patchManifest((draft) => { draft.materialBindings.shadeMesh = value; draft.materialResponse.translucentShade.meshNode = value; })} />
                <NumberField label="Emissive Ratio" value={manifest.materialResponse.emissive.intensityRatio} min={0} max={10} step={0.05} onChange={(value) => patchManifest((draft) => { draft.materialResponse.emissive.intensityRatio = value; })} />
              </Section>

              <Section title="Validation">
                {validation?.valid ? <p className="ok">Schema validation passed.</p> : <div>{validation?.issues.map((issue) => <p className="error" key={`${issue.path}-${issue.code}`}>{issue.path}: {issue.message}</p>)}</div>}
              </Section>

              <Section title="Manifest">
                <pre>{JSON.stringify(manifest, null, 2)}</pre>
              </Section>
            </>
          ) : <p className="empty">Upload files and run analysis to generate a draft manifest.</p>}
        </aside>
      </main>
    </div>
  );
}

function ReviewCanvas({ sceneRef, modelUrl, manifest, stage, transformTarget, onOrigin, onTarget }: { sceneRef: React.MutableRefObject<ReviewScene | null>; modelUrl: string | null; manifest: LightManifest | null; stage: PreviewStage; transformTarget: 'origin' | 'target'; onOrigin: (value: Vec3) => void; onTarget: (value: Vec3) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new ReviewScene(canvasRef.current);
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [sceneRef]);
  useEffect(() => {
    if (modelUrl) void sceneRef.current?.loadModel(modelUrl);
  }, [modelUrl, sceneRef]);
  useEffect(() => sceneRef.current?.setManifest(manifest), [manifest, sceneRef]);
  useEffect(() => sceneRef.current?.setStage(stage), [stage, sceneRef]);
  useEffect(() => sceneRef.current?.setTransformTarget(transformTarget), [transformTarget, sceneRef]);
  useEffect(() => sceneRef.current?.setCallbacks({ onOrigin, onTarget }), [onOrigin, onTarget, sceneRef]);
  return <canvas ref={canvasRef} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="section"><h2>{title}</h2>{children}</section>;
}

function FileField({ label, accept, file, onChange }: { label: string; accept: string; file: File | null; onChange: (file: File | null) => void }) {
  return <label className="field"><span>{label}</span><input type="file" accept={accept} onChange={(e) => onChange(e.target.files?.[0] ?? null)} />{file && <small>{file.name}</small>}</label>;
}

function Thumb({ label, url }: { label: string; url: string | null }) {
  return <div className="thumb">{url ? <img src={url} alt={label} /> : <span>{label}</span>}</div>;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <p className="stat"><span>{label}</span><strong>{value}</strong></p>;
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (value: T) => void }) {
  return <label className="field"><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value as T)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function MeshSelect({ label, value, options, onChange }: { label: string; value: string | null; options: string[]; onChange: (value: string | null) => void }) {
  return <label className="field"><span>{label}</span><select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}><option value="">None</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="field"><span>{label}</span><input type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}

function Vec3Field({ label, value, onChange }: { label: string; value: Vec3; onChange: (value: Vec3) => void }) {
  return <label className="field"><span>{label}</span><div className="vec">{value.map((item, index) => <input key={index} type="number" step={0.001} value={item} onChange={(e) => {
    const next = [...value] as Vec3;
    next[index] = Number(e.target.value);
    onChange(next);
  }} />)}</div></label>;
}

function waitFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const tick = (left: number) => requestAnimationFrame(() => left <= 1 ? resolve() : tick(left - 1));
    tick(count);
  });
}

function ext(file: File): string {
  return file.name.split('.').pop() || 'bin';
}
