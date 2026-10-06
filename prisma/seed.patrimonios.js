import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/utils/password.js";
import { slugify } from "../src/utils/slug.js";
import { PATRIMONIOS_IMAGE_DIR, PATRIMONIOS_IMAGE_ROUTE } from "../src/config/arquivos.js";
import { PATRIMONIOS, ASSET_SHA256, EXPECTED_COUNTS, SOURCE_SHA256, RESEARCH_SHA256 } from "./data/patrimonios.js";
import { LEGACY_PATRIMONIOS } from "./data/reconciliacao.js";

export const SEED_EMAIL = "seed.patrimonios@localhost.invalid";
export const IMPORT_ACTION = "IMPORT_PATRIMONIOS_MOCK";
export class SeedValidationError extends Error {}
const fail = (message) => { throw new SeedValidationError(message); };
const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(
        Object.keys(value).sort().map((key) => [key, canonical(value[key])])
    );
    return value;
};
export const fingerprint = (value) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const identical = (a, b) => fingerprint(a) === fingerprint(b);
const integer = (value, min, label) => {
    if (!Number.isInteger(value) || value < min || value > 2147483647) fail(`${label}: inteiro inválido.`);
};
const text = (value, max, label) => {
    if (typeof value !== "string" || !value.trim() || Array.from(value).length > max) fail(`${label}: texto obrigatório ou limite excedido.`);
};
const list = (value, label) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) fail(`${label}: esperado array.`);
    for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) fail(`${label}: posição ausente.`);
    return value;
};
const categoryNames = { arquitetonico: "Arquitetônico", natural: "Natural", imaterial: "Imaterial", demolido: "Demolido", documental: "Documental" };

export function validateResearch(data = PATRIMONIOS) {
    list(data, "Catálogo");
    const ids = new Set(), numbers = new Set(), slugs = new Set(), orders = new Set();
    const counts = { patrimonios: data.length, localizacoes: 0, secoes: 0, fatos: 0, ligacoes: 0, imagens: 0 };
    data.forEach((p, index) => {
        text(p.id, 10, "ID original");
        if (!/^[1-9]\d*$/.test(p.id) || Number(p.id) !== p.numeroExibicao) fail(`ID/número incompatíveis: ${p.id}.`);
        integer(p.numeroExibicao, 1, "Número"); integer(p.ordemExibicao, 0, "Ordem");
        if (p.ordemExibicao !== index) fail(`Ordem editorial inválida: ${p.id}.`);
        text(p.nome, 200, `Nome ${p.id}`);
        const slug = slugify(p.nome);
        if (ids.has(p.id) || numbers.has(p.numeroExibicao) || orders.has(p.ordemExibicao) || slugs.has(slug)) fail(`ID, número, ordem ou slug repetido: ${p.id}.`);
        ids.add(p.id); numbers.add(p.numeroExibicao); orders.add(p.ordemExibicao); slugs.add(slug);
        text(p.nome, 200, `Nome ${p.id}`); text(slug, 220, `Slug ${p.id}`);
        text(p.resumo, 500, `Resumo ${p.id}`); text(p.bairro, 100, `Bairro ${p.id}`); text(p.endereco, 250, `Endereço ${p.id}`);
        if (!Object.hasOwn(categoryNames, p.categoria)) fail(`Categoria desconhecida: ${p.id}.`);
        if (p.cep !== undefined && (typeof p.cep !== "string" || !/^\d{5}-\d{3}$/.test(p.cep))) fail(`CEP inválido: ${p.id}.`);
        if (!p.localizacao || typeof p.localizacao.lat !== "number" || typeof p.localizacao.lng !== "number" ||
            !Number.isFinite(p.localizacao.lat) || !Number.isFinite(p.localizacao.lng) ||
            Math.abs(p.localizacao.lat) > 90 || Math.abs(p.localizacao.lng) > 180 ||
            [p.localizacao.lat, p.localizacao.lng].some((v) => Math.abs(v * 1e7 - Math.round(v * 1e7)) > 0.00001)) fail(`Coordenadas inválidas: ${p.id}.`);
        counts.localizacoes++;
        text(p.imagemPrincipal, 255, `Imagem ${p.id}`);
        if (basename(p.imagemPrincipal) !== p.imagemPrincipal || !/^[a-z0-9_]+\.(png|jpe?g|webp)$/.test(p.imagemPrincipal) || !ASSET_SHA256[p.imagemPrincipal]) fail(`Associação de imagem inválida: ${p.id}.`);
        counts.imagens++;
        const sections = list(p.detalhes, `Seções ${p.id}`);
        sections.forEach((s) => { text(s.titulo, Infinity, `Título ${p.id}`); text(s.texto, Infinity, `Texto ${p.id}`); if (s.icone !== undefined && s.icone !== null) text(s.icone, Infinity, `Ícone ${p.id}`); });
        const facts = list(p.fatos, `Fatos ${p.id}`);
        facts.forEach((f) => { text(f.rotulo, Infinity, `Rótulo ${p.id}`); text(f.valor, Infinity, `Valor ${p.id}`); });
        const links = list(p.ligacoes, `Ligações ${p.id}`);
        links.forEach((l) => { text(l.id, 10, `Destino ${p.id}`); text(l.texto, Infinity, `Ligação ${p.id}`); });
        if (new Set(links.map((l) => l.id)).size !== links.length) fail(`Destino repetido: ${p.id}.`);
        counts.secoes += sections.length; counts.fatos += facts.length; counts.ligacoes += links.length;
    });
    for (const p of data) for (const l of p.ligacoes ?? []) if (!ids.has(l.id) || l.id === p.id) fail(`Ligação inválida: ${p.id} → ${l.id}.`);
    if (!identical(counts, EXPECTED_COUNTS)) fail(`Contagens divergentes da referência: ${JSON.stringify(counts)}. Revisar a fonte, sem alterar a pesquisa para ajustar totais.`);
    if (fingerprint(data) !== RESEARCH_SHA256) fail("O snapshot da pesquisa diverge da extração conferida; revisar a fonte e as associações de imagem antes de qualquer escrita.");
    return counts;
}

