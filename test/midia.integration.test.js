import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { test } from "node:test";
import pg from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL;
let databaseName;
try { databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1)); } catch { /* Não conectar sem configuração segura. */ }
const safeDatabase = process.env.TEST_DATABASE_EXCLUSIVE === "1" &&
    /(?:^test_|_test$)/i.test(databaseName ?? "") && databaseUrl !== process.env.DATABASE_URL;

test("PostgreSQL: publicação bloqueia as seis alterações de mídia e EDITOR relê status após commit", {
    skip: !safeDatabase && "Configure TEST_DATABASE_URL para PostgreSQL exclusivo *_test e TEST_DATABASE_EXCLUSIVE=1; bloqueio real não verificado.",
    timeout: 60000,
}, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "midia-concorrencia-test-"));
    process.env.UPLOAD_ROOT = root;
    process.env.DATABASE_URL = databaseUrl;
    const { default: prisma } = await import("../src/config/prisma.js");
    const midia = await import("../src/services/midiaService.js");
    const patrimonioService = await import("../src/services/patrimonioService.js");
    const { garantirPastas, PASTAS, URL_PREFIXO } = await import("../src/config/storage.js");
    const { updateDocumentoSchema } = await import("../src/schemas/midiaSchema.js");
    const monitor = new pg.Pool({ connectionString: databaseUrl });
    await garantirPastas();
    const key = randomUUID();
    let user, categoria, patrimonio;
    const originalTransaction = prisma.$transaction;
    const transaction = originalTransaction.bind(prisma);
    try {
        user = await prisma.user.create({ data: { name: "Teste mídia", email: `${key}@example.test`, passwordHash: "unused", role: "ADMIN" } });
        categoria = await prisma.categoria.create({ data: { nome: key, slug: key } });
        patrimonio = await patrimonioService.createPatrimonio({ nome: key, descricaoResumida: "Resumo", categoriaId: categoria.id }, user.id);
        const editor = { id: user.id, role: "EDITOR" };
        const imagem = await prisma.patrimonioImagem.create({ data: { patrimonioId: patrimonio.id, url: "https://example.test/imagem.jpg", textoAlternativo: "Original", principal: true } });
        const documento = await prisma.patrimonioDocumento.create({ data: { patrimonioId: patrimonio.id, url: "https://example.test/documento.pdf", titulo: "Original", tipo: "inventario", dataDocumento: new Date("2024-02-29") } });

        // Confere persistência real de NULL e preservação da data omitida no @db.Date.
        await midia.updateDocumento(patrimonio.id, documento.id, updateDocumentoSchema.parse({ fonte: "Fonte" }), editor);
        assert.equal((await prisma.patrimonioDocumento.findUnique({ where: { id: documento.id } })).dataDocumento.toISOString(), "2024-02-29T00:00:00.000Z");
        await midia.updateDocumento(patrimonio.id, documento.id, updateDocumentoSchema.parse({ dataDocumento: null }), editor);
        assert.equal((await prisma.patrimonioDocumento.findUnique({ where: { id: documento.id } })).dataDocumento, null);
        await midia.updateDocumento(patrimonio.id, documento.id, updateDocumentoSchema.parse({ dataDocumento: "2026-10-13" }), editor);
        assert.equal((await prisma.patrimonioDocumento.findUnique({ where: { id: documento.id } })).dataDocumento.toISOString(), "2026-10-13T00:00:00.000Z");

        for (const tipo of ["imagem", "documento"]) {
            for (const operacao of ["create", "update", "delete"]) {
                // Reinicia somente a fixture no banco exclusivo; a API não oferece
                // transição de volta para rascunho.
                await prisma.patrimonio.update({ where: { id: patrimonio.id }, data: { status: "RASCUNHO", publicadoEm: null } });
                const ext = tipo === "imagem" ? ".jpg" : ".pdf";
                const file = { path: path.join(PASTAS[tipo], `${randomUUID()}${ext}`), mimetype: tipo === "imagem" ? "image/jpeg" : "application/pdf" };
                const bytes = tipo === "imagem" ? Buffer.from([0xff, 0xd8, 0xff, 1]) : Buffer.from("%PDF-1.7");
                await fs.writeFile(file.path, bytes);
                const model = tipo === "imagem" ? "patrimonioImagem" : "patrimonioDocumento";
                const registro = tipo === "imagem" ? imagem : documento;
                if (operacao === "delete") await prisma[model].update({ where: { id: registro.id }, data: { url: `${URL_PREFIXO[tipo]}/${path.basename(file.path)}` } });
                let release, ready, publicationPid;
                const held = new Promise((resolve) => { release = resolve; });
                const started = new Promise((resolve) => { ready = resolve; });
                // Usa a publicação real e a transação real; apenas mantém o commit
                // pendente para observar o bloqueio PostgreSQL de forma determinística.
                prisma.$transaction = (callback) => transaction(async (tx) => {
                    const [backend] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
                    publicationPid = backend.pid;
                    const result = await callback(tx);
                    ready();
                    await held;
                    return result;
                }, { timeout: 20000 });
                const publication = patrimonioService.changePatrimonioStatus(patrimonio.id, "PUBLICADO", user);
                publication.catch(ready);
                await started;
                prisma.$transaction = originalTransaction;
                let attempt;
                try {
                    const suffix = tipo === "imagem" ? "Imagem" : "Documento";
                    attempt = operacao === "create"
                        ? midia[`create${suffix}`](patrimonio.id, tipo === "imagem" ? { textoAlternativo: "Nova", principal: true } : { titulo: "Novo", tipo: "pdf" }, file, editor)
                        : midia[`${operacao}${suffix}`](patrimonio.id, registro.id, ...(operacao === "update" ? [{ titulo: "Proibido" }, editor] : [editor]));
                    // Instala o handler imediatamente, mantendo a verificação depois do commit.
                    const outcome = attempt.then(() => ({ success: true }), (error) => ({ error }));
                    let waiting = false;
                    for (let i = 0; i < 100; i++) {
                        const result = await monitor.query("SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%SELECT id FROM patrimonio%' AND query LIKE '%FOR UPDATE%' AND $1::int = ANY(pg_blocking_pids(pid))", [publicationPid]);
                        if (result.rowCount) { waiting = true; break; }
                        await setTimeout(25);
                    }
                    assert.equal(waiting, true, `${tipo}/${operacao} deve aguardar FOR UPDATE real`);
                    release();
                    await publication;
                    const result = await outcome;
                    assert.equal(result.error?.statusCode, 403);
                    assert.equal((await prisma[model].findUnique({ where: { id: registro.id } })).titulo, tipo === "imagem" ? null : "Original");
                    assert.equal(await prisma[model].count({ where: { patrimonioId: patrimonio.id } }), 1);
                    assert.equal((await prisma.patrimonioImagem.findUnique({ where: { id: imagem.id } })).principal, true);
                    if (operacao === "create") await assert.rejects(fs.stat(file.path), { code: "ENOENT" });
                    else assert.deepEqual(await fs.readFile(file.path), bytes);
                } finally {
                    release();
                    await Promise.allSettled([publication, attempt]);
                    prisma.$transaction = originalTransaction;
                }
            }
        }
    } finally {
        prisma.$transaction = originalTransaction;
        try {
            if (patrimonio) await prisma.patrimonio.delete({ where: { id: patrimonio.id } });
            if (categoria) await prisma.categoria.delete({ where: { id: categoria.id } });
            if (user) await prisma.user.delete({ where: { id: user.id } });
        } finally {
            await monitor.end();
            await prisma.$disconnect();
            assert.equal(path.dirname(root), os.tmpdir());
            assert.ok(path.basename(root).startsWith("midia-concorrencia-test-"));
            await fs.rm(root, { recursive: true, force: true });
        }
    }
});
