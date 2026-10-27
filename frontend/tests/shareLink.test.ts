// 링크 공유의 분기 — 클립보드 우선, 없거나 실패하면 Web Share, 사용자 취소는 실패가 아니다.
// 취소를 실패로 세면 "공유하지 못했어요" 토스트가 정상 동작에 뜬다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareLink } from '@/utils/shareLink';

const stubNavigator = (value: object): void => {
  vi.stubGlobal('navigator', value);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shareLink', () => {
  it('클립보드가 있으면 링크를 복사한다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } });

    await expect(shareLink('https://dero.co.kr/desk-feed/12', '내 책상')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://dero.co.kr/desk-feed/12');
  });

  it('클립보드가 없으면 Web Share로 넘어간다 — http 접속·구형 브라우저', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share });

    await expect(shareLink('https://dero.co.kr/desk-feed/12', '내 책상')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({
      title: '내 책상',
      url: 'https://dero.co.kr/desk-feed/12',
    });
  });

  it('클립보드가 실패해도 Web Share로 넘어간다', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      share,
    });

    await expect(shareLink('https://dero.co.kr/desk-feed/12', '내 책상')).resolves.toBe('shared');
  });

  it('사용자가 공유 시트를 닫으면 취소다 — 실패로 세지 않는다', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    stubNavigator({ share: vi.fn().mockRejectedValue(abort) });

    await expect(shareLink('https://dero.co.kr/desk-feed/12', '내 책상')).resolves.toBe(
      'cancelled',
    );
  });

  it('둘 다 없으면 실패다', async () => {
    stubNavigator({});

    await expect(shareLink('https://dero.co.kr/desk-feed/12', '내 책상')).resolves.toBe('failed');
  });
});
