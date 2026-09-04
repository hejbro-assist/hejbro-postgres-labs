/**
 * findings/ 기록을 검증하고 hejbro Discussions에 게시한다.
 *
 *   pnpm finding validate <file|all>
 *   pnpm finding post <file>
 *
 * 게시는 gh CLI(GraphQL createDiscussion)를 통해 hejbro-assist 계정으로만 한다.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FINDINGS_DIRECTORY = "findings";
const TEMPLATE_FILE = "_template.md";
const README_FILE = "README.md";
const FRONTMATTER_FENCE = "---";

const REPOSITORY_OWNER = "quickstart-now";
const REPOSITORY_NAME = "hejbro";
const POSTING_ACCOUNT = "hejbro-assist";
const LABS_REPOSITORY_URL = "https://github.com/hejbro-assist/hejbro-postgres-labs";

const KINDS = ["bug", "improvement", "feature", "question", "showcase"] as const;
const PROVIDERS = ["neon", "nile", "supabase", "postgres", "all"] as const;
const STATUSES = ["draft", "posted", "resolved"] as const;
const REQUIRED_FIELDS = ["title", "hejbro_version", "provider", "kind", "status", "discussion"] as const;
const REPRODUCIBLE_KINDS = ["bug", "improvement"] as const;
const REPRODUCTION_SECTIONS = ["## 재현 절차", "## 기대 결과", "## 실제 결과"] as const;
const FIELDS_ALLOWED_EMPTY = ["discussion"] as const;
const RESOLVED_STATUS = "resolved";
const RESOLVED_IN_FIELD = "resolved_in";

const CATEGORY_BY_KIND = {
	bug: "Q&A",
	question: "Q&A",
	improvement: "Ideas",
	feature: "Ideas",
	showcase: "Show and tell",
} as const;

type Kind = (typeof KINDS)[number];

type Frontmatter = Readonly<Record<string, string>>;

type ParsedFinding = {
	readonly frontmatter: Frontmatter;
	readonly body: string;
	readonly rawFrontmatterLines: ReadonlyArray<string>;
};

const isKind = (value: string): value is Kind => KINDS.some((kind) => kind === value);

const includes = (allowed: ReadonlyArray<string>, value: string): boolean =>
	allowed.some((candidate) => candidate === value);

/** `---` 블록의 `key: value` 스칼라만 읽는다. 중첩 YAML은 지원하지 않는다. */
const parseFinding = (content: string): ParsedFinding | undefined => {
	const lines = content.split("\n");
	if (lines[0] !== FRONTMATTER_FENCE) {
		return undefined;
	}
	const closingIndex = lines.findIndex((line, index) => index > 0 && line === FRONTMATTER_FENCE);
	if (closingIndex === -1) {
		return undefined;
	}
	const rawFrontmatterLines = lines.slice(1, closingIndex);
	const entries = rawFrontmatterLines.map((line) => {
		const separator = line.indexOf(":");
		if (separator === -1) {
			return [line.trim(), ""] as const;
		}
		return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] as const;
	});
	return {
		frontmatter: Object.fromEntries(entries),
		body: lines.slice(closingIndex + 1).join("\n"),
		rawFrontmatterLines,
	};
};

/** 파일 하나의 문제 목록. 비어 있으면 유효하다. */
const collectProblems = (path: string): ReadonlyArray<string> => {
	const parsed = parseFinding(readFileSync(path, "utf8"));
	if (parsed === undefined) {
		return ["frontmatter(--- 블록)가 없습니다"];
	}
	const { frontmatter, body } = parsed;
	const missing = REQUIRED_FIELDS.filter((field) => {
		const value = frontmatter[field];
		if (value === undefined) {
			return true;
		}
		return value === "" && !includes(FIELDS_ALLOWED_EMPTY, field);
	}).map((field) => `필수 필드 누락: ${field}`);
	const kind = frontmatter["kind"] ?? "";
	const valueChecks = [
		{ field: "kind", value: kind, allowed: KINDS },
		{ field: "provider", value: frontmatter["provider"] ?? "", allowed: PROVIDERS },
		{ field: "status", value: frontmatter["status"] ?? "", allowed: STATUSES },
	] as const;
	const invalid = valueChecks
		.filter(({ value, allowed }) => value !== "" && !includes(allowed, value))
		.map(({ field, value, allowed }) => `${field} 허용값 아님: ${value} (${allowed.join(", ")})`);
	const needsReproduction = includes(REPRODUCIBLE_KINDS, kind);
	const sectionProblems = REPRODUCTION_SECTIONS.filter(
		(section) => needsReproduction && !body.includes(section),
	).map((section) => `본문 섹션 누락: ${section}`);
	const resolvedIn = frontmatter[RESOLVED_IN_FIELD] ?? "";
	const resolvedProblems =
		frontmatter["status"] === RESOLVED_STATUS && resolvedIn === ""
			? [`status 가 ${RESOLVED_STATUS} 이면 ${RESOLVED_IN_FIELD} (해결된 hejbro 버전) 이 필요합니다`]
			: [];
	return [...missing, ...invalid, ...sectionProblems, ...resolvedProblems];
};

