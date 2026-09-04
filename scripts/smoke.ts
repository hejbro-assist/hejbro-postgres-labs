/**
 * hejbro 쿼리 레이어 실측. `pnpm target <name> smoke` 가 DATABASE_URL 과 LAB_TARGET 을 env 로 넣어 띄운다.
 *
 * 1. 타깃별 드라이버로 db() 핸들을 만든다 (postgres·neon: pgDriver, nile: nileDriver + asTenant 컨텍스트,
 *    supabase: supabaseDriver session 경로).
 * 2. assertSchema 로 선언과 카탈로그 일치를 먼저 단언한다. 어긋나면 데이터 단계는 실행하지 않는다.
 * 3. 트랜잭션 하나 안에서 insert → 다중 insert → upsert → join select → 중첩 읽기 → 중첩 트랜잭션 롤백 →
 *    cascade delete 를 돌리고 단계마다 기대값과 비교한다. 끝나면 행이 남지 않는다.
 * 4. Nile 은 실측 전에 테넌트를 등록하고 끝나면 지운다.
 *
 * 출력에는 접속 문자열을 절대 찍지 않는다 (부모 프로세스가 마스킹도 한다).
 */
import { asTenant, nileDriver } from "@hejbro/nile";
import { pgDriver } from "@hejbro/pg";
import { supabaseDriver } from "@hejbro/supabase";
import { and, assertSchema, compile, count, db, eq, jsonArrayFrom, select, sql } from "hejbro";
import type { Driver } from "hejbro";
import * as lab from "../src/lab.schema.ts";

const { projects, tasks } = lab;

const TARGET_ENV_NAME = "LAB_TARGET";
const TARGETS = ["postgres", "neon", "nile", "supabase"] as const;
type TargetName = (typeof TARGETS)[number];

/** 고정 테넌트. 실패한 이전 실행이 남긴 행은 시작할 때 이 id 로 지운다. */
const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const TENANT_LABEL = "hejbro-labs smoke";
const PROJECT_TITLE = "smoke project";
const FIRST_TASK = "first";
const SECOND_TASK = "second";
const SECOND_TASK_UPDATED = "second (upserted)";
const BLANK_TITLE = "   ";
const CHECK_VIOLATION = "23514";
const EXPECTED_TASKS = 2;
const ONE_ROW = 1;
const NO_ROWS = 0;

const isTargetName = (value: string): value is TargetName => TARGETS.some((name) => name === value);

const readEnvOrExit = (name: string): string => {
	const value = process.env[name];
	if (value === undefined || value === "") {
		console.error(`error: ${name} 이 비어 있습니다. pnpm target <name> smoke 로 실행하세요.`);
		process.exit(1);
	}
	return value;
};

type BuiltDriver = {
	readonly driver: Driver;
	/** 종료 시 pool 을 닫기 위한 원본. 장식된 드라이버에는 client 가 없다. */
	readonly close: () => Promise<void>;
};

const buildDriver = (target: TargetName, url: string): BuiltDriver => {
	const base = pgDriver(url);
	const close = (): Promise<void> => base.client.end();
	if (target === "nile") {
		return { driver: nileDriver(base), close };
	}
	if (target === "supabase") {
		return { driver: supabaseDriver(base), close };
	}
	return { driver: base, close };
};

const buildHandle = (target: TargetName, driver: Driver) => {
	if (target === "nile") {
		return db(lab, driver, { context: () => asTenant(TENANT_ID) });
	}
	return db(lab, driver);
};

type ErrorDetails = {
	readonly code: string;
	readonly sqlstate: string;
	readonly message: string;
};

/** hejbro 오류(code)와 pg 오류(SQLSTATE 는 code 필드에 온다)를 한 줄로 요약한다. cause 를 한 단계 따라간다. */
const describeError = (error: unknown): ErrorDetails => {
	const record = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
	const cause = typeof record["cause"] === "object" && record["cause"] !== null ? (record["cause"] as Record<string, unknown>) : {};
	const ownCode = typeof record["code"] === "string" ? record["code"] : "";
	const causeCode = typeof cause["code"] === "string" ? cause["code"] : "";
	const looksLikeSqlstate = (value: string): boolean => /^[0-9A-Z]{5}$/.test(value);
	const sqlstate = [ownCode, causeCode].find(looksLikeSqlstate) ?? "-";
	const code = [ownCode, causeCode].find((value) => value !== "" && !looksLikeSqlstate(value)) ?? "-";
	const message = error instanceof Error ? error.message : String(error);
	return { code, sqlstate, message };
};

