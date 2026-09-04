/**
 * provider 타깃을 이름으로 골라 hejbro 명령을 실행한다.
 *
 *   pnpm target <neon|nile|supabase|postgres> <migrate|status|check|reset> [hejbro 추가 인자]
 *   pnpm target <neon|nile|supabase|postgres> smoke              # 쿼리 레이어 실측 (scripts/smoke.ts)
 *   pnpm target <neon|nile|supabase|postgres> sql "<statement>"   # 결과를 JSON 줄로 출력
 *   pnpm target doctor
 *
 * 접속 문자열은 자식 프로세스의 환경 변수(DATABASE_URL)로만 전달하고 argv에는
 * 절대 싣지 않는다. 출력은 비밀번호를 마스킹한 뒤 그대로 흘려보낸다.
 *
 * hejbro 명령은 `hejbro.<target>.config.ts`가 있으면 그 설정으로 실행한다. `check`가 preset(예: nile의
 * explainUnavailable)을 알려면 설정 파일이 필요하기 때문이다. pre.1의 live 명령은 `--config`를 무시하므로
 * scripts/provider-workdir.ts 가 만든 작업 디렉터리를 cwd 로 삼는다.
 */
import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { prepareProviderWorkdir } from "./provider-workdir.ts";

const TARGET_VARIABLES = {
	neon: "NEON_DATABASE_URL",
	nile: "NILE_DATABASE_URL",
	supabase: "SUPABASE_DATABASE_URL",
	postgres: "POSTGRES_DATABASE_URL",
} as const;

type TargetName = keyof typeof TARGET_VARIABLES;

const HEJBRO_COMMANDS = ["migrate", "status", "check", "reset"] as const;

type HejbroCommand = (typeof HEJBRO_COMMANDS)[number];

const DOCTOR_COMMAND = "doctor";
const SQL_COMMAND = "sql";
const SMOKE_COMMAND = "smoke";
const SMOKE_SCRIPT = "scripts/smoke.ts";
const TARGET_ENV_NAME = "LAB_TARGET";
const HEJBRO_BIN = resolve("node_modules/.bin/hejbro");
const ENV_FILE = ".env";
const SECURE_MODE = 0o600;
const CONNECT_TIMEOUT_MILLISECONDS = 8000;
const MASK = "***";

const targetNames = Object.keys(TARGET_VARIABLES) as ReadonlyArray<TargetName>;

const isTargetName = (value: string): value is TargetName =>
	targetNames.some((name) => name === value);

const isHejbroCommand = (value: string): value is HejbroCommand =>
	HEJBRO_COMMANDS.some((command) => command === value);

type ParsedConnection = {
	readonly label: string;
	readonly password: string;
	readonly isLocal: boolean;
	readonly hasSslMode: boolean;
};

/** URL을 파싱해 host와 경로만 남긴다. 파싱에 실패해도 원문은 절대 출력하지 않는다. */
const parseConnection = (value: string): ParsedConnection | undefined => {
	try {
		const parsed = new URL(value);
		return {
			label: `${parsed.hostname}${parsed.pathname}`,
			password: decodeURIComponent(parsed.password),
			isLocal: parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1",
			hasSslMode: parsed.searchParams.has("sslmode"),
		};
	} catch (error: unknown) {
		return undefined;
	}
};

const maskSecret = (text: string, password: string): string => {
	if (password === "") {
		return text;
	}
	return text.split(password).join(MASK);
};

/** 로컬 타깃의 비밀번호는 .env.example 에 적힌 공개 기본값이라 마스킹하지 않는다 (타깃 이름과 겹쳐 출력을 망친다). */
const secretToMask = (connection: ParsedConnection): string => {
	if (connection.isLocal) {
		return "";
	}
	return connection.password;
};

const warnEnvFilePermissions = (): void => {
	const mode = (() => {
		try {
			return statSync(ENV_FILE).mode & 0o777;
		} catch (error: unknown) {
			return undefined;
		}
	})();
	if (mode !== undefined && mode !== SECURE_MODE) {
		console.warn(
			`warning: ${ENV_FILE} 권한이 ${mode.toString(8)} 입니다. chmod 600 ${ENV_FILE} 을 권장합니다.`,
		);
	}
};