const listFindingFiles = (): ReadonlyArray<string> =>
	readdirSync(FINDINGS_DIRECTORY)
		.filter((name) => name.endsWith(".md") && name !== TEMPLATE_FILE && name !== README_FILE)
		.map((name) => join(FINDINGS_DIRECTORY, name));

const validate = (target: string): number => {
	const files = [target].flatMap((value) => {
		if (value === "all") {
			return listFindingFiles();
		}
		return [value];
	});
	const report = files.map((file) => ({ file, problems: collectProblems(file) }));
	report.forEach(({ file, problems }) => {
		if (problems.length === 0) {
			console.log(`ok  ${file}`);
			return;
		}
		console.error(`err ${file}`);
		problems.forEach((problem) => console.error(`    - ${problem}`));
	});
	const failed = report.filter(({ problems }) => problems.length > 0).length;
	if (failed > 0) {
		return 1;
	}
	return 0;
};

const runGh = (args: ReadonlyArray<string>): string =>
	execFileSync("gh", [...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

const scanForSecrets = (path: string): boolean => {
	try {
		execFileSync("pnpm", ["exec", "secretlint", path], { stdio: "inherit" });
		return true;
	} catch (error: unknown) {
		return false;
	}
};

type Category = { readonly id: string; readonly name: string };

const lookupRepository = (): { readonly id: string; readonly categories: ReadonlyArray<Category> } => {
	const query = `query($owner: String!, $name: String!) {
		repository(owner: $owner, name: $name) {
			id
			discussionCategories(first: 25) { nodes { id name } }
		}
	}`;
	const raw = runGh(["api", "graphql", "-f", `query=${query}`, "-f", `owner=${REPOSITORY_OWNER}`, "-f", `name=${REPOSITORY_NAME}`]);
	const data = JSON.parse(raw) as {
		readonly data: { readonly repository: { readonly id: string; readonly discussionCategories: { readonly nodes: ReadonlyArray<Category> } } };
	};
	return { id: data.data.repository.id, categories: data.data.repository.discussionCategories.nodes };
};

const createDiscussion = (repositoryId: string, categoryId: string, title: string, body: string): string => {
	const mutation = `mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
		createDiscussion(input: { repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body }) {
			discussion { url }
		}
	}`;
	const raw = runGh([
		"api", "graphql",
		"-f", `query=${mutation}`,
		"-f", `repositoryId=${repositoryId}`,
		"-f", `categoryId=${categoryId}`,
		"-f", `title=${title}`,
		"-f", `body=${body}`,
	]);
	const data = JSON.parse(raw) as { readonly data: { readonly createDiscussion: { readonly discussion: { readonly url: string } } } };
	return data.data.createDiscussion.discussion.url;
};

const rewriteFrontmatter = (path: string, parsed: ParsedFinding, url: string): void => {
	const updatedLines = parsed.rawFrontmatterLines.map((line) => {
		if (line.startsWith("discussion:")) {
			return `discussion: ${url}`;
		}
		if (line.startsWith("status:")) {
			return "status: posted";
		}
		return line;
	});
	writeFileSync(path, [FRONTMATTER_FENCE, ...updatedLines, FRONTMATTER_FENCE, parsed.body].join("\n"));
};

const post = (path: string): number => {
	if (validate(path) !== 0) {
		return 1;
	}
	const parsed = parseFinding(readFileSync(path, "utf8"));
	if (parsed === undefined) {
		return 1;
	}
	const existing = parsed.frontmatter["discussion"] ?? "";
	if (existing !== "") {
		console.log(`이미 게시됨: ${existing}`);
		return 0;
	}
	if (!scanForSecrets(path)) {
		console.error("error: 본문에 비밀 패턴이 있어 게시를 거부합니다.");
		return 1;
	}
	const login = runGh(["api", "user", "-q", ".login"]);
	if (login !== POSTING_ACCOUNT) {
		console.error(`error: gh 활성 계정이 ${login} 입니다. ${POSTING_ACCOUNT} 로 전환하세요.`);
		return 1;
	}
	const kind = parsed.frontmatter["kind"] ?? "";
	if (!isKind(kind)) {
		return 1;
	}
	const categoryName = CATEGORY_BY_KIND[kind];
	const repository = lookupRepository();
	const category = repository.categories.find((candidate) => candidate.name === categoryName);
	if (category === undefined) {
		console.error(`error: Discussions 카테고리 '${categoryName}' 를 찾지 못했습니다.`);
		return 1;
	}
	const title = parsed.frontmatter["title"] ?? "";
	const header = `> hejbro \`${parsed.frontmatter["hejbro_version"] ?? ""}\` · provider: \`${parsed.frontmatter["provider"] ?? ""}\` · kind: \`${kind}\`\n> 기록: ${LABS_REPOSITORY_URL}/blob/main/${path}\n`;
	const url = createDiscussion(repository.id, category.id, title, `${header}\n${parsed.body.trim()}\n`);
	rewriteFrontmatter(path, parsed, url);
	console.log(`게시됨 (${categoryName}): ${url}`);
	return 0;
};

const [command = "", target = ""] = process.argv.slice(2);

if (command === "validate" && target !== "") {
	process.exit(validate(target));
}
if (command === "post" && target !== "") {
	process.exit(post(target));
}
console.error("usage: pnpm finding validate <file|all>\n       pnpm finding post <file>");
process.exit(1);