class StepFailure extends Error {
	readonly step: string;
	readonly details: ErrorDetails;

	constructor(step: string, details: ErrorDetails) {
		super(`step ${step} failed: code=${details.code} sqlstate=${details.sqlstate} ${details.message}`);
		this.step = step;
		this.details = details;
	}
}

/** 단계 하나를 실행해 결과를 한 줄로 찍는다. 실패는 단계 이름을 붙여 다시 던진다. */
const step = async <T>(name: string, run: () => PromiseLike<T>, render: (value: T) => string): Promise<T> => {
	try {
		const value = await run();
		console.log(`step ${name}: ${render(value)}`);
		return value;
	} catch (error: unknown) {
		if (error instanceof StepFailure) {
			throw error;
		}
		throw new StepFailure(name, describeError(error));
	}
};

const expectEqual = (name: string, actual: unknown, expected: unknown): void => {
	if (actual !== expected) {
		throw new StepFailure(name, { code: "expectation", sqlstate: "-", message: `expected ${String(expected)}, got ${String(actual)}` });
	}
};

const main = async (): Promise<number> => {
	const targetValue = readEnvOrExit(TARGET_ENV_NAME);
	if (!isTargetName(targetValue)) {
		console.error(`error: 알 수 없는 타깃 '${targetValue}'. 유효한 타깃: ${TARGETS.join(", ")}`);
		return 1;
	}
	const target = targetValue;
	const { driver, close } = buildDriver(target, readEnvOrExit("DATABASE_URL"));
	const handle = buildHandle(target, driver);
	const isNile = target === "nile";

	try {
		await step(
			"assertSchema",
			() => assertSchema(handle),
			(report) => `compared ${report.compared.length}, not compared ${report.notCompared.length}`,
		);
		if (isNile) {
			// 테넌트 등록은 tenant-aware 테이블이 아니라 컨텍스트 없이 드라이버로 직접 보낸다.
			await step(
				"nile.registerTenant",
				() => driver.execute(compile(sql`insert into public.tenants (id, name) values (${TENANT_ID}, ${TENANT_LABEL}) on conflict (id) do nothing`)),
				() => "ok",
			);
		}
		await step(
			"cleanupLeftovers",
			() => handle.deleteFrom(projects).where(eq(projects.tenantId, TENANT_ID)).returning({ id: projects.id }),
			(rows) => `${rows.length} stale project(s) removed`,
		);

		await handle.transaction(async (tx) => {
			const [project] = await step(
				"insertProject",
				() => tx.insert(projects).values({ tenantId: TENANT_ID, title: PROJECT_TITLE }).returning({ id: projects.id }),
				(rows) => `${rows.length} row`,
			);
			if (project === undefined) {
				throw new StepFailure("insertProject", { code: "expectation", sqlstate: "-", message: "no row returned" });
			}
			const projectId = project.id;

			const inserted = await step(
				"insertTasks",
				() =>
					tx
						.insert(tasks)
						.values([
							{ tenantId: TENANT_ID, projectId, title: FIRST_TASK, sortOrder: 1 },
							{ tenantId: TENANT_ID, projectId, title: SECOND_TASK, sortOrder: 2, priority: "urgent" },
						])
						.returning({ id: tasks.id, title: tasks.title }),
				(rows) => `${rows.length} rows`,
			);
			expectEqual("insertTasks", inserted.length, EXPECTED_TASKS);
			const second = inserted.find((row) => row.title === SECOND_TASK);
			if (second === undefined) {
				throw new StepFailure("insertTasks", { code: "expectation", sqlstate: "-", message: "second task missing" });
			}

			const upserted = await step(
				"upsertTask",
				() =>
					tx
						.insert(tasks)
						.values({ tenantId: TENANT_ID, id: second.id, projectId, title: SECOND_TASK_UPDATED })
						.onConflictDoUpdate({ target: [tasks.tenantId, tasks.id], set: { title: SECOND_TASK_UPDATED } })
						.returning({ title: tasks.title }),
				(rows) => rows.map((row) => row.title).join(", "),
			);
			expectEqual("upsertTask", upserted[0]?.title, SECOND_TASK_UPDATED);

			const joined = await step(
				"joinSelect",
				() =>
					tx
						.select({ taskId: tasks.id, projectTitle: projects.title, priority: tasks.priority }, tasks)
						.innerJoin(projects, and(eq(tasks.tenantId, projects.tenantId), eq(tasks.projectId, projects.id)))
						.where(eq(tasks.projectId, projectId))
						.orderBy(tasks.sortOrder),
				(rows) => `${rows.length} rows, project "${rows[0]?.projectTitle ?? ""}", priorities ${rows.map((row) => row.priority).join("/")}`,
			);
			expectEqual("joinSelect", joined.length, EXPECTED_TASKS);

			const nested = await step(
				"nestedRead",
				() =>
					tx
						.select(
							{
								id: projects.id,
								metadata: projects.metadata,
								tasks: jsonArrayFrom(
									select({ id: tasks.id, title: tasks.title }, tasks)
										.where(and(eq(tasks.tenantId, projects.tenantId), eq(tasks.projectId, projects.id)))
										.orderBy(tasks.sortOrder),
								),
							},
							projects,
						)
						.where(and(eq(projects.tenantId, TENANT_ID), eq(projects.id, projectId))),
				(rows) => `${rows[0]?.tasks.length ?? 0} nested tasks, metadata ${JSON.stringify(rows[0]?.metadata)}`,
			);
			expectEqual("nestedRead", nested[0]?.tasks.length, EXPECTED_TASKS);

			const viewRows = await step(
				"viewSelect",
				() => tx.execute(sql`select count(*)::int as n from "lab"."open_tasks" where "tenant_id" = ${TENANT_ID}`),
				(rows) => `${String(rows[0]?.["n"])} rows in open_tasks`,
			);
			expectEqual("viewSelect", viewRows[0]?.["n"], EXPECTED_TASKS);

			const rolledBack = await step(
				"nestedRollback",
				async () => {
					try {
						await tx.transaction(async (inner) => {
							await inner.insert(tasks).values({ tenantId: TENANT_ID, projectId, title: BLANK_TITLE });
						});
						return "no error";
					} catch (error: unknown) {
						return describeError(error).sqlstate;
					}
				},
				(sqlstate) => `inner insert refused with ${sqlstate}, outer transaction continues`,
			);
			expectEqual("nestedRollback", rolledBack, CHECK_VIOLATION);

			const afterRollback = await step(
				"countAfterRollback",
				() => tx.select({ n: count() }, tasks).where(eq(tasks.projectId, projectId)),
				(rows) => `${String(rows[0]?.n)} tasks`,
			);
			expectEqual("countAfterRollback", afterRollback[0]?.n, BigInt(EXPECTED_TASKS));

			const deleted = await step(
				"deleteProjectCascade",
				() => tx.deleteFrom(projects).where(and(eq(projects.tenantId, TENANT_ID), eq(projects.id, projectId))).returning({ id: projects.id }),
				(rows) => `${rows.length} project deleted`,
			);
			expectEqual("deleteProjectCascade", deleted.length, ONE_ROW);

			const remaining = await step(
				"countAfterCascade",
				() => tx.select({ n: count() }, tasks).where(eq(tasks.projectId, projectId)),
				(rows) => `${String(rows[0]?.n)} tasks left`,
			);
			expectEqual("countAfterCascade", remaining[0]?.n, BigInt(NO_ROWS));
		});

		if (isNile) {
			await step(
				"nile.removeTenant",
				() => driver.execute(compile(sql`delete from public.tenants where id = ${TENANT_ID}`)),
				() => "ok",
			);
		}
		console.log(`smoke ${target}: ok`);
		return 0;
	} catch (error: unknown) {
		if (error instanceof StepFailure) {
			console.error(error.message);
			return 1;
		}
		const details = describeError(error);
		console.error(`smoke ${target} failed: code=${details.code} sqlstate=${details.sqlstate} ${details.message}`);
		return 1;
	} finally {
		await close().catch(() => undefined);
	}
};

process.exit(await main());
