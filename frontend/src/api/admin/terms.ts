// 관리자 약관 관리 — 전체 개정 이력 조회, Markdown 본문 업로드, 새 revision 발행.

import { adminClient, withQuery } from '@/api/admin/client';
import { putToPresignedUrl } from '@/api/admin/uploads';

export interface AdminTermsResponse {
  id: number;
  code: string;
  revision: number;
  title: string;
  contentKey: string | null;
  contentUrl: string | null;
  required: boolean;
  effectiveAt: string;
}

interface ContentUploadUrlResponse {
  contentKey: string;
  uploadUrl: string;
}

export interface PublishTermsRequest {
  code: string;
  title: string;
  content: string;
  required: boolean;
  effectiveAt: string;
}

export function listAdminTerms(): Promise<AdminTermsResponse[]> {
  return adminClient.get<AdminTermsResponse[]>('/admin/terms');
}

export async function fetchTermsContent(contentUrl: string): Promise<string> {
  const response = await fetch(contentUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error('약관 본문을 불러오지 못했습니다.');
  return response.text();
}

export async function publishTermsRevision(
  request: PublishTermsRequest,
): Promise<AdminTermsResponse> {
  const contentType = 'text/markdown';
  const presigned = await adminClient.post<ContentUploadUrlResponse>(
    withQuery('/admin/terms/content/upload-url', { code: request.code }),
    { fileName: `${request.code.toLowerCase()}.md`, contentType },
  );
  await putToPresignedUrl(
    presigned.uploadUrl,
    new Blob([request.content], { type: contentType }),
    contentType,
  );
  return adminClient.post<AdminTermsResponse>('/admin/terms', {
    code: request.code,
    title: request.title,
    contentKey: presigned.contentKey,
    required: request.required,
    effectiveAt: request.effectiveAt,
  });
}
