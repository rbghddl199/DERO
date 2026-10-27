'use client';
// 관리자 약관 편집기 — 기존 행은 보존하고 Markdown 본문 업로드 후 새 revision을 발행한다.

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import {
  fetchTermsContent,
  listAdminTerms,
  publishTermsRevision,
  type AdminTermsResponse,
} from '@/api/admin/terms';
import InlineNotice from '@/components/common/InlineNotice';
import LoadingState from '@/components/common/LoadingState';
import {
  MASTER_INPUT_CLASS,
  MASTER_PRIMARY_BUTTON_CLASS,
  MASTER_TABLE_CELL_CLASS,
  MASTER_TABLE_HEAD_CLASS,
} from '@/constants/admin/masters';
import {
  isManagedTermsCode,
  TERMS_CODES,
  TERMS_DRAFTS,
  TERMS_LABELS,
  TERMS_REQUIRED,
  type TermsCode,
} from '@/constants/admin/termsDrafts';

const localDateTimeValue = (): string => {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return now.toISOString().slice(0, 16);
};

const TermsAdmin = () => {
  const [items, setItems] = useState<AdminTermsResponse[] | null>(null);
  const [selectedCode, setSelectedCode] = useState<TermsCode>('TERMS_OF_SERVICE');
  const [title, setTitle] = useState(TERMS_LABELS.TERMS_OF_SERVICE);
  const [content, setContent] = useState(TERMS_DRAFTS.TERMS_OF_SERVICE);
  const [required, setRequired] = useState(true);
  const [effectiveAt, setEffectiveAt] = useState(localDateTimeValue);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const load = async () => {
    try {
      setItems(await listAdminTerms());
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '약관 이력을 불러오지 못했습니다.',
      });
    }
  };

  useEffect(() => {
    let isActive = true;
    listAdminTerms()
      .then((loaded) => {
        if (isActive) setItems(loaded);
      })
      .catch((error: unknown) => {
        if (isActive) {
          setMessage({
            type: 'error',
            text: error instanceof Error ? error.message : '약관 이력을 불러오지 못했습니다.',
          });
        }
      });
    return () => {
      isActive = false;
    };
  }, []);

  const visibleItems = useMemo(
    () => (items ?? []).filter((item) => isManagedTermsCode(item.code)),
    [items],
  );

  const latestByCode = useMemo(() => {
    const latest = new Map<string, AdminTermsResponse>();
    for (const item of visibleItems) {
      if (!latest.has(item.code)) latest.set(item.code, item);
    }
    return latest;
  }, [visibleItems]);

  const selectCode = async (code: TermsCode) => {
    setSelectedCode(code);
    setMessage(null);
    const latest = latestByCode.get(code);
    setTitle(latest?.title ?? TERMS_LABELS[code]);
    setRequired(latest?.required ?? TERMS_REQUIRED[code]);
    setEffectiveAt(localDateTimeValue());
    if (!latest?.contentUrl) {
      setContent(TERMS_DRAFTS[code]);
      return;
    }
    setIsLoadingContent(true);
    try {
      setContent(await fetchTermsContent(latest.contentUrl));
    } catch (error) {
      setContent(TERMS_DRAFTS[code]);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '본문을 불러오지 못했습니다.',
      });
    } finally {
      setIsLoadingContent(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !content.trim() || !effectiveAt) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      const created = await publishTermsRevision({
        code: selectedCode,
        title: title.trim(),
        content,
        required,
        effectiveAt: new Date(effectiveAt).toISOString(),
      });
      setMessage({
        type: 'success',
        text: `${created.title} ${created.revision}회차를 발행했습니다.`,
      });
      await load();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '약관을 발행하지 못했습니다.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items === null && message === null) {
    return <LoadingState label="약관 불러오는 중" description="개정 이력을 확인하고 있습니다." />;
  }

  return (
    <div>
      <h1 className="text-ink text-[28px] font-bold">약관 관리</h1>
      <p className="text-ash mt-2 text-[15px] leading-6">
        기존 약관은 수정하거나 삭제하지 않습니다. 편집한 내용은 새 개정 회차로 발행되며 시행
        시각부터 사용자에게 노출됩니다.
      </p>

      {message ? (
        <div className="mt-5">
          <InlineNotice variant={message.type} message={message.text} />
        </div>
      ) : null}

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="border-ash/20 mt-8 rounded-2xl border p-6"
      >
        <div className="grid grid-cols-2 gap-4">
          <label className="text-ink flex flex-col gap-2 text-sm font-semibold">
            동의 항목
            <select
              value={selectedCode}
              onChange={(event) => void selectCode(event.target.value as TermsCode)}
              className={MASTER_INPUT_CLASS}
            >
              {TERMS_CODES.map((code) => (
                <option key={code} value={code}>
                  {TERMS_LABELS[code]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-ink flex flex-col gap-2 text-sm font-semibold">
            시행 시각
            <input
              type="datetime-local"
              value={effectiveAt}
              onChange={(event) => setEffectiveAt(event.target.value)}
              required
              className={MASTER_INPUT_CLASS}
            />
          </label>
        </div>

        <label className="text-ink mt-4 flex flex-col gap-2 text-sm font-semibold">
          제목
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            required
            className={MASTER_INPUT_CLASS}
          />
        </label>

        <label className="text-ink mt-4 flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={required}
            onChange={(event) => setRequired(event.target.checked)}
            className="size-4"
          />
          필수 동의 항목
        </label>

        <label className="text-ink mt-4 flex flex-col gap-2 text-sm font-semibold">
          본문 (Markdown)
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={24}
            required
            disabled={isLoadingContent}
            className={`${MASTER_INPUT_CLASS} resize-y font-mono text-[13px] leading-6`}
          />
        </label>

        <div className="mt-5 flex items-center justify-between">
          <p className="text-ash text-[13px]">
            현재 최신 회차: {latestByCode.get(selectedCode)?.revision ?? 0}회차
          </p>
          <button
            type="submit"
            disabled={isSubmitting || isLoadingContent}
            className={MASTER_PRIMARY_BUTTON_CLASS}
          >
            {isSubmitting ? '발행 중…' : '새 개정 회차 발행'}
          </button>
        </div>
      </form>

      <section className="mt-8 overflow-x-auto">
        <h2 className="text-ink mb-4 text-[18px] font-semibold">개정 이력</h2>
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <th className={MASTER_TABLE_HEAD_CLASS}>항목</th>
              <th className={MASTER_TABLE_HEAD_CLASS}>회차</th>
              <th className={MASTER_TABLE_HEAD_CLASS}>필수</th>
              <th className={MASTER_TABLE_HEAD_CLASS}>시행 시각</th>
              <th className={MASTER_TABLE_HEAD_CLASS}>본문</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id}>
                <td className={MASTER_TABLE_CELL_CLASS}>{item.title}</td>
                <td className={`${MASTER_TABLE_CELL_CLASS} tabular-nums`}>{item.revision}</td>
                <td className={MASTER_TABLE_CELL_CLASS}>{item.required ? '필수' : '선택'}</td>
                <td className={`${MASTER_TABLE_CELL_CLASS} tabular-nums`}>
                  {new Date(item.effectiveAt).toLocaleString('ko-KR')}
                </td>
                <td className={MASTER_TABLE_CELL_CLASS}>
                  {item.contentUrl ? (
                    <a
                      href={item.contentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      보기
                    </a>
                  ) : (
                    '없음'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};

export default TermsAdmin;