export async function validateAssets(baseUrl, data = PATRIMONIOS, directory = PATRIMONIOS_IMAGE_DIR) {
    let url;
    try { url = new URL(baseUrl); } catch { fail("Configure PATRIMONIOS_PUBLIC_BASE_URL com a URL pública do backend."); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) fail("PATRIMONIOS_PUBLIC_BASE_URL deve ser HTTP(S), sem credenciais, query ou fragmento.");
    const base = url.href.replace(/\/$/, "");
    for (const p of data) {
        let bytes;
        try { bytes = await readFile(resolve(directory, p.imagemPrincipal)); } catch { fail(`Arquivo de imagem ausente: ${p.imagemPrincipal}.`); }
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (hash !== ASSET_SHA256[p.imagemPrincipal]) fail(`Imagem diferente da fonte: ${p.imagemPrincipal}.`);
    }
    return base;
}

export const researchInclude = {
    categoria: true, localizacao: true,
    secoes: { orderBy: { ordem: "asc" } }, fatos: { orderBy: { ordem: "asc" } },
    imagens: { orderBy: [{ ordem: "asc" }, { id: "asc" }] },
    ligacoes: { orderBy: { ordem: "asc" } }, documentos: true, rotas: true,
};

export function managedSnapshot(p) {
    const loc = p.localizacao;
    return {
        nome: p.nome, slug: p.slug, numeroExibicao: p.numeroExibicao, ordemExibicao: p.ordemExibicao,
        descricaoResumida: p.descricaoResumida, categoriaSlug: p.categoria.slug, situacao: p.situacao,
        localizacao: loc ? { endereco: loc.endereco, numero: loc.numero, complemento: loc.complemento, bairro: loc.bairro, cidade: loc.cidade, uf: loc.uf, cep: loc.cep, latitude: loc.latitude === null ? null : Number(loc.latitude), longitude: loc.longitude === null ? null : Number(loc.longitude) } : null,
        secoes: (p.secoes ?? []).map(({ icone, titulo, texto, ordem }) => ({ icone, titulo, texto, ordem })),
        fatos: (p.fatos ?? []).map(({ rotulo, valor, ordem }) => ({ rotulo, valor, ordem })),
        imagens: (p.imagens ?? []).map(({ url, titulo, textoAlternativo, credito, fonte, ordem, principal }) => ({ url, titulo, textoAlternativo, credito, fonte, ordem, principal })),
        ligacoes: (p.ligacoes ?? []).map(({ patrimonioDestinoId, texto, ordem }) => ({ patrimonioDestinoId, texto, ordem })),
    };
}
const jsonSnapshot = (p) => JSON.parse(JSON.stringify(p));
export const reconciliationHash = (p) => fingerprint(jsonSnapshot(p));
const sourceSnapshot = (p, slug, ids, base, current) => ({
    nome: p.nome, slug, numeroExibicao: p.numeroExibicao, ordemExibicao: p.ordemExibicao,
    descricaoResumida: p.resumo, categoriaSlug: p.categoria,
    situacao: p.categoria === "demolido" ? "DEMOLIDO" : "NAO_INFORMADO",
    localizacao: { endereco: p.endereco, numero: null, complemento: null, bairro: p.bairro, cidade: "Guarulhos", uf: "SP", cep: p.cep ?? null, latitude: p.localizacao.lat, longitude: p.localizacao.lng },
    secoes: (p.detalhes ?? []).map((s, ordem) => ({ icone: s.icone ?? null, titulo: s.titulo, texto: s.texto, ordem })),
    fatos: (p.fatos ?? []).map((f, ordem) => ({ rotulo: f.rotulo, valor: f.valor, ordem })),
    imagens: current?.imagens.length ? current.imagens.map(({ url, titulo, textoAlternativo, credito, fonte, ordem, principal }) => ({ url, titulo, textoAlternativo: principal ? p.nome : textoAlternativo, credito, fonte, ordem, principal })) : [{ url: `${base}${PATRIMONIOS_IMAGE_ROUTE}/${p.imagemPrincipal}`, titulo: null, textoAlternativo: p.nome, credito: null, fonte: null, ordem: 0, principal: true }],
    ligacoes: (p.ligacoes ?? []).map((l, ordem) => ({ patrimonioDestinoId: ids.get(Number(l.id)), texto: l.texto, ordem })),
});

