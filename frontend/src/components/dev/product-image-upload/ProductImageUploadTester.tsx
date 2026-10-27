// presigned URL 발급 → S3 직접 PUT 업로드 흐름을 눈으로 확인하는 데브 전용 도구.
'use client';

import { useState } from 'react';
import { requestProductImageUploadUrl, uploadToPresignedUrl } from '@/api/productImage';

type Step = 'idle' | 'presigning' | 'uploading' | 'done' | 'error';

const ProductImageUploadTester = () => {
  const [file, setFile] = useState<File | null>(null);
  // 발급 경로가 POST /products/{id}/images/upload-urls로 바뀌면서 대상 제품이 필수가 됐다
  // (api-spec.md §11 — 옛 /products/images/presign은 대상이 없어 권한 검사를 걸 자리가 없었다).
  const [productId, setProductId] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [imageKey, setImageKey] = useState<string | null>(null);

  const appendLog = (message: string) => {
    setLog((prev) => [...prev, message]);
  };

  const handleUpload = async () => {
    if (!file || !productId) return;

    setLog([]);
    setImageKey(null);

    try {
      setStep('presigning');
      appendLog(`presigned URL 요청 중... (fileName=${file.name}, contentType=${file.type})`);
      const presign = await requestProductImageUploadUrl(Number(productId), {
        fileName: file.name,
        contentType: file.type,
      });
      appendLog(`presigned URL 발급 완료 — imageKey=${presign.imageKey}`);

      setStep('uploading');
      appendLog('S3로 파일 업로드 중...');
      await uploadToPresignedUrl(presign.uploadUrl, file);
      appendLog('S3 업로드 완료.');

      setImageKey(presign.imageKey);
      setStep('done');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      appendLog(`실패: ${message}`);
      setStep('error');
    }
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold text-neutral-800">
        제품 대표이미지 presigned 업로드 테스트
      </h1>

      <input
        type="number"
        placeholder="대상 제품 id"
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        className="rounded border border-neutral-300 p-2"
      />

      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="rounded border border-neutral-300 p-2"
      />

      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || !productId || step === 'presigning' || step === 'uploading'}
        className="rounded bg-neutral-800 px-4 py-2 text-white disabled:opacity-40"
      >
        업로드
      </button>

      {imageKey && (
        <p className="text-sm text-neutral-700">
          product.image_key에 저장할 값: <code>{imageKey}</code>
        </p>
      )}

      <pre className="rounded bg-neutral-100 p-3 text-xs whitespace-pre-wrap text-neutral-600">
        {log.join('\n')}
      </pre>
    </div>
  );
};

export default ProductImageUploadTester;
