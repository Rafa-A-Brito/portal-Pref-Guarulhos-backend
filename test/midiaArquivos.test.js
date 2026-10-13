import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

// Definido antes de importar a configuração. Nunca utiliza os uploads da aplicação.
const root = await fs.mkdtemp(path.join(os.tmpdir(), "midia-arquivos-test-"));
process.env.UPLOAD_ROOT = root;
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/midia_test";
process.env.JWT_SECRET = "midia-test-secret-with-at-least-32-characters";
const { default: prisma } = await import("../src/config/prisma.js");
const service = await import("../src/services/midiaService.js");
const { PASTAS, URL_PREFIXO, garantirPastas } = await import("../src/config/storage.js");
const arquivos = await import("../src/utils/arquivos.js");
const { validateComLimpezaDeArquivo } = await import("../src/middlewares/validate.js");
const schemas = await import("../src/schemas/midiaSchema.js");
await garantirPastas();
after(async () => {
    await prisma.$disconnect();
    const relative = path.relative(os.tmpdir(), root);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    assert.ok(path.basename(root).startsWith("midia-arquivos-test-"));
    await fs.rm(root, { recursive: true, force: true });
});

const user = { id: randomUUID(), role: "ADMIN" };
const casos = [
    { tipo: "imagem", model: "patrimonioImagem", criar: service.createImagem, excluir: service.deleteImagem,
        schema: schemas.createImagemSchema, ext: ".jpg", mime: "image/jpeg", bytes: Buffer.from([0xff, 0xd8, 0xff, 1]), metadados: { textoAlternativo: "Teste" } },
    { tipo: "documento", model: "patrimonioDocumento", criar: service.createDocumento, excluir: service.deleteDocumento,
        schema: schemas.createDocumentoSchema, ext: ".pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.7"), metadados: { titulo: "Teste", tipo: "inventario" } },
];
const erroDisco = () => Object.assign(new Error("Falha simulada de disco"), { code: "EACCES" });
const ausente = async (file) => assert.rejects(fs.stat(file), { code: "ENOENT" });
function logs(t) {
    const entries = [];
    t.mock.method(console, "error", (...args) => entries.push(args));
    return entries;
}
async function arquivo(caso, gravar = true) {
    const file = { path: path.join(PASTAS[caso.tipo], `${randomUUID()}${caso.ext}`), mimetype: caso.mime };
    if (gravar) await fs.writeFile(file.path, caso.bytes);
    return file;
}
function stub(t, target, method, implementation) {
    const original = target[method];
    target[method] = implementation;
    t.after(() => { target[method] = original; });
}
function banco(t, caso, file, onDelete) {
    stub(t, prisma, "$transaction", async (callback) => callback(prisma));
    stub(t, prisma, "$queryRaw", async () => []);
    const midia = { id: randomUUID(), patrimonioId: randomUUID(), url: `${URL_PREFIXO[caso.tipo]}/${path.basename(file.path)}` };
    stub(t, prisma.patrimonio, "findUnique", async () => ({ id: midia.patrimonioId, status: "RASCUNHO" }));
    stub(t, prisma[caso.model], "findFirst", async ({ where }) => {
        assert.deepEqual(where, { id: midia.id, patrimonioId: midia.patrimonioId });
        return midia;
    });
    stub(t, prisma[caso.model], "delete", async ({ where }) => {
        assert.deepEqual(where, { id: midia.id });
        return onDelete?.(midia);
    });
    return midia;
}
function conferirPendencia(entry, acao, midia, file) {
    const [message, details] = entry;
    assert.match(message, /Pendência/);
    assert.equal(details.acao, acao);
    assert.equal(details.midiaId, midia.id);
    assert.equal(details.patrimonioId, midia.patrimonioId);
    assert.equal(details.caminhoOriginal, file.path);
    assert.equal(path.dirname(details.caminhoQuarentena), arquivos.QUARENTENA_ROOT);
    assert.equal(details.code, "EACCES");
    return details;
}