function untouchedLegacy(p, legacy, authorId) {
    const expectedLoc = legacy.endereco && legacy.bairro ? {
        endereco: legacy.endereco, numero: legacy.numero ?? null, complemento: null, bairro: legacy.bairro,
        cidade: "Guarulhos", uf: "SP", cep: null, latitude: null, longitude: null,
    } : null;
    const current = managedSnapshot(p);
    return p.createdBy === authorId && p.updatedBy === null && p.nome === legacy.nome && p.slug === legacy.slug &&
        p.descricao === legacy.descricao && p.descricaoResumida === legacy.descricao.slice(0, 500) &&
        p.historia === legacy.historia && p.importanciaCultural === null && p.situacao === legacy.situacao &&
        p.categoria.slug === slugify(legacy.categoria) && identical(current.localizacao, expectedLoc) &&
        !p.secoes.length && !p.fatos.length && !p.ligacoes.length && !p.imagens.length;
}

export function planImport({ existing, categories, user, logs, baseUrl, reconciliation = [], data = PATRIMONIOS }) {
    list(reconciliation, "Reconciliação");
    const issues = [], entries = [], ids = new Map(), used = new Set();
    const sourceNumbers = new Set(data.map((p) => p.numeroExibicao));
    const manualIds = new Set(), manualNumbers = new Set();
    for (const r of reconciliation) {
        if (!r || typeof r.patrimonioId !== "string" || !sourceNumbers.has(r.numeroExibicao) || !/^[a-f0-9]{64}$/.test(r.expectedHash ?? "")) fail("Reconciliação inválida: use patrimonioId, numeroExibicao e expectedHash do dry-run.");
        if (manualIds.has(r.patrimonioId) || manualNumbers.has(r.numeroExibicao)) fail("Reconciliação repetida.");
        manualIds.add(r.patrimonioId); manualNumbers.add(r.numeroExibicao);
        const candidate = existing.find((p) => p.id === r.patrimonioId);
        if (!candidate || reconciliationHash(candidate) !== r.expectedHash) issues.push(`Reconciliação desatualizada ou UUID inexistente: ${r.patrimonioId}.`);
    }
    if (user && (user.isActive || user.role !== "EDITOR")) issues.push("O usuário técnico existente não é um EDITOR desativado; revisar sem alterar sua conta automaticamente.");
    for (const slug of new Set(data.map((p) => p.categoria))) {
        const bySlug = categories.find((c) => c.slug === slug), byName = categories.find((c) => c.nome === categoryNames[slug]);
        if ((bySlug && bySlug.nome !== categoryNames[slug]) || (byName && byName.slug !== slug)) issues.push(`Colisão de categoria: ${slug}.`);
    }
    for (const p of existing) {
        const legacy = LEGACY_PATRIMONIOS.find((l) => l.slug === p.slug || l.nome === p.nome);
        if (p.numeroExibicao === null && legacy?.numeroExibicao === null && !manualIds.has(p.id)) issues.push(`Correspondência ambígua: ${p.nome} (${p.id}); exige arquivo de reconciliação.`);
    }
    for (const source of data) {
        const manual = reconciliation.find((r) => r.numeroExibicao === source.numeroExibicao);
        const numbered = existing.find((p) => p.numeroExibicao === source.numeroExibicao);
        const aliases = LEGACY_PATRIMONIOS.filter((l) => l.numeroExibicao === source.numeroExibicao);
        const candidates = existing.filter((p) => p.numeroExibicao === null && (p.nome === source.nome || p.slug === slugify(source.nome) || aliases.some((l) => p.nome === l.nome || p.slug === l.slug)));
        let current = manual ? existing.find((p) => p.id === manual.patrimonioId) : numbered;
        if (!current && candidates.length === 1) current = candidates[0];
        if (!manual && candidates.some((p) => p.id !== current?.id)) issues.push(`Mais de uma correspondência para nº ${source.numeroExibicao}.`);
        if (manual && numbered && numbered.id !== manual.patrimonioId) issues.push(`Número já pertence a outro UUID: ${source.numeroExibicao}.`);
        if (current && current.numeroExibicao !== null && current.numeroExibicao !== source.numeroExibicao) issues.push(`Reconciliação altera identidade já atribuída: ${current.id}.`);
        if (current && used.has(current.id)) issues.push(`UUID atribuído a dois registros: ${current.id}.`);
        const baseline = current && logs.find((l) => l.entityId === current.id);
        if (current && !baseline && !manual) {
            const legacy = aliases.find((l) => untouchedLegacy(current, l, user?.id));
            if (!legacy) issues.push(`Registro existente sem correspondência confirmada ou alterado: ${current.nome} (${current.id}).`);
        }
        if (!current && logs.some((l) => l.newValues?.numeroExibicao === source.numeroExibicao)) issues.push(`Entrada importada removida: nº ${source.numeroExibicao}; não recriar automaticamente.`);
        const id = current?.id ?? randomUUID(), slug = current?.slug ?? slugify(source.nome);
        if (existing.some((p) => p.slug === slug && p.id !== id)) issues.push(`Colisão de slug: ${slug}.`);
        if (existing.some((p) => p.ordemExibicao === source.ordemExibicao && p.id !== id)) issues.push(`Colisão de ordem editorial: ${source.ordemExibicao}.`);
        ids.set(source.numeroExibicao, id); if (current) used.add(current.id);
        entries.push({ source, id, slug, current, baseline });
    }
    for (const entry of entries) {
        entry.expected = sourceSnapshot(entry.source, entry.slug, ids, baseUrl, entry.current);
        if (entry.current?.imagens.length && !entry.current.imagens.some((i) => i.principal && i.url === `${baseUrl}${PATRIMONIOS_IMAGE_ROUTE}/${entry.source.imagemPrincipal}`)) issues.push(`Capa preexistente não corresponde à imagem do mock: nº ${entry.source.numeroExibicao}; revisar sem substituição automática.`);
        if (entry.baseline && (!identical(managedSnapshot(entry.current), entry.baseline.newValues?.managed) ||
            !identical(entry.expected, entry.baseline.newValues?.managed))) issues.push(`Divergência após importação: nº ${entry.source.numeroExibicao}; preservar alterações e revisar manualmente.`);
    }
    return {
        entries, ids, issues,
        report: { novos: entries.filter((e) => !e.current).length, reconciliados: entries.filter((e) => e.current && !e.baseline).length,
            jaImportados: entries.filter((e) => e.baseline).length, naoRelacionados: existing.filter((p) => !used.has(p.id)).length,
            conflitos: issues,
            existentes: existing.filter((p) => !logs.some((l) => l.entityId === p.id)).map((p) => ({ patrimonioId: p.id, nome: p.nome, slug: p.slug, numeroExibicao: p.numeroExibicao, expectedHash: reconciliationHash(p) })) },
    };
}

