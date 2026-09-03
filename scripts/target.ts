/**
 * provider 타깃을 이름으로 골라 hejbro 명령을 실행한다.
 *
 *   pnpm target <neon|nile|supabase|postgres> <migrate|status|check|reset> [hejbro 추가 인자]
 *   pnpm target doctor
 *
 * 접속 문자열은 자식 프로세스의 환경 변수(DATABASE_URL)로만 전달하고 argv에는
 * 절대 싣지 않는다. 출력은 비밀번호를 마스킹한 뒤 그대로 흘려보낸다.
 */
import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import pg from "pg";

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
		`usage: pnpm target <${targetNames.join("|")}> <${HEJBRO_COMMANDS.join("|")}> [args]\n       pnpm target ${DOCTOR_COMMAND}`,
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

const runHejbro = (
	target: TargetName,
	command: HejbroCommand,
	extraArguments: ReadonlyArray<string>,
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
	console.log(`target ${target} (${connection.label}) → hejbro ${command}`);
	const child = spawn("pnpm", ["exec", "hejbro", command, ...extraArguments], {
		env: { ...process.env, DATABASE_URL: connectionString },
		stdio: ["inherit", "pipe", "pipe"],
	});
	child.stdout.on("data", (chunk: Buffer) => {
		process.stdout.write(maskSecret(chunk.toString(), connection.password));
	});
	child.stderr.on("data", (chunk: Buffer) => {
		process.stderr.write(maskSecret(chunk.toString(), connection.password));
	});
	child.on("close", (code) => {
		process.exit(code ?? 1);
	});
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
} else if (!isHejbroCommand(secondArgument)) {
	printUsageAndExit(
		`error: 알 수 없는 명령 '${secondArgument}'. 유효한 명령: ${HEJBRO_COMMANDS.join(", ")}`,
	);
} else {
	runHejbro(firstArgument, secondArgument, restArguments);
}