for (const caso of casos) {
    test(`${caso.tipo}: rollback no commit restaura arquivo sem limpar quarentena antes`, async (t) => {
        const file = await arquivo(caso);
        const original = new Error("Commit falhou");
        let staged;
        const rename = fs.rename;
        t.mock.method(fs, "rename", async (from, to) => { staged = to; return rename(from, to); });
        const midia = banco(t, caso, file);
        stub(t, prisma, "$transaction", async (callback) => {
            await callback(prisma);
            await ausente(file.path);
            assert.deepEqual(await fs.readFile(staged), caso.bytes);
            throw original;
        });
        await assert.rejects(caso.excluir(midia.patrimonioId, midia.id, user), (error) => error === original);
        assert.deepEqual(await fs.readFile(file.path), caso.bytes);
        await ausente(staged);
    });

    test(`${caso.tipo}: limpeza definitiva aguarda confirmação do commit`, async (t) => {
        const file = await arquivo(caso);
        const midia = banco(t, caso, file);
        let committed = false;
        stub(t, prisma, "$transaction", async (callback) => {
            const result = await callback(prisma);
            committed = true;
            return result;
        });
        const unlink = fs.unlink;
        t.mock.method(fs, "unlink", async (target) => { assert.equal(committed, true); return unlink(target); });
        assert.equal((await caso.excluir(midia.patrimonioId, midia.id, user)).arquivoRemovido, true);
    });

    test(`${caso.tipo}: permissão definitiva após lock impede cadastro e limpa upload`, async (t) => {
        const file = await arquivo(caso);
        stub(t, prisma.patrimonio, "findUnique", async () => ({ status: "RASCUNHO" }));
        let locked = false;
        const tx = {
            $queryRaw: async (sql, id) => { assert.match(sql.join("?"), /FOR UPDATE/); assert.equal(id, "patrimonio"); locked = true; },
            patrimonio: { findUnique: async () => { assert.equal(locked, true); return { status: "PUBLICADO" }; } },
            [caso.model]: { create: async () => assert.fail("Não cadastrar após publicação") },
        };
        stub(t, prisma, "$transaction", async (callback) => callback(tx));
        await assert.rejects(caso.criar("patrimonio", caso.metadados, file, { role: "EDITOR" }), { statusCode: 403 });
        await ausente(file.path);
    });

    for (const status of ["RASCUNHO", "PUBLICADO", "ARQUIVADO"]) {
        for (const role of ["EDITOR", "ADMIN"]) {
            test(`${caso.tipo}: cadastro ${role} em ${status} verifica lock e usa mesma transação`, async (t) => {
                const file = await arquivo(caso);
                stub(t, prisma.patrimonio, "findUnique", async () => ({ status: "RASCUNHO" }));
                let locked = false, authorized = false, unmarked = false;
                const tx = {
                    $queryRaw: async () => { locked = true; },
                    patrimonio: { findUnique: async () => { assert.equal(locked, true); authorized = true; return { status }; } },
                    [caso.model]: {
                        updateMany: async ({ data }) => { assert.equal(authorized, true); assert.deepEqual(data, { principal: false }); unmarked = true; },
                        create: async ({ data }) => {
                            assert.equal(authorized, true);
                            if (caso.tipo === "imagem") assert.equal(unmarked, true);
                            return data;
                        },
                    },
                };
                stub(t, prisma, "$transaction", async (callback) => callback(tx));
                const metadados = { ...caso.metadados, ...(caso.tipo === "imagem" ? { principal: true } : {}) };
                if (role === "EDITOR" && status !== "RASCUNHO") {
                    await assert.rejects(caso.criar("patrimonio", metadados, file, { role }), { statusCode: 403 });
                    assert.equal(unmarked, false);
                    await ausente(file.path);
                } else {
                    const result = await caso.criar("patrimonio", metadados, file, { role });
                    assert.equal(result.patrimonioId, "patrimonio");
                    assert.equal(result.url, `${URL_PREFIXO[caso.tipo]}/${path.basename(file.path)}`);
                    assert.deepEqual(await fs.readFile(file.path), caso.bytes);
                }
            });

            test(`${caso.tipo}: PATCH e DELETE ${role} em ${status} usam client da transação`, async (t) => {
                const file = await arquivo(caso);
                const midia = banco(t, caso, file);
                const atualizar = caso.tipo === "imagem" ? service.updateImagem : service.updateDocumento;
                const schema = caso.tipo === "imagem" ? schemas.updateImagemSchema : schemas.updateDocumentoSchema;
                const stored = caso.tipo === "imagem"
                    ? { titulo: "Original", credito: "Autor", fonte: "Fonte", textoAlternativo: "Alt" }
                    : { titulo: "Original", descricao: "Descrição", fonte: "Fonte", dataDocumento: new Date("2024-02-29") };
                let locked;
                const tx = {
                    $queryRaw: async () => { locked = true; },
                    patrimonio: { findUnique: async () => { assert.equal(locked, true); return { status }; } },
                    [caso.model]: {
                        findFirst: async () => midia,
                        update: async ({ data }) => { Object.assign(stored, data); return { ...stored }; },
                        delete: async () => midia,
                    },
                };
                stub(t, prisma, "$transaction", async (callback) => { locked = false; return callback(tx); });
                if (role === "EDITOR" && status !== "RASCUNHO") {
                    await assert.rejects(atualizar(midia.patrimonioId, midia.id, { fonte: null }, { role }), { statusCode: 403 });
                    await assert.rejects(caso.excluir(midia.patrimonioId, midia.id, { role }), { statusCode: 403 });
                    assert.deepEqual(await fs.readFile(file.path), caso.bytes);
                } else {
                    const first = await atualizar(midia.patrimonioId, midia.id, schema.parse({ fonte: null }), { role });
                    assert.equal(first.fonte, null);
                    assert.equal(first.titulo, "Original");
                    const fields = caso.tipo === "imagem" ? ["titulo", "credito"] : ["descricao", "dataDocumento"];
                    for (const field of fields) {
                        assert.equal((await atualizar(midia.patrimonioId, midia.id, schema.parse({ [field]: null }), { role }))[field], null);
                    }
                    if (caso.tipo === "documento") {
                        const result = await atualizar(midia.patrimonioId, midia.id, schema.parse({ dataDocumento: "2026-10-13" }), { role });
                        assert.equal(result.dataDocumento.toISOString(), "2026-10-13T00:00:00.000Z");
                    }
                    assert.equal((await caso.excluir(midia.patrimonioId, midia.id, { role })).arquivoRemovido, true);
                }
            });
        }
    }

    test(`${caso.tipo}: metadados inválidos limpam upload e preservam erro de validação`, async () => {
        const file = await arquivo(caso);
        let original, forwarded;
        const schema = { parse(body) {
            try { return caso.schema.parse(body); } catch (error) { original = error; throw error; }
        } };
        await validateComLimpezaDeArquivo(schema)({ body: {}, file }, {}, (error) => { forwarded = error; });
        assert.ok(original);
        assert.strictEqual(forwarded, original);
        await ausente(file.path);
    });

    test(`${caso.tipo}: limpeza de validação falha, gera log e mantém erro original`, async (t) => {
        const file = await arquivo(caso);
        const entries = logs(t);
        const original = new Error("Erro de validação original");
        t.mock.method(fs, "unlink", async () => { throw erroDisco(); });
        let forwarded;
        await validateComLimpezaDeArquivo({ parse() { throw original; } })({ body: {}, file, validatedParams: { id: "patrimonio" } }, {}, (error) => { forwarded = error; });
        assert.strictEqual(forwarded, original);
        assert.equal(entries.length, 1);
        assert.equal(entries[0][1].acao, "limpar_upload");
        assert.equal(entries[0][1].caminhoOriginal, file.path);
        assert.equal(entries[0][1].patrimonioId, "patrimonio");
        assert.equal(entries[0][1].code, "EACCES");
        assert.deepEqual(await fs.readFile(file.path), caso.bytes);
    });

    for (const falharLimpeza of [false, true]) {
        test(`${caso.tipo}: erro de criação no banco preservado; limpeza ${falharLimpeza ? "falha com log" : "remove upload"}`, async (t) => {
            const file = await arquivo(caso);
            const original = new Error("Erro original do banco");
            const entries = logs(t);
            stub(t, prisma.patrimonio, "findUnique", async () => ({ status: "RASCUNHO" }));
            stub(t, prisma[caso.model], "create", async () => { throw original; });
            stub(t, prisma, "$transaction", async (callback) => callback(prisma));
            stub(t, prisma, "$queryRaw", async () => []);
            if (falharLimpeza) t.mock.method(fs, "unlink", async () => { throw erroDisco(); });
            await assert.rejects(caso.criar("patrimonio", caso.metadados, file, user), (error) => error === original);
            if (falharLimpeza) {
                assert.equal(entries.length, 1);
                assert.equal(entries[0][1].caminhoOriginal, file.path);
                assert.equal(entries[0][1].origem, `criar_${caso.tipo}`);
                assert.equal(entries[0][1].code, "EACCES");
                assert.deepEqual(await fs.readFile(file.path), caso.bytes);
            } else {
                assert.equal(entries.length, 0);
                await ausente(file.path);
            }
        });
    }

    test(`${caso.tipo}: falha no DELETE do banco restaura arquivo e mantém erro original`, async (t) => {
        const file = await arquivo(caso);
        const original = new Error("DELETE falhou");
        const entries = logs(t);
        let staged;
        const rename = fs.rename;
        t.mock.method(fs, "rename", async (from, to) => { staged = to; return rename(from, to); });
        const midia = banco(t, caso, file, async () => {
            await ausente(file.path);
            assert.deepEqual(await fs.readFile(staged), caso.bytes);
            throw original;
        });
        await assert.rejects(caso.excluir(midia.patrimonioId, midia.id, user), (error) => error === original);
        assert.deepEqual(await fs.readFile(file.path), caso.bytes);
        await ausente(staged);
        assert.equal(entries.length, 0);
    });

    test(`${caso.tipo}: exclusão bem-sucedida limpa quarentena depois do banco`, async (t) => {
        const file = await arquivo(caso);
        let staged;
        const rename = fs.rename;
        t.mock.method(fs, "rename", async (from, to) => { staged = to; return rename(from, to); });
        const midia = banco(t, caso, file, async () => {
            await ausente(file.path);
            assert.deepEqual(await fs.readFile(staged), caso.bytes);
        });
        const result = await caso.excluir(midia.patrimonioId, midia.id, user);
        assert.deepEqual(result, { ...midia, arquivoRemovido: true });
        await ausente(file.path);
        await ausente(staged);
    });

    test(`${caso.tipo}: arquivo já ausente permite excluir registro`, async (t) => {
        const file = await arquivo(caso, false);
        let deleted = false;
        const midia = banco(t, caso, file, () => { deleted = true; });
        assert.equal((await caso.excluir(midia.patrimonioId, midia.id, user)).arquivoRemovido, true);
        assert.equal(deleted, true);
    });

    test(`${caso.tipo}: falha ao mover para quarentena preserva registro e arquivo`, async (t) => {
        const file = await arquivo(caso);
        logs(t);
        const midia = banco(t, caso, file, () => assert.fail("Banco não deve excluir antes da quarentena."));
        t.mock.method(fs, "rename", async () => { throw erroDisco(); });
        await assert.rejects(caso.excluir(midia.patrimonioId, midia.id, user), { code: "ARQUIVO_NAO_REMOVIDO" });
        assert.deepEqual(await fs.readFile(file.path), caso.bytes);
    });

    test(`${caso.tipo}: restauração falha, mantém erro do banco e registra recuperação`, async (t) => {
        const file = await arquivo(caso);
        const original = new Error("DELETE falhou");
        const entries = logs(t);
        const midia = banco(t, caso, file, () => { throw original; });
        t.mock.method(fs, "copyFile", async () => { throw erroDisco(); });
        await assert.rejects(caso.excluir(midia.patrimonioId, midia.id, user), (error) => error === original);
        assert.equal(entries.length, 1);
        const details = conferirPendencia(entries[0], "restaurar_quarentena", midia, file);
        assert.equal(details.registroExcluido, false);
        await ausente(file.path);
        assert.deepEqual(await fs.readFile(details.caminhoQuarentena), caso.bytes);
    });

    test(`${caso.tipo}: limpeza final falha após DELETE, sinaliza e registra pendência`, async (t) => {
        const file = await arquivo(caso);
        const entries = logs(t);
        let deleted = false;
        const midia = banco(t, caso, file, () => { deleted = true; });
        t.mock.method(fs, "unlink", async () => { throw erroDisco(); });
        const result = await caso.excluir(midia.patrimonioId, midia.id, user);
        assert.equal(deleted, true);
        assert.equal(result.arquivoRemovido, false);
        assert.equal(entries.length, 1);
        const details = conferirPendencia(entries[0], "limpar_quarentena", midia, file);
        assert.equal(details.registroExcluido, true);
        await ausente(file.path);
        assert.deepEqual(await fs.readFile(details.caminhoQuarentena), caso.bytes);
    });

    test(`${caso.tipo}: restauração não sobrescreve arquivo existente`, async (t) => {
        const file = await arquivo(caso);
        const original = new Error("DELETE falhou");
        const entries = logs(t);
        const novoConteudo = Buffer.from("Arquivo que reapareceu");
        const midia = banco(t, caso, file, async () => {
            await fs.writeFile(file.path, novoConteudo);
            throw original;
        });
        await assert.rejects(caso.excluir(midia.patrimonioId, midia.id, user), (error) => error === original);
        assert.equal(entries.length, 1);
        const details = entries[0][1];
        assert.equal(details.acao, "restaurar_quarentena");
        assert.equal(details.code, "EEXIST");
        assert.equal(details.midiaId, midia.id);
        assert.deepEqual(await fs.readFile(file.path), novoConteudo);
        assert.deepEqual(await fs.readFile(details.caminhoQuarentena), caso.bytes);
    });

    test(`${caso.tipo}: restauração copia arquivo mas falha na limpeza, registra ambos os caminhos`, async (t) => {
        const file = await arquivo(caso);
        const original = new Error("DELETE falhou");
        const entries = logs(t);
        const midia = banco(t, caso, file, () => { throw original; });
        t.mock.method(fs, "unlink", async () => { throw erroDisco(); });
        await assert.rejects(caso.excluir(midia.patrimonioId, midia.id, user), (error) => error === original);
        assert.equal(entries.length, 1);
        const details = conferirPendencia(entries[0], "restaurar_quarentena", midia, file);
        assert.deepEqual(await fs.readFile(file.path), caso.bytes);
        assert.deepEqual(await fs.readFile(details.caminhoQuarentena), caso.bytes);
    });

    test(`${caso.tipo}: URL externa não move nem apaga arquivo`, async (t) => {
        const file = await arquivo(caso);
        const midia = banco(t, caso, file);
        midia.url = `https://example.test${midia.url}`;
        t.mock.method(fs, "rename", async () => assert.fail("Não mover URL externa."));
        t.mock.method(fs, "unlink", async () => assert.fail("Não apagar URL externa."));
        assert.equal((await caso.excluir(midia.patrimonioId, midia.id, user)).arquivoRemovido, true);
        assert.deepEqual(await fs.readFile(file.path), caso.bytes);
    });

    test(`${caso.tipo}: URL com travessia de diretórios não move nem apaga`, async (t) => {
        const file = await arquivo(caso);
        const midia = banco(t, caso, file);
        midia.url = `${URL_PREFIXO[caso.tipo]}/../${path.basename(file.path)}`;
        t.mock.method(fs, "rename", async () => assert.fail("Não mover caminho inválido."));
        t.mock.method(fs, "unlink", async () => assert.fail("Não apagar caminho inválido."));
        await caso.excluir(midia.patrimonioId, midia.id, user);
        assert.deepEqual(await fs.readFile(file.path), caso.bytes);
    });
}

