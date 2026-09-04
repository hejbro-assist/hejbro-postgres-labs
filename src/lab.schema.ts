/**
 * portable core 샘플 스키마.
 *
 * 네 provider(neon, nile, supabase, postgres)가 모두 받아들이는 객체만 쓴다:
 * schema, table, column, PK, FK, CHECK, index. RLS·함수·트리거·role·grant·view는
 * 이 변경에서 선언하지 않는다 (Nile preset이 RLS와 함수를 거부한다).
 *
 * CHECK 와 partial index 술어는 열을 보간한다(`${t.name}`, `isNull(t.archivedAt)`). hejbro
 * 0.2.0-pre.0 은 열 참조를 `"lab"."projects"."name"` 처럼 3단계로 렌더링해 Nile 이 42622 로 거부했고
 * 그때는 raw 텍스트로 우회했다(findings/2026-09-03-nile-rejects-qualified-column-refs.md).
 * 0.2.0-pre.1 부터 `"projects"."name"` 2단계로 렌더링하므로(#754) 보간으로 되돌려 rename 추적을 복구한다.
 *
 * 모든 테이블은 `tenant_id uuid not null`을 갖고, primary key는 `(tenant_id, id)` 복합 키다.
 * Nile은 tenant-aware 테이블의 PK에 tenant_id가 포함되기를 요구하고(42P17), 다른
 * provider에서는 평범한 복합 PK다. 외래 키도 `(tenant_id, project_id) → (tenant_id, id)`로
 * 테넌트 열을 함께 실어 어느 provider에서든 같은 SQL이 나오게 한다.
 */
import {
	check,
	inArray,
	index,
	integer,
	isNull,
	jsonb,
	op,
	pgEnum,
	schema,
	sql,
	table,
	text,
	timestamptz,
	uuid,
} from "hejbro";

const TASK_STATUSES = ["todo", "doing", "done"] as const;
const DEFAULT_TASK_STATUS = "todo";
const TASK_PRIORITIES = ["low", "normal", "high"] as const;
const DEFAULT_TASK_PRIORITY = "normal";

export const lab = schema("lab");

/** enum 경로 측정용. Nile 이 tenant-aware 테이블에서 사용자 정의 enum 을 받는지 본다. */
export const taskPriority = pgEnum(lab, "task_priority", TASK_PRIORITIES);

export const projects = table(
	lab,
	"projects",
	{
		tenantId: uuid().primaryKey(),
		id: uuid().primaryKey().defaultRandom(),
		// 0006 에서 name → title 로 바꿨다. CHECK 와 표현식 인덱스가 이 열을 참조하므로 rename 이 식을 되짚는지 본다.
		title: text().notNull(),
		archivedAt: timestamptz(),
		createdAt: timestamptz().notNull().defaultNow(),
		metadata: jsonb().notNull().default(sql`'{}'::jsonb`),
	},
	(t) => ({
		indexes: [
			index().on(t.tenantId).where(isNull(t.archivedAt)),
			// GIN + 연산자 클래스: jsonb 경로 측정.
			index("projects_metadata_idx").using("gin").on(op(t.metadata, "jsonb_path_ops")),
			// 표현식 + unique + partial: 테넌트 안에서 살아 있는 프로젝트 이름은 대소문자 무시 유일.
			index("projects_tenant_id_lower_name_key")
				.unique()
				.on(t.tenantId, sql`lower(${t.title})`)
				.where(isNull(t.archivedAt)),
		],
		checks: [check("projects_name_not_blank", sql`length(btrim(${t.title})) > 0`)],
	}),
);



export const tasks = table(
	lab,
	"tasks",
	{
		tenantId: uuid().primaryKey(),
		id: uuid().primaryKey().defaultRandom(),
		projectId: uuid().notNull(),
		title: text().notNull(),
		status: text().notNull().default(DEFAULT_TASK_STATUS),
		priority: taskPriority.column().notNull().default(DEFAULT_TASK_PRIORITY),
		sortOrder: integer().notNull().default(0),
		createdAt: timestamptz().notNull().defaultNow(),
	},
	(t) => ({
		// onDelete가 필요하고 복합 키를 참조하므로 column-level .references() 대신 extras.foreignKeys를 쓴다.
		foreignKeys: [
			{
				columns: [t.tenantId, t.projectId],
				references: { table: projects, columns: [projects.tenantId, projects.id] },
				onDelete: "cascade",
			},
		],
		indexes: [index().on(t.tenantId, t.status)],
		checks: [
			check("tasks_title_not_blank", sql`length(btrim(${t.title})) > 0`),
			check("tasks_status_allowed", inArray(t.status, TASK_STATUSES)),
		],
	}),
);
