import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const testUrl = process.env.TEST_DATABASE_URL;
let safe = false;
try {
    const url = new URL(testUrl);
    safe = process.env.TEST_DATABASE_EXCLUSIVE === "1" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && /(?:^test_|_test$)/i.test(url.pathname.slice(1)) && testUrl !== process.env.DATABASE_URL;
} catch { /* Recusa configuração desconhecida antes de conectar. */ }

test("carga completa, reexecução, API, constraints e reconciliação em PostgreSQL exclusivo", {
    skip: !safe && "Use npm run test:postgres para criar um PostgreSQL isolado.",
}, async (context) => {
    process.env.DATABASE_URL = testUrl;
    process.env.JWT_SECRET = "patrimonio-integration-test-secret-32-characters";
    const { default: prisma } = await import("../src/config/prisma.js");
    const { default: app } = await import("../src/app.js");
    const { seedPatrimonios, managedSnapshot, researchInclude, reconciliationHash, SEED_EMAIL, IMPORT_ACTION } = await import("../prisma/seed.patrimonios.js");
    const { PATRIMONIOS, EXPECTED_COUNTS } = await import("../prisma/data/patrimonios.js");
    const { LEGACY_PATRIMONIOS } = await import("../prisma/data/reconciliacao.js");
    const { hashPassword } = await import("../src/utils/password.js");
    const { generateToken } = await import("../src/utils/token.js");
    const { Client } = await import("pg");
    const pg = new Client({ connectionString: testUrl });
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const options = { baseUrl };
    const records = () => prisma.patrimonio.findMany({ include: researchInclude, orderBy: { ordemExibicao: "asc" } });
    const reset = async () => {
        await prisma.auditLog.deleteMany(); await prisma.patrimonio.deleteMany(); await prisma.rota.deleteMany();
        await prisma.categoria.deleteMany(); await prisma.user.deleteMany();
    };
    const totals = async () => ({ patrimonios: await prisma.patrimonio.count(), localizacoes: await prisma.localizacao.count(), secoes: await prisma.patrimonioSecao.count(), fatos: await prisma.patrimonioFato.count(), ligacoes: await prisma.patrimonioLigacao.count(), imagens: await prisma.patrimonioImagem.count({ where: { principal: true } }) });
    try {
        await pg.connect();
        await reset();
        // O script legado contém um comando do psql e pressupõe um banco vazio.
        const integritySql = (await readFile(new URL("../prisma/tests/integrity.sql", import.meta.url), "utf8")).replace(/^\\set .*\r?\n/gm, "");
        try { await pg.query(integritySql); } finally { await pg.query("ROLLBACK"); }
        await context.test("migration incremental preserva um registro anterior com textos e datas", async () => {
            await pg.query("BEGIN");
            try {
                await pg.query('CREATE SCHEMA transition_test; SET LOCAL search_path TO transition_test, public');
                for (const migration of ["20260929230000_initial_schema", "20260930120000_add_demolido_situacao"]) await pg.query(await readFile(new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url), "utf8"));
                const author = randomUUID(), category = randomUUID(), id = randomUUID();
                await pg.query("INSERT INTO users(id,name,email,password_hash) VALUES ($1,'Editor','transition@example.test','hash')", [author]);
                await pg.query("INSERT INTO categoria(id,nome,slug) VALUES ($1,'Categoria anterior','anterior')", [category]);
                await pg.query("INSERT INTO patrimonio(id,name,slug,descricao,descricao_resumida,historia,importancia_cultural,status,published_at,categoria_id,created_by) VALUES ($1,'Anterior','slug-anterior','Descrição antiga','Resumo antigo','História antiga','Importância antiga','PUBLICADO','2015-01-01',$2,$3)", [id,category,author]);
                const before = (await pg.query('SELECT * FROM patrimonio WHERE id=$1', [id])).rows[0];
                await pg.query(await readFile(new URL("../prisma/migrations/20261005230000_add_pesquisa_patrimonios/migration.sql", import.meta.url), "utf8"));
                const { numero_exibicao, ordem_exibicao, ...after } = (await pg.query('SELECT * FROM patrimonio WHERE id=$1', [id])).rows[0];
                assert.deepEqual(after, before); assert.equal(numero_exibicao, null); assert.equal(ordem_exibicao, null);
                await pg.query('UPDATE patrimonio SET descricao=NULL WHERE id=$1', [id]);
            } finally { await pg.query("ROLLBACK"); }
        });
        await context.test("dry-run sem escritas, primeira carga fiel e 34 imagens acessíveis", async () => {
            const dry = await seedPatrimonios(prisma, { ...options, dryRun: true });
            assert.equal(dry.novos, 34); assert.deepEqual(dry.counts, EXPECTED_COUNTS);
            assert.equal(await prisma.user.count(), 0); assert.equal(await prisma.patrimonio.count(), 0);
            const first = await seedPatrimonios(prisma, options);
            assert.equal(first.novos, 34); assert.deepEqual(await totals(), EXPECTED_COUNTS);
            const all = await records();
            for (let i = 0; i < PATRIMONIOS.length; i++) {
                const p = all[i], source = PATRIMONIOS[i];
                assert.equal(p.numeroExibicao, Number(source.id)); assert.equal(p.ordemExibicao, i);
                assert.equal(p.nome, source.nome); assert.equal(p.descricaoResumida, source.resumo); assert.equal(p.categoria.slug, source.categoria);
                assert.equal(p.situacao, source.categoria === "demolido" ? "DEMOLIDO" : "NAO_INFORMADO");
                assert.equal(p.status, "RASCUNHO"); assert.equal(p.publicadoEm, null); assert.equal(p.descricao, null);
                assert.deepEqual(managedSnapshot(p).secoes, (source.detalhes ?? []).map((s, ordem) => ({ ...s, icone: s.icone ?? null, ordem })));
                assert.deepEqual(managedSnapshot(p).fatos, (source.fatos ?? []).map((f, ordem) => ({ ...f, ordem })));
                assert.equal(p.localizacao.endereco, source.endereco); assert.equal(p.localizacao.bairro, source.bairro);
                assert.equal(p.localizacao.cep, source.cep ?? null); assert.equal(Number(p.localizacao.latitude), source.localizacao.lat); assert.equal(Number(p.localizacao.longitude), source.localizacao.lng);
                assert.deepEqual(p.ligacoes.map((l) => ({ id: String(all.find((a) => a.id === l.patrimonioDestinoId).numeroExibicao), texto: l.texto })), source.ligacoes ?? []);
                const image = p.imagens.find((img) => img.principal);
                assert.equal(image.textoAlternativo, source.nome); assert.equal(image.credito, null); assert.equal(image.fonte, null);
                assert.equal(image.url, `${baseUrl}/arquivos/patrimonios/${source.imagemPrincipal}`);
                const response = await fetch(image.url); assert.equal(response.status, 200); assert.match(response.headers.get("content-type"), /^image\//);
            }
            const user = await prisma.user.findUnique({ where: { email: SEED_EMAIL } });
            assert.equal(user.isActive, false); assert.equal(user.role, "EDITOR");
            assert.equal((await (await fetch(`${baseUrl}/api/patrimonios`)).json()).data.paginacao.total, 0);
        });
        await context.test("segunda execução mantém todos os UUIDs, slugs, filhos e timestamps", async () => {
            const before = JSON.stringify(await records()); const audits = await prisma.auditLog.count();
            const result = await seedPatrimonios(prisma, options);
            assert.equal(result.jaImportados, 34); assert.equal(JSON.stringify(await records()), before);
            const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url)), "db", "seed"], {
                cwd: fileURLToPath(new URL("../", import.meta.url)), windowsHide: true,
                env: { ...process.env, PATRIMONIOS_PUBLIC_BASE_URL: baseUrl, CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
            });
            assert.match(stdout, /"jaImportados": 34/);
            assert.equal(JSON.stringify(await records()), before);
            assert.equal(await prisma.auditLog.count(), audits); assert.deepEqual(await totals(), EXPECTED_COUNTS);
        });
        await context.test("reexecução preserva publicação/arquivamento e bloqueia alteração administrativa da pesquisa", async () => {
            const date = new Date("2020-01-02T03:04:05.000Z");
            await prisma.patrimonio.update({ where: { numeroExibicao: 9 }, data: { status: "PUBLICADO", publicadoEm: date } });
            await prisma.patrimonio.update({ where: { numeroExibicao: 13 }, data: { status: "ARQUIVADO", arquivadoEm: date } });
            const before = JSON.stringify(await records()); await seedPatrimonios(prisma, options); assert.equal(JSON.stringify(await records()), before);
            const original = PATRIMONIOS.find((p) => p.id === "9").resumo;
            await prisma.patrimonio.update({ where: { numeroExibicao: 9 }, data: { descricaoResumida: "Edição administrativa posterior" } });
            const edited = JSON.stringify(await records());
            await assert.rejects(seedPatrimonios(prisma, options), /Divergência após importação/);
            assert.equal(JSON.stringify(await records()), edited);
            await prisma.patrimonio.update({ where: { numeroExibicao: 9 }, data: { descricaoResumida: original } });
        });
        await context.test("consulta pública paginada, busca em seções, detalhes ordenados e arrays vazios", async () => {
            await prisma.patrimonio.updateMany({ data: { status: "PUBLICADO", publicadoEm: new Date("2021-01-01T00:00:00Z"), arquivadoEm: null } });
            const body = await (await fetch(`${baseUrl}/api/patrimonios?limite=100`)).json();
            assert.deepEqual(body.data.itens.map((p) => p.numeroExibicao), PATRIMONIOS.map((p) => Number(p.id)));
            const page = await (await fetch(`${baseUrl}/api/patrimonios?pagina=2&limite=4`)).json();
            assert.equal(page.data.paginacao.total, 34); assert.deepEqual(page.data.itens.map((p) => p.numeroExibicao), [5, 6, 7, 8]);
            const search = await (await fetch(`${baseUrl}/api/patrimonios?busca=${encodeURIComponent("abraço simbólico")}`)).json();
            assert.deepEqual(search.data.itens.map((p) => p.numeroExibicao), [9, 13]);
            const category = await (await fetch(`${baseUrl}/api/patrimonios?categoria=demolido`)).json(); assert.equal(category.data.paginacao.total, 5);
            const all = await records(); const casa = all.find((p) => p.numeroExibicao === 9);
            const detail = (await (await fetch(`${baseUrl}/api/patrimonios/${casa.slug}`)).json()).data;
            assert.deepEqual(detail.secoes.map((s) => s.ordem), [0, 1, 2, 3, 4]); assert.deepEqual(detail.ligacoes.map((l) => l.destino.numeroExibicao), [13, 11]);
            const empty = all.find((p) => p.numeroExibicao === 5);
            const minimal = (await (await fetch(`${baseUrl}/api/patrimonios/${empty.slug}`)).json()).data;
            for (const field of ["secoes", "fatos", "ligacoes"]) assert.deepEqual(minimal[field], []);
            await prisma.patrimonio.update({ where: { numeroExibicao: 13 }, data: { status: "ARQUIVADO" } });
            const filtered = (await (await fetch(`${baseUrl}/api/patrimonios/${casa.slug}`)).json()).data;
            assert.deepEqual(filtered.ligacoes.map((l) => l.destino.numeroExibicao), [11]);
        });
        await context.test("checks, unicidades, FKs, capa única e constraints legadas", async () => {
            const all = await records(), a = all.find((p) => p.numeroExibicao === 9), b = all.find((p) => p.numeroExibicao === 13);
            const rejects = async (sql, params, code) => {
                await pg.query("BEGIN");
                try { await assert.rejects(pg.query(sql, params), (error) => error.code === code); } finally { await pg.query("ROLLBACK"); }
            };
            await rejects('UPDATE patrimonio SET numero_exibicao = 0 WHERE id=$1', [a.id], "23514");
            await rejects('UPDATE patrimonio SET ordem_exibicao = -1 WHERE id=$1', [a.id], "23514");
            await rejects('UPDATE patrimonio SET numero_exibicao = 9 WHERE id=$1', [b.id], "23505");
            await rejects('UPDATE patrimonio SET ordem_exibicao = 8 WHERE id=$1', [b.id], "23505");
            await rejects('INSERT INTO patrimonio_secoes (patrimonio_id,titulo,texto,ordem) VALUES ($1,\'T\',\'X\',-1)', [a.id], "23514");
            await rejects('INSERT INTO patrimonio_secoes (patrimonio_id,titulo,texto,ordem) VALUES ($1,\'T\',\'X\',0)', [a.id], "23505");
            await rejects('INSERT INTO patrimonio_fatos (patrimonio_id,rotulo,valor,ordem) VALUES ($1,\'R\',\'V\',-1)', [a.id], "23514");
            await rejects('INSERT INTO patrimonio_fatos (patrimonio_id,rotulo,valor,ordem) VALUES ($1,\'R\',\'V\',0)', [a.id], "23505");
            await rejects('INSERT INTO patrimonio_ligacoes (patrimonio_origem_id,patrimonio_destino_id,texto,ordem) VALUES ($1,$1,\'X\',99)', [a.id], "23514");
            await rejects('INSERT INTO patrimonio_ligacoes (patrimonio_origem_id,patrimonio_destino_id,texto,ordem) VALUES ($1,$2,\'X\',99)', [a.id,b.id], "23505");
            await rejects('INSERT INTO patrimonio_ligacoes (patrimonio_origem_id,patrimonio_destino_id,texto,ordem) VALUES ($1,$2,\'X\',-1)', [a.id,b.id], "23514");
            await rejects('INSERT INTO patrimonio_ligacoes (patrimonio_origem_id,patrimonio_destino_id,texto,ordem) VALUES ($1,$2,\'X\',99)', [a.id,randomUUID()], "23503");
            await rejects('INSERT INTO patrimonio_imagens (patrimonio_id,url,alt,is_capa) VALUES ($1,\'https://example.test/other.jpg\',\'Alt\',true)', [a.id], "23505");
        });
        await context.test("cadastro aceita estruturas novas sem descricao e cascade remove dependentes e ligações recebidas", async () => {
            const all = await records(), a = all[0], b = all[1];
            const editor = await prisma.user.create({ data: { name: "Editor teste", email: "cadastro@example.test", passwordHash: await hashPassword(randomUUID()), role: "EDITOR" } });
            const response = await fetch(`${baseUrl}/api/admin/patrimonios`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${generateToken(editor.id)}` }, body: JSON.stringify({ nome: "Cadastro novo teste", descricaoResumida: "Resumo", categoriaId: a.categoriaId, secoes: [{ titulo: "Seção", texto: "Texto", ordem: 0 }], fatos: [{ rotulo: "R", valor: "V", ordem: 0 }], ligacoes: [{ patrimonioDestinoId: a.id, texto: "Relação", ordem: 0 }] }) });
            assert.equal(response.status, 201); const p = (await response.json()).data;
            assert.equal(p.descricao, null); assert.equal(p.numeroExibicao, null); assert.equal(p.ordemExibicao, null); assert.equal(p.secoes.length, 1);
            await prisma.patrimonioLigacao.create({ data: { patrimonioOrigemId: b.id, patrimonioDestinoId: p.id, texto: "Recebida", ordem: 99 } });
            await prisma.patrimonio.delete({ where: { id: p.id } });
            assert.equal(await prisma.patrimonioSecao.count({ where: { patrimonioId: p.id } }), 0);
            assert.equal(await prisma.patrimonioFato.count({ where: { patrimonioId: p.id } }), 0);
            assert.equal(await prisma.patrimonioLigacao.count({ where: { OR: [{ patrimonioOrigemId: p.id }, { patrimonioDestinoId: p.id }] } }), 0);
            const count = await prisma.patrimonio.count();
            const post = (data) => fetch(`${baseUrl}/api/admin/patrimonios`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${generateToken(editor.id)}` }, body: JSON.stringify({ nome: "Cadastro inválido teste", descricaoResumida: "Resumo", categoriaId: a.categoriaId, ...data }) });
            const missing = await post({ ligacoes: [{ patrimonioDestinoId: randomUUID(), texto: "Inexistente", ordem: 0 }] });
            assert.equal(missing.status, 404); assert.equal((await missing.json()).error.code, "LIGACAO_DESTINO_NOT_FOUND");
            const conflict = await post({ numeroExibicao: 9 });
            assert.equal(conflict.status, 409); assert.equal((await conflict.json()).error.code, "PATRIMONIO_EDITORIAL_CONFLICT");
            assert.equal(await prisma.patrimonio.count(), count);
        });
        await context.test("falha na etapa de imagens reverte toda a carga", async () => {
            await reset();
            const failing = { $transaction: (fn, opts) => prisma.$transaction((tx) => fn(new Proxy(tx, { get(target, prop) { if (prop === "patrimonioImagem") return { create: async () => { throw new Error("Falha simulada"); } }; return target[prop]; } })), opts) };
            await assert.rejects(seedPatrimonios(failing, options), /Falha simulada/);
            assert.equal(await prisma.user.count(), 0); assert.equal(await prisma.categoria.count(), 0); assert.equal(await prisma.auditLog.count(), 0);
            assert.deepEqual(await totals(), { patrimonios: 0, localizacoes: 0, secoes: 0, fatos: 0, ligacoes: 0, imagens: 0 });
        });
        const createLegacy = async (number) => {
            const old = LEGACY_PATRIMONIOS.find((p) => p.numeroExibicao === number);
            const user = await prisma.user.findUnique({ where: { email: SEED_EMAIL } }) ?? await prisma.user.create({ data: { name: "Importação inicial de patrimônios", email: SEED_EMAIL, passwordHash: await hashPassword(randomUUID()), role: "EDITOR", isActive: false } });
            const category = await prisma.categoria.findUnique({ where: { nome: old.categoria } }) ?? await prisma.categoria.create({ data: { nome: old.categoria, slug: old.categoria.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() } });
            return prisma.patrimonio.create({ data: { nome: old.nome, slug: old.slug, descricao: old.descricao, descricaoResumida: old.descricao.slice(0,500), historia: old.historia, situacao: old.situacao, categoriaId: category.id, createdBy: user.id, status: "ARQUIVADO", publicadoEm: new Date("2010-01-01T00:00:00Z"), arquivadoEm: new Date("2011-01-01T00:00:00Z"), createdAt: new Date("2009-01-01T00:00:00Z"), ...(old.endereco && old.bairro ? { localizacao: { create: { endereco: old.endereco, numero: old.numero ?? null, bairro: old.bairro } } } : {}) }, include: researchInclude });
        };
        await context.test("reconciliação confirmada reutiliza UUID e slug e preserva textos legados e datas", async () => {
            const old = await createLegacy(9);
            const result = await seedPatrimonios(prisma, options); assert.equal(result.reconciliados, 1); assert.equal(result.novos, 33);
            const stored = await prisma.patrimonio.findUnique({ where: { numeroExibicao: 9 }, include: researchInclude });
            for (const key of ["id", "slug", "descricao", "historia", "createdBy", "status"]) assert.equal(stored[key], old[key]);
            for (const key of ["createdAt", "publicadoEm", "arquivadoEm"]) assert.equal(stored[key].toISOString(), old[key].toISOString());
            assert.deepEqual(stored.secoes.map((s) => s.texto), PATRIMONIOS.find((p) => p.id === "9").detalhes.map((s) => s.texto));
            const saved = await prisma.auditLog.findFirst({ where: { action: "RECONCILE_PATRIMONIO_LEGACY", entityId: old.id } }); assert.equal(saved.oldValues.descricao, old.descricao);
            const before = JSON.stringify(await records()); await seedPatrimonios(prisma, options); assert.equal(JSON.stringify(await records()), before);
        });
        await context.test("conflito prévio bloqueia sem escritas; reconciliação explícita verifica hash", async () => {
            await reset();
            const user = await prisma.user.create({ data: { name: "Editor", email: "existing@example.test", passwordHash: await hashPassword(randomUUID()), role: "EDITOR" } });
            const category = await prisma.categoria.create({ data: { nome: "Outra", slug: "outra" } });
            const ambiguous = LEGACY_PATRIMONIOS.find((p) => p.nome === "Estação Ferroviária Central de Guarulhos");
            const old = await prisma.patrimonio.create({ data: { nome: ambiguous.nome, slug: ambiguous.slug, descricao: "Texto anterior a preservar", descricaoResumida: "Resumo anterior", categoriaId: category.id, createdBy: user.id }, include: researchInclude });
            const before = JSON.stringify(await records());
            const dry = await seedPatrimonios(prisma, { ...options, dryRun: true }); assert.ok(dry.conflitos.some((i) => i.includes("ambígua")));
            await assert.rejects(seedPatrimonios(prisma, options), /antes das escritas/); assert.equal(JSON.stringify(await records()), before); assert.equal(await prisma.user.count(), 1);
            const reconciliation = [{ patrimonioId: old.id, numeroExibicao: 1, expectedHash: reconciliationHash(old) }];
            await assert.rejects(seedPatrimonios(prisma, { ...options, reconciliation: [{ ...reconciliation[0], expectedHash: "0".repeat(64) }] }), /desatualizada/);
            await seedPatrimonios(prisma, { ...options, reconciliation });
            const imported = await prisma.patrimonio.findUnique({ where: { numeroExibicao: 1 } }); assert.equal(imported.id, old.id); assert.equal(imported.slug, old.slug); assert.equal(imported.descricao, old.descricao);
        });
        await context.test("edição administrativa da seed antiga exige revisão e capa correta conserva créditos", async () => {
            await reset(); const old = await createLegacy(9);
            await prisma.patrimonio.update({ where: { id: old.id }, data: { descricaoResumida: "Revisão posterior" } });
            await assert.rejects(seedPatrimonios(prisma, options), /sem correspondência confirmada ou alterado/);
            const image = await prisma.patrimonioImagem.create({ data: { patrimonioId: old.id, url: `${baseUrl}/arquivos/patrimonios/casa_jose_mauricio.jpg`, textoAlternativo: "Descrição anterior", credito: "Crédito existente", fonte: "Fonte existente", principal: true } });
            const current = await prisma.patrimonio.findUnique({ where: { id: old.id }, include: researchInclude });
            await seedPatrimonios(prisma, { ...options, reconciliation: [{ patrimonioId: old.id, numeroExibicao: 9, expectedHash: reconciliationHash(current) }] });
            const retained = await prisma.patrimonioImagem.findUnique({ where: { id: image.id } }); assert.equal(retained.credito, image.credito); assert.equal(retained.fonte, image.fonte);
            await seedPatrimonios(prisma, options); assert.deepEqual(await totals(), EXPECTED_COUNTS);
            assert.equal(await prisma.auditLog.count({ where: { action: IMPORT_ACTION } }), 34);
        });
        await context.test("todas as 16 correspondências explícitas da seed antiga preservam UUIDs, slugs e textos", async () => {
            await reset();
            const oldRecords = [];
            for (const legacy of LEGACY_PATRIMONIOS.filter((p) => p.numeroExibicao !== null)) oldRecords.push(await createLegacy(legacy.numeroExibicao));
            const report = await seedPatrimonios(prisma, options);
            assert.equal(report.reconciliados, 16); assert.equal(report.novos, 18);
            assert.deepEqual(await totals(), EXPECTED_COUNTS);
            for (const old of oldRecords) {
                const imported = await prisma.patrimonio.findUnique({ where: { id: old.id } });
                for (const key of ["id", "slug", "descricao", "historia", "importanciaCultural", "createdBy", "status"]) assert.equal(imported[key], old[key]);
                assert.equal(imported.publicadoEm.toISOString(), old.publicadoEm.toISOString());
            }
            const before = JSON.stringify(await records()); await seedPatrimonios(prisma, options);
            assert.equal(JSON.stringify(await records()), before);
        });
    } finally {
        await new Promise((resolve) => server.close(resolve)); await pg.end(); await prisma.$disconnect();
    }
});