const printUsageAndExit = (message: string): never => {
	console.error(message);
	console.error(
		`usage: pnpm target <${targetNames.join("|")}> <${HEJBRO_COMMANDS.join("|")}> [args]\n       pnpm target <name> ${SMOKE_COMMAND}\n       pnpm target <name> ${SQL_COMMAND} "<statement>"\n       pnpm target ${DOCTOR_COMMAND}`,
	);
	process.exit(1);
};

/** 타깃의 접속 문자열을 읽는다. 없으면 어떤 변수를 채울지만 알려 주고 종료한다. */
const readConnectionOrExit = (target: TargetName): string => {
	const variable = TARGET_VARIABLES[target];
	const value = process.env[variable];
	if (value === undefined || value === "") {
		return printUsageAndExit(
			`error: 타깃 '${target}'의 접속 정보가 없습니다. ${ENV_FILE} 파일에 ${variable} 을 채우세요 (.env.example 참고).`,
		);
	}
	return value;
};

/** 접속 문자열을 env로만 넘겨 자식 프로세스를 띄우고, 출력의 비밀번호를 마스킹한다. */
const spawnMasked = (
	target: TargetName,
	describe: string,
	command: string,
	commandArguments: ReadonlyArray<string>,
	extraEnv: Readonly<Record<string, string>>,
	cwd: string | undefined,
): void => {
	warnEnvFilePermissions();
	const connectionString = readConnectionOrExit(target);
	const connection = parseConnection(connectionString);
	if (connection === undefined) {
		printUsageAndExit(
			`error: ${TARGET_VARIABLES[target]} 의 형식이 URL이 아닙니다. 값은 출력하지 않습니다.`,
		);
		return;
	}
	if (!connection.isLocal && !connection.hasSslMode) {
		console.warn(
			`warning: ${target} 접속 문자열에 sslmode 가 없습니다. ?sslmode=require 를 붙이는 것을 권장합니다.`,
		);
	}
	console.log(`target ${target} (${connection.label}) → ${describe}`);
	const child = spawn(command, [...commandArguments], {
		env: { ...process.env, ...extraEnv, DATABASE_URL: connectionString },
		stdio: ["inherit", "pipe", "pipe"],
		cwd,
	});
	const secret = secretToMask(connection);
	child.stdout.on("data", (chunk: Buffer) => {
		process.stdout.write(maskSecret(chunk.toString(), secret));
	});
	child.stderr.on("data", (chunk: Buffer) => {
		process.stderr.write(maskSecret(chunk.toString(), secret));
	});
	child.on("close", (code) => {
		process.exit(code ?? 1);
	});
};

const runHejbro = (
	target: TargetName,
	command: HejbroCommand,
	extraArguments: ReadonlyArray<string>,
): void => {
	const workdir = prepareProviderWorkdir(target);
	const describe =
		workdir === undefined
			? `hejbro ${command}`
			: `hejbro ${command} (config: hejbro.${target}.config.ts, cwd: ${workdir})`;
	spawnMasked(target, describe, HEJBRO_BIN, [command, ...extraArguments], {}, workdir);
};

const runSmoke = (target: TargetName): void => {
	spawnMasked(target, `smoke (${SMOKE_SCRIPT})`, "node", [SMOKE_SCRIPT], { [TARGET_ENV_NAME]: target }, undefined);
};

const STATE_CONFIGURED = "설정됨";
const STATE_MISSING = "미설정";

type DoctorRow = {
	readonly target: TargetName;
	readonly state: typeof STATE_CONFIGURED | typeof STATE_MISSING;
	readonly label: string;
	readonly result: string;
};

