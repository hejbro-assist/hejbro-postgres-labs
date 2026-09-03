/**
 * portable core 샘플 스키마.
 *
 * 네 provider(neon, nile, supabase, postgres)가 모두 받아들이는 객체만 쓴다:
 * schema, table, column, PK, FK, CHECK, index. RLS·함수·트리거·role·grant·view는
 * 이 변경에서 선언하지 않는다 (Nile preset이 RLS와 함수를 거부한다).
 *
 * CHECK 와 partial index 술어는 열을 보간하지 않는 raw sql 로 쓴다. hejbro 가 열 참조를
 * `"lab"."projects"."name"` 처럼 3단계로 렌더링하면 Nile 이 12바이트 스키마 이름 오류(42622)로
 * 거부하기 때문이다 (findings/2026-09-03-nile-rejects-qualified-column-refs.md). 대신 rename
 * 추적은 포기한다.
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
	schema,
	sql,
	table,
	text,
	timestamptz,
	uuid,
} from "hejbro";

const TASK_STATUSES = ["todo", "doing", "done"] as const;
const DEFAULT_TASK_STATUS = "todo";

export const lab = schema("lab");

export const projects = table(
	lab,
	"projects",
	{
		tenantId: uuid().primaryKey(),
		id: uuid().primaryKey().defaultRandom(),
		name: text().notNull(),
		archivedAt: timestamptz(),
		createdAt: timestamptz().notNull().defaultNow(),
	},
	(t) => ({
		indexes: [index().on(t.tenantId).where(sql`archived_at is null`)],
		checks: [check("projects_name_not_blank", sql`length(btrim(name)) > 0`)],
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
		position: integer().notNull().default(0),
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
			check("tasks_title_not_blank", sql`length(btrim(title)) > 0`),
			check("tasks_status_allowed", sql`status in (${sql.raw(TASK_STATUSES.map((status) => `'${status}'`).join(", "))})`),
		],
	}),
);