export async function seedPatrimonios(client, { baseUrl, dryRun = false, reconciliation = [], data = PATRIMONIOS, imageDirectory } = {}) {
    const counts = validateResearch(data);
    // Comparação de bytes apenas: a seed não importa nem executa o módulo do frontend.
    const sourcePath = process.env.PATRIMONIOS_SOURCE_PATH ?? fileURLToPath(new URL("../../portal-PrefGuarulhos/frontend/src/features/mocks/patrimoniosMock.js", import.meta.url));
    let sourceBytes;
    try { sourceBytes = await readFile(sourcePath); } catch (error) {
        if (process.env.PATRIMONIOS_SOURCE_PATH || error.code !== "ENOENT") fail("Não foi possível conferir PATRIMONIOS_SOURCE_PATH.");
    }
    if (sourceBytes && createHash("sha256").update(sourceBytes).digest("hex") !== SOURCE_SHA256) fail("O mock mudou desde a extração (inclusive possíveis comentários). Confira a fidelidade antes de atualizar o snapshot; nenhuma escrita foi feita.");
    const base = await validateAssets(baseUrl, data, imageDirectory);
    return client.$transaction(async (tx) => {
        // Serializa importações concorrentes. Nada é escrito antes da reconciliação completa.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(73124034)`;
        // Uma transação usa uma única conexão; evita consultas concorrentes no adapter pg.
        const existing = await tx.patrimonio.findMany({ include: researchInclude, orderBy: { id: "asc" } });
        const categories = await tx.categoria.findMany();
        const user = await tx.user.findUnique({ where: { email: SEED_EMAIL } });
        const logs = await tx.auditLog.findMany({ where: { action: IMPORT_ACTION, entity: "patrimonio" }, orderBy: { createdAt: "desc" } });
        const plan = planImport({ existing, categories, user, logs, baseUrl: base, reconciliation, data });
        if (dryRun) return { ...plan.report, counts };
        if (plan.issues.length) fail(`Carga bloqueada antes das escritas:\n${plan.issues.join("\n")}\nExecute --dry-run para revisar UUIDs e hashes.`);
        if (plan.entries.every((e) => e.baseline)) return { ...plan.report, counts };
        const author = user ?? await tx.user.create({ data: { name: "Importação de pesquisa patrimonial", email: SEED_EMAIL, passwordHash: await hashPassword(randomUUID()), role: "EDITOR", isActive: false } });
        const categoryIds = new Map();
        for (const slug of new Set(data.map((p) => p.categoria))) {
            const category = categories.find((c) => c.slug === slug) ?? await tx.categoria.create({ data: { nome: categoryNames[slug], slug } });
            categoryIds.set(slug, category.id);
        }
        const pending = plan.entries.filter((e) => !e.baseline);
        for (const e of pending) {
            if (e.current) await tx.auditLog.create({ data: { userId: author.id, action: "RECONCILE_PATRIMONIO_LEGACY", entity: "patrimonio", entityId: e.id, oldValues: jsonSnapshot(e.current), newValues: { numeroExibicao: e.source.numeroExibicao } } });
            const { nome, numeroExibicao, ordemExibicao, descricaoResumida, situacao } = e.expected;
            const owned = { nome, numeroExibicao, ordemExibicao, descricaoResumida, situacao, categoriaId: categoryIds.get(e.source.categoria) };
            if (e.current) await tx.patrimonio.update({ where: { id: e.id }, data: owned });
            else await tx.patrimonio.create({ data: { id: e.id, slug: e.slug, ...owned, createdBy: author.id, status: "RASCUNHO" } });
            await tx.localizacao.upsert({ where: { patrimonioId: e.id }, create: { patrimonioId: e.id, ...e.expected.localizacao }, update: e.expected.localizacao });
        }
        for (const e of pending) {
            // Dependentes anteriores foram aprovados pela reconciliação e permanecem no snapshot de auditoria.
            await tx.patrimonioSecao.deleteMany({ where: { patrimonioId: e.id } });
            await tx.patrimonioFato.deleteMany({ where: { patrimonioId: e.id } });
            if (e.expected.secoes.length) await tx.patrimonioSecao.createMany({ data: e.expected.secoes.map((s) => ({ patrimonioId: e.id, ...s })) });
            if (e.expected.fatos.length) await tx.patrimonioFato.createMany({ data: e.expected.fatos.map((f) => ({ patrimonioId: e.id, ...f })) });
        }
        for (const e of pending) {
            const cover = e.current?.imagens.find((i) => i.principal);
            if (cover) await tx.patrimonioImagem.update({ where: { id: cover.id }, data: { textoAlternativo: e.source.nome } });
            else await tx.patrimonioImagem.create({ data: { patrimonioId: e.id, ...e.expected.imagens[0] } });
        }
        for (const e of pending) {
            await tx.patrimonioLigacao.deleteMany({ where: { patrimonioOrigemId: e.id } });
            if (e.expected.ligacoes.length) await tx.patrimonioLigacao.createMany({ data: e.expected.ligacoes.map((l) => ({ patrimonioOrigemId: e.id, ...l })) });
        }
        for (const e of pending) {
            const stored = await tx.patrimonio.findUnique({ where: { id: e.id }, include: researchInclude });
            const managed = managedSnapshot(stored);
            if (!identical(managed, e.expected)) fail(`Verificação de fidelidade falhou: nº ${e.source.numeroExibicao}.`);
            await tx.auditLog.create({ data: { userId: author.id, action: IMPORT_ACTION, entity: "patrimonio", entityId: e.id, newValues: { version: 1, numeroExibicao: e.source.numeroExibicao, managed } } });
        }
        return { ...plan.report, counts };
    }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 120000 });
}

