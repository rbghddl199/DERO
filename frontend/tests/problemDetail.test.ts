// ADR-0008 ProblemDetail 형태 검증 — auth 전용이 아닌 도메인 공통 파서.
import { describe, expect, it } from 'vitest';
import { parseApiProblemDetail } from '@/utils/problemDetail';

function problem(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Not Found',
    status: 404,
    detail: '제품을 찾을 수 없습니다.',
    instance: '/api/v1/products/999',
    code: 'PRODUCT_NOT_FOUND',
    errors: null,
    ...overrides,
  };
}

describe('parseApiProblemDetail', () => {
  it('ADR-0008 core field를 검증해 그대로 돌려준다', () => {
    expect(parseApiProblemDetail(problem())).toEqual(problem());
  });

  it('errors 배열도 검증해 통과시킨다', () => {
    const withErrors = problem({ errors: [{ field: 'name', reason: '필수입니다.' }] });
    expect(parseApiProblemDetail(withErrors)).toEqual(withErrors);
  });

  // 백엔드 ProblemDetails.of는 errors를 안 싣는다 — 401·403·404·409가 전부 이 형태다.
  // 이걸 null로 떨어뜨리면 code가 사라져 401 자동 회전이 세션 종료를 만료로 오분류한다.
  it('errors 키가 아예 없어도 통과시키고 null로 채운다', () => {
    const { errors: _errors, ...withoutErrors } = problem();
    expect(parseApiProblemDetail(withoutErrors)).toEqual({ ...withoutErrors, errors: null });
  });

  it.each([
    null,
    {},
    problem({ errors: undefined }),
    problem({ status: 404.5 }),
    problem({ code: 'not stable' }),
    problem({ errors: [{}] }),
  ])('형태가 안 맞으면 null을 돌려준다(fail-closed)', (payload) => {
    expect(parseApiProblemDetail(payload)).toBeNull();
  });
});
