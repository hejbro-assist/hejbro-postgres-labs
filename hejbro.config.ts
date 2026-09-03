import { defineConfig } from "hejbro";

/**
 * 네 provider(neon, nile, supabase, postgres)에 그대로 적용하는 공유 체인.
 * presets는 비워 둔다. provider preset은 hejbro.<provider>.config.ts에서
 * 검증 게이트로만 쓴다 (design D2).
 */
export default defineConfig({
	entry: ["src/lab.schema.ts"],
	migrationsDir: "migrations",
	snapshotPath: "hejbro.snapshot.json",
	prefixStrategy: "index",
	presets: [],
});