async function main() {
    const args = process.argv.slice(2);
    if (args.some((a) => a !== "--dry-run" && !a.startsWith("--reconcile="))) fail("Argumento desconhecido. Use --dry-run ou --reconcile=arquivo.json.");
    let database;
    try { database = new URL(process.env.DATABASE_URL); } catch { fail("DATABASE_URL inválida ou ausente."); }
    if (!["postgres:", "postgresql:"].includes(database.protocol)) fail("DATABASE_URL deve apontar para PostgreSQL.");
    const reconcilePath = args.find((a) => a.startsWith("--reconcile="))?.slice("--reconcile=".length);
    let reconciliation = [];
    if (reconcilePath) {
        try { reconciliation = JSON.parse(await readFile(resolve(reconcilePath), "utf8")); } catch { fail("Não foi possível ler o arquivo de reconciliação JSON."); }
    }
    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    try {
        const report = await seedPatrimonios(client, { baseUrl: process.env.PATRIMONIOS_PUBLIC_BASE_URL, dryRun: args.includes("--dry-run"), reconciliation });
        console.log(JSON.stringify(report, null, 2));
    } finally { await client.$disconnect(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    main().catch((error) => {
        console.error(error instanceof SeedValidationError ? error.message : "Falha na carga; transação revertida. Verifique a conexão, migrations e constraints sem divulgar credenciais.");
        process.exitCode = 1;
    });
}
