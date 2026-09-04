/**
 * provider preset 설정으로 hejbro 명령을 실행하기 위한 작업 디렉터리를 만든다.
 *
 *   node scripts/provider-workdir.ts <nile|supabase>   # 준비된 디렉터리 경로를 출력
 *
 * hejbro 0.2.0-pre.1 은 `generate`·`history` 만 `--config` 를 읽고 `verify`·`check`·`migrate`·
 * `status`·`reset` 은 플래그를 조용히 무시한 채 cwd 의 `hejbro.config.ts` 를 읽는다
 * (findings/2026-09-04-config-flag-ignored-by-live-commands.md). 그래서 provider 설정을 그 이름
 * 그대로 `hejbro.config.ts` 로 복사한 디렉터리를 만들고, 선언·마이그레이션·스냅샷은 저장소의 원본에
 * 심볼릭 링크로 연결한다. 이 디렉터리를 cwd 로 삼으면 어떤 명령이든 provider preset 을 본다.
 * 근본 원인은 hejbro 쪽이므로 픽스가 나오면 이 우회는 지운다.
 */
import { copyFileSync, existsSync, mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";

const WORKDIR_ROOT = ".hejbro-target";
/** 저장소 루트 기준 상대 경로. 작업 디렉터리는 두 단계 아래라 `../../` 로 되돌아간다. */
/** certs 는 supabase 접속 문자열의 상대 경로 `sslrootcert=certs/...` 가 새 cwd 에서도 풀리도록 링크한다. */
const LINKED_ENTRIES = ["src", "migrations", "hejbro.snapshot.json", "certs"] as const;
const UP_TO_ROOT = "../..";
const CONFIG_FILE_NAME = "hejbro.config.ts";

/** provider 설정 파일이 없으면 undefined. 있으면 준비된 작업 디렉터리 경로. */
export const prepareProviderWorkdir = (target: string): string | undefined => {
	const providerConfig = `hejbro.${target}.config.ts`;
	if (!existsSync(providerConfig)) {
		return undefined;
	}
	const workdir = join(WORKDIR_ROOT, target);
	mkdirSync(workdir, { recursive: true });
	copyFileSync(providerConfig, join(workdir, CONFIG_FILE_NAME));
	LINKED_ENTRIES.forEach((entry) => {
		const link = join(workdir, entry);
		if (!existsSync(link)) {
			symlinkSync(join(UP_TO_ROOT, entry), link);
		}
	});
	return workdir;
};

const isDirectRun = process.argv[1]?.endsWith("provider-workdir.ts") ?? false;

if (isDirectRun) {
	const [target = ""] = process.argv.slice(2);
	const workdir = prepareProviderWorkdir(target);
	if (workdir === undefined) {
		console.error(`error: hejbro.${target}.config.ts 가 없습니다.`);
		process.exit(1);
	}
	console.log(workdir);
}
