// admin — presigned URL로 스토리지에 파일을 직접 PUT하는 헬퍼. apiClient는 Content-Type을
// application/json으로 강제하므로 여기서만 맨 fetch를 쓴다(선례: src/api/productImage.ts).

// contentType은 presign을 요청할 때 보낸 값과 반드시 같아야 한다 — 다르면 서명 검증에서 거절된다.
// GLB처럼 브라우저가 File.type을 못 채우는 확장자가 있어 파일에서 유추하지 않고 인자로 받는다.
export async function putToPresignedUrl(
  uploadUrl: string,
  file: Blob,
  contentType: string,
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`파일 업로드에 실패했습니다. (status: ${response.status})`);
  }
}
