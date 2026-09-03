# findings

hejbro를 써 보며 발견한 버그, 개선점, 기능 요청, 질문, 적용 사례를 한 건당 파일 하나로 기록하고 [hejbro Discussions](https://github.com/quickstart-now/hejbro/discussions)에 올린다.

## 파일 이름

`YYYY-MM-DD-<slug>.md`. `_template.md`를 복사해서 시작한다.

## frontmatter 필드

| 필드 | 값 | 설명 |
|---|---|---|
| `title` | 문자열 | Discussion 제목이 된다 |
| `hejbro_version` | 예: `0.2.0-pre.0` | 발견 당시 hejbro 버전 |
| `provider` | `neon` `nile` `supabase` `postgres` `all` | 어느 타깃에서 발견했는지 |
| `kind` | `bug` `improvement` `feature` `question` `showcase` | 분류. 아래 카테고리 대응을 결정한다 |
| `status` | `draft` `posted` `resolved` | `post`가 `posted`로 바꾼다 |
| `discussion` | URL 또는 빈 값 | `post`가 채운다. 값이 있으면 다시 게시하지 않는다 |

`bug`와 `improvement`는 본문에 `## 재현 절차`, `## 기대 결과`, `## 실제 결과` 섹션이 있어야 한다.

## kind → Discussions 카테고리

| kind | 카테고리 |
|---|---|
| `bug`, `question` | Q&A |
| `improvement`, `feature` | Ideas |
| `showcase` | Show and tell |

## 명령

```bash
pnpm finding validate findings/2026-09-03-example.md   # 한 파일 검증
pnpm finding validate all                              # findings/ 전체 검증 (CI가 실행)
pnpm finding post findings/2026-09-03-example.md       # Discussions에 게시 (hejbro-assist 계정)
```

`post`는 게시 전에 secretlint로 본문을 검사하고, 접속 문자열 같은 비밀이 있으면 거부한다. 본문에는 host 이름도 적지 않는 것을 권장한다.