test("troca de imagem principal preserva desmarcação e edição na mesma transação", async (t) => {
    stub(t, prisma.patrimonio, "findUnique", async () => ({ status: "RASCUNHO" }));
    const calls = [];
    const tx = {
        $queryRaw: async () => calls.push("lock"),
        patrimonio: { findUnique: async () => { calls.push("status"); return { status: "RASCUNHO" }; } },
        patrimonioImagem: {
            findFirst: async ({ where }) => { calls.push("midia"); assert.deepEqual(where, { id: "imagem", patrimonioId: "patrimonio" }); return { id: "imagem" }; },
            updateMany: async ({ where }) => { calls.push("desmarcar"); assert.deepEqual(where, { patrimonioId: "patrimonio", principal: true, id: { not: "imagem" } }); },
            update: async ({ data }) => { calls.push("editar"); return data; },
        },
    };
    stub(t, prisma, "$transaction", async (callback) => callback(tx));
    assert.deepEqual(await service.updateImagem("patrimonio", "imagem", { principal: true }, user), { principal: true });
    assert.deepEqual(calls, ["lock", "status", "midia", "desmarcar", "editar"]);
});

test("proteções de caminho e quarentena privada nas rotas públicas", async (t) => {
    const file = await arquivo(casos[0]);
    const outside = path.join(path.dirname(root), `${randomUUID()}.jpg`);
    t.mock.method(fs, "rename", async () => assert.fail("Não mover fora da raiz."));
    t.mock.method(fs, "unlink", async () => assert.fail("Não apagar fora da raiz."));
    assert.equal(await arquivos.apagarArquivoGerenciado(outside), false);
    await assert.rejects(arquivos.moverParaQuarentena(outside), { code: "INVALID_MEDIA_PATH" });
    await assert.rejects(arquivos.restaurarDaQuarentena({ original: file.path, quarentena: outside }), { code: "INVALID_MEDIA_PATH" });
    assert.equal(schemas.arquivoParamsSchema.safeParse({ tipo: ".quarentena", arquivo: path.basename(file.path) }).success, false);
    assert.equal(schemas.arquivoParamsSchema.safeParse({ tipo: "imagens", arquivo: `../.quarentena/${path.basename(file.path)}` }).success, false);
    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    try {
        await new Promise((resolve) => server.once("listening", resolve));
        stub(t, prisma.patrimonioImagem, "findFirst", async () => assert.fail("Não procurar registro de quarentena."));
        const base = `http://127.0.0.1:${server.address().port}`;
        assert.equal((await fetch(`${base}/api/uploads/.quarentena/${path.basename(file.path)}`)).status, 400);
        assert.equal((await fetch(`${base}/uploads/.quarentena/${path.basename(file.path)}`)).status, 404);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
