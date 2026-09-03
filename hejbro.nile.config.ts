import { nilePreset } from "@hejbro/nile";
import { defineConfig } from "hejbro";

/**
 * nile preset 검증 게이트. 공유 설정(hejbro.config.ts)과 entry·migrations·snapshot이
 * 같고 presets만 다르다. 마이그레이션 생성에는 쓰지 않는다 (design D2).
 */
export default defineConfig({
	entry: ["src/lab.schema.ts"],
	migrationsDir: "migrations",
	snapshotPath: "hejbro.snapshot.json",
	prefixStrategy: "index",
	presets: [nilePreset],
});