const probe = async (target: TargetName): Promise<DoctorRow> => {
	const value = process.env[TARGET_VARIABLES[target]];
	if (value === undefined || value === "") {
		return { target, state: STATE_MISSING, label: "-", result: `${TARGET_VARIABLES[target]} 을 .env 에 채우세요` };
	}
	const connection = parseConnection(value);
	if (connection === undefined) {
		return { target, state: STATE_CONFIGURED, label: "?", result: "형식이 URL이 아님" };
	}
	const client = new pg.Client({
		connectionString: value,
		connectionTimeoutMillis: CONNECT_TIMEOUT_MILLISECONDS,
	});
	const result = await client
		.connect()
		.then(() => client.query<{ readonly version: string }>("select version()"))
		.then((queryResult) => `연결 성공: ${queryResult.rows[0]?.version ?? "unknown"}`)
		.catch((error: unknown) => {
			if (error instanceof Error) {
				return `연결 실패: ${maskSecret(error.message, connection.password)}`;
			}
			return `연결 실패: ${maskSecret(String(error), connection.password)}`;
		})
		.finally(() => client.end().catch(() => undefined));
	return { target, state: STATE_CONFIGURED, label: connection.label, result };
};

/** 타깃에 SQL 문 하나를 실행하고 결과 행을 JSON 줄로 출력한다. 오류 메시지도 마스킹한다. */
const runSql = async (target: TargetName, statement: string): Promise<void> => {
	warnEnvFilePermissions();
	const connectionString = readConnectionOrExit(target);
	const connection = parseConnection(connectionString);
	if (connection === undefined) {
		printUsageAndExit(`error: ${TARGET_VARIABLES[target]} 의 형식이 URL이 아닙니다. 값은 출력하지 않습니다.`);
		return;
	}
	console.log(`target ${target} (${connection.label}) → sql`);
	const client = new pg.Client({ connectionString, connectionTimeoutMillis: CONNECT_TIMEOUT_MILLISECONDS });
	const exitCode = await client
		.connect()
		.then(() => client.query<Record<string, unknown>>(statement))
		.then((result) => {
			// 여러 문장을 보내면 pg 는 런타임에 결과 배열을 돌려준다. flat() 이 두 경우를 하나로 만든다.
			const results = [result].flat();
			results.forEach((single) => {
				single.rows.forEach((row) => console.log(JSON.stringify(row)));
				console.log(`(${single.rowCount ?? 0} rows, ${single.command})`);
			});
			return 0;
		})
		.catch((error: unknown) => {
			if (error instanceof Error) {
				console.error(`error: ${maskSecret(error.message, connection.password)}`);
				return 1;
			}
			console.error("error: unknown");
			return 1;
		})
		.finally(() => client.end().catch(() => undefined));
	process.exit(exitCode);
};

const runDoctor = async (): Promise<void> => {
	warnEnvFilePermissions();
	const rows = await Promise.all(targetNames.map(probe));
	rows.forEach((row) => {
		console.log(`${row.target.padEnd(9)} ${row.state.padEnd(4)} ${row.label.padEnd(40)} ${row.result}`);
	});
};

const [firstArgument = "", secondArgument = "", ...restArguments] = process.argv.slice(2);

if (firstArgument === DOCTOR_COMMAND) {
	await runDoctor();
} else if (!isTargetName(firstArgument)) {
	printUsageAndExit(
		`error: 알 수 없는 타깃 '${firstArgument}'. 유효한 타깃: ${targetNames.join(", ")}`,
	);
} else if (secondArgument === SMOKE_COMMAND) {
	runSmoke(firstArgument);
} else if (secondArgument === SQL_COMMAND) {
	const [statement = ""] = restArguments;
	if (statement === "") {
		printUsageAndExit("error: 실행할 SQL 문이 비어 있습니다.");
	}
	await runSql(firstArgument, statement);
} else if (!isHejbroCommand(secondArgument)) {
	printUsageAndExit(
		`error: 알 수 없는 명령 '${secondArgument}'. 유효한 명령: ${[...HEJBRO_COMMANDS, SMOKE_COMMAND, SQL_COMMAND].join(", ")}`,
	);
} else {
	runHejbro(firstArgument, secondArgument, restArguments);
}
