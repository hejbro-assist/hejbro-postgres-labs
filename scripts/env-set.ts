/**
 * 클립보드의 접속 문자열을 .env 에 기록한다. 값은 argv, 대화, 셸 히스토리에 남지 않는다.
 *
 *   pnpm env:set NEON_DATABASE_URL          # 클립보드에서 읽는다 (WSL: Windows 클립보드)
 *   pnpm env:set NEON_DATABASE_URL --stdin  # 표준 입력에서 읽는다
 *
 * 기록 후 클립보드를 비우고, 화면에는 host 와 DB 이름만 출력한다.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const ALLOWED_VARIABLES = [
	"NEON_DATABASE_URL",
	"NILE_DATABASE_URL",
	"SUPABASE_DATABASE_URL",
	"POSTGRES_DATABASE_URL",
] as const;

type Variable = (typeof ALLOWED_VARIABLES)[number];

const ALLOWED_PROTOCOLS = ["postgres:", "postgresql:"] as const;
const LOCAL_HOSTS = ["localhost", "127.0.0.1"] as const;
const SSL_MODE_PARAMETER = "sslmode";
const SSL_MODE_REQUIRED = "require";
const STDIN_FLAG = "--stdin";
const SECURE_MODE = 0o600;
const ENV_FILE = process.env["ENV_FILE"] ?? ".env";

const isVariable = (value: string): value is Variable =>
	ALLOWED_VARIABLES.some((candidate) => candidate === value);

const fail = (message: string): never => {
	console.error(`error: ${message}`);
	console.error(`usage: pnpm env:set <${ALLOWED_VARIABLES.join("|")}> [${STDIN_FLAG}]`);
	process.exit(1);
};

const runPowershell = (command: string): string =>
	execFileSync("powershell.exe", ["-NoProfile", "-Command", command], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});

const readClipboard = (): string => {
	try {
		return runPowershell("Get-Clipboard -Raw").trim();
	} catch (error: unknown) {
		return fail("클립보드를 읽지 못했습니다. WSL 에서 powershell.exe 가 필요합니다. 대신 --stdin 을 쓰세요.");
	}
};

const clearClipboard = (): void => {
	try {
		runPowershell("Set-Clipboard -Value ' '");
		console.log("클립보드를 비웠습니다.");
	} catch (error: unknown) {
		console.warn("warning: 클립보드를 비우지 못했습니다. 직접 다른 내용을 복사해 덮어쓰세요.");
	}
};

const readStdin = (): string => readFileSync(0, "utf8").trim();

/** 접속 문자열을 검증하고, 비로컬 host 에 sslmode 가 없으면 require 를 붙인다. */
const normalizeConnection = (raw: string): { readonly value: string; readonly label: string } => {
	const parsed = (() => {
		try {
			return new URL(raw);
		} catch (error: unknown) {
			return fail("클립보드 내용이 URL 형식이 아닙니다. 값은 출력하지 않습니다.");
		}
	})();
	if (!ALLOWED_PROTOCOLS.some((protocol) => protocol === parsed.protocol)) {
		fail(`postgres:// 또는 postgresql:// 로 시작해야 합니다 (현재 스킴: ${parsed.protocol})`);
	}
	if (parsed.password === "") {
		fail("접속 문자열에 비밀번호가 없습니다. 콘솔에서 비밀번호가 포함된 형태를 복사하세요.");
	}
	const isLocal = LOCAL_HOSTS.some((host) => host === parsed.hostname);
	if (!isLocal && !parsed.searchParams.has(SSL_MODE_PARAMETER)) {
		parsed.searchParams.set(SSL_MODE_PARAMETER, SSL_MODE_REQUIRED);
		console.log(`${SSL_MODE_PARAMETER}=${SSL_MODE_REQUIRED} 를 추가했습니다.`);
	}
	if (parsed.hostname.includes("-pooler.")) {
		console.warn("warning: host 에 '-pooler' 가 있습니다. migrate 에는 direct(non-pooled) 접속을 권장합니다.");
	}
	return { value: parsed.toString(), label: `${parsed.hostname}${parsed.pathname}` };
};

const readCurrentLines = (): ReadonlyArray<string> => {
	if (!existsSync(ENV_FILE)) {
		return [];
	}
	return readFileSync(ENV_FILE, "utf8").split("\n").filter((line) => line !== "");
};

const writeVariable = (variable: Variable, value: string): void => {
	const currentLines = readCurrentLines();
	const withoutVariable = currentLines.filter((line) => !line.startsWith(`${variable}=`));
	const replaced = withoutVariable.length !== currentLines.length;
	writeFileSync(ENV_FILE, `${[...withoutVariable, `${variable}=${value}`].join("\n")}\n`);
	chmodSync(ENV_FILE, SECURE_MODE);
	if (replaced) {
		console.log(`${ENV_FILE}: ${variable} 을 교체했습니다.`);
		return;
	}
	console.log(`${ENV_FILE}: ${variable} 을 추가했습니다.`);
};

const [variableArgument = "", modeArgument = ""] = process.argv.slice(2);

if (!isVariable(variableArgument)) {
	fail(`알 수 없는 변수 '${variableArgument}'`);
}
const useStdin = modeArgument === STDIN_FLAG;
const readInput = (): string => {
	if (useStdin) {
		return readStdin();
	}
	return readClipboard();
};
const raw = readInput();
if (raw === "") {
	fail("입력이 비어 있습니다. 콘솔에서 접속 문자열을 복사한 뒤 다시 실행하세요.");
}
const connection = normalizeConnection(raw);
writeVariable(variableArgument, connection.value);
console.log(`${variableArgument} → ${connection.label}`);
if (!useStdin) {
	clearClipboard();
}
