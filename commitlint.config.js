/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // 새 기능
        'fix',      // 버그 수정
        'docs',     // 문서
        'style',    // 코드 포맷 (기능 변경 없음)
        'refactor', // 리팩토링
        'test',     // 테스트
        'chore',    // 빌드, 설정 등 기타
        'perf',     // 성능 개선
        'ci',       // CI/CD
        'build',    // 빌드 시스템, 외부 의존성
        'revert',   // 커밋 되돌리기
      ],
    ],
    'header-max-length': [2, 'always', 72],
    'subject-empty': [2, 'never'],
    'subject-case': [2, 'always', 'lower-case'],
    'subject-full-stop': [2, 'never', '.'],
    'scope-case': [2, 'always', 'lower-case'],
    'body-max-line-length': [2, 'always', 100],
    'type-empty': [2, 'never'],
  },
};
