/**
 * portable core 샘플 스키마.
 *
 * 네 provider(neon, nile, supabase, postgres)가 모두 받아들이는 객체만 쓴다:
 * schema, table, column, PK, FK, CHECK, index. RLS·함수·트리거·role·grant·view는
 * 이 변경에서 선언하지 않는다 (Nile preset이 RLS와 함수를 거부한다).
 *
 * 모든 테이블은 `tenant_id uuid not null`을 갖는다. Nile은 이 열로 테넌트 테이블을
 * 식별하고, 다른 provider에서는 평범한 열이다.
 */
import {
	check,
	index,
	isNull,
	schema,
	sql,
	table,
	text,
	timestamptz,
	uuid,
} from "hejbro";

export const lab = schema("lab");

export const projects = table(
	lab,
	"projects",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid().notNull(),
		name: text().notNull(),
		archivedAt: timestamptz(),
		createdAt: timestamptz().notNull().defaultNow(),
	},
	(t) => ({
		indexes: [index().on(t.tenantId).where(isNull(t.archivedAt))],
		checks: [check("projects_name_not_blank", sql`length(btrim(${t.name})) > 0`)],
	}),
);
