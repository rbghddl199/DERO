// valid·malformed ProblemDetail과 Auth code/status pair mapping을 검증한다.

import { describe, expect, it } from 'vitest';
import { AUTH_ERROR_CODES } from '@/constants/auth/errorCodes';
import { mapAuthProblemDetail, parseProblemDetail } from '@/utils/auth/problemDetail';

function problem(code: string, status: number) {
  return {
    type: 'about:blank',
    title: status === 403 ? 'Forbidden' : 'Unauthorized',
    status,
    detail: '인증 상태를 확인할 수 없습니다.',
    instance: '/api/v1/example',
    code,
    errors: null,
    futureExtension: 'ignored',
  };
}

describe('ProblemDetail parser', () => {
  it('ADR-0008 core field와 FieldError 배열을 검증한다', () => {
    const parsed = parseProblemDetail({
      ...problem('INVALID_INPUT', 400),
      errors: [{ field: 'name', reason: '필수입니다.' }],
    });

    expect(parsed).toEqual({
      ok: true,
      data: {
        type: 'about:blank',
        title: 'Unauthorized',
        status: 400,
        detail: '인증 상태를 확인할 수 없습니다.',
        instance: '/api/v1/example',
        code: 'INVALID_INPUT',
        errors: [{ field: 'name', reason: '필수입니다.' }],
      },
    });
  });

  it.each([
    null,
    {},
    { ...problem(AUTH_ERROR_CODES.unauthorized, 401), errors: undefined },
    { ...problem(AUTH_ERROR_CODES.unauthorized, 401), status: 401.5 },
    { ...problem('auth unauthorized', 401) },
    { ...problem(AUTH_ERROR_CODES.unauthorized, 401), errors: [{}] },
  ])('malformed payload를 fail-closed한다', (payload) => {
    expect(parseProblemDetail(payload)).toMatchObject({
      ok: false,
      failure: { code: AUTH_ERROR_CODES.unclassifiedApiError },
    });
  });
});

describe('Auth ProblemDetail mapping', () => {
  it.each([
    [AUTH_ERROR_CODES.unauthorized, 401],
    [AUTH_ERROR_CODES.sessionRevoked, 401],
    [AUTH_ERROR_CODES.forbidden, 403],
  ] as const)('%s와 HTTP %i pair만 stable failure로 매핑한다', (code, status) => {
    expect(mapAuthProblemDetail(problem(code, status), status)).toMatchObject({
      code,
      httpStatus: status,
      problem: { code, status },
    });
  });

  it('body status mismatch에서 Auth side effect code를 실행하지 않는다', () => {
    expect(mapAuthProblemDetail(problem(AUTH_ERROR_CODES.sessionRevoked, 401), 403)).toMatchObject({
      code: AUTH_ERROR_CODES.contractMismatch,
      httpStatus: 403,
    });
  });

  it('알 수 없는 stable code는 일반 오류로 전달한다', () => {
    expect(mapAuthProblemDetail(problem('FUTURE_AUTH_ERROR', 401), 401)).toMatchObject({
      code: AUTH_ERROR_CODES.unclassifiedApiError,
      httpStatus: 401,
      problem: { code: 'FUTURE_AUTH_ERROR' },
    });
  });
});
