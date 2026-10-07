import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";

process.env.DATABASE_URL = "postgresql://localhost:5432/test_patrimonio";
process.env.JWT_SECRET = "test-secret-with-at-least-32-characters";
const { default: app } = await import("../src/app.js");
const { default: prisma } = await import("../src/config/prisma.js");
const { generateToken } = await import("../src/utils/token.js");
const schemas = await import("../src/schemas/patrimonioSchema.js");
const service = await import("../src/services/patrimonioService.js");
let server, base;
before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
});
const admin = { id: randomUUID(), role: "ADMIN", isActive: true };
const editor = { id: randomUUID(), role: "EDITOR", isActive: true };
function stub(t, target, method, implementation) {
    const original = target[method];
    target[method] = implementation;
    t.after(() => { target[method] = original; });
}
const record = (extra = {}) => ({
    id: randomUUID(), nome: "Igreja", slug: "igreja", descricao: "Descrição", descricaoResumida: "Resumo",
    categoriaId: randomUUID(), situacao: "PRESERVADO", status: "RASCUNHO", historia: null,
    importanciaCultural: null, localizacao: null, publicadoEm: null, arquivadoEm: null,
    imagens: [{ id: randomUUID() }], documentos: [{ id: randomUUID() }], ...extra,
});
function database(t, initial = record()) {
    let state = initial;
    const writes = [];
    let locks = 0;
    const tx = {
        $queryRaw: async () => { locks++; return []; },
        categoria: { findUnique: async ({ where }) => ({ id: where.id }) },
        patrimonio: {
            findUnique: async () => state,
            update: async ({ data }) => {
                writes.push(data);
                const { localizacao, ...fields } = data;
                state = { ...state, ...fields };
                if (localizacao) state.localizacao = localizacao.create ?? { ...state.localizacao, ...localizacao.update };
                return state;
            },
        },
    };
    stub(t, prisma, "$transaction", async (fn) => fn(tx));
    stub(t, prisma.patrimonio, "findUnique", async () => state);
    stub(t, prisma.user, "findUnique", async ({ where }) => where.id === admin.id ? admin : editor);
    return { tx, writes, state: () => state, locks: () => locks };
}
async function request(path, { user, method = "GET", body } = {}) {
    const response = await fetch(`${base}${path}`, { method, headers: {
        ...(user && { authorization: `Bearer ${generateToken(user.id)}` }),
        ...(body !== undefined && { "content-type": "application/json" }),
    }, ...(body !== undefined && { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
}

test("schemas parciais não introduzem defaults e recusam campos vazios/protegidos", () => {
    assert.deepEqual(schemas.updatePatrimonioSchema.parse({ nome: " Novo " }), { nome: "Novo" });
    assert.deepEqual(schemas.updatePatrimonioSchema.parse({ localizacao: { bairro: "Centro" } }), { localizacao: { bairro: "Centro" } });
    for (const body of [{}, { localizacao: {} }, { nome: " " }, { categoriaId: "123" }, { localizacao: { latitude: 91 } },
        ...["id", "slug", "status", "createdBy", "updatedBy", "createdAt", "updatedAt", "publicadoEm", "arquivadoEm", "imagens", "documentos"].map((key) => ({ [key]: "x" })),
        { localizacao: { id: randomUUID() } }]) {
        assert.equal(schemas.updatePatrimonioSchema.safeParse(body).success, false, JSON.stringify(body));
    }
    assert.equal(schemas.adminListPatrimoniosQuerySchema.safeParse({ status: "OUTRO" }).success, false);
    assert.equal(schemas.listPatrimoniosQuerySchema.safeParse({ status: "RASCUNHO" }).success, false);
});

test("listagem administrativa reutiliza filtros, paginação e ordenação estável em todos os status", async (t) => {
    database(t);
    let args;
    let countWhere;
    stub(t, prisma.patrimonio, "count", async ({ where }) => { countWhere = where; return 0; });
    stub(t, prisma.patrimonio, "findMany", async (input) => { args = input; return []; });
    for (const status of [undefined, "RASCUNHO", "PUBLICADO", "ARQUIVADO"]) {
        const result = await request(`/admin/patrimonios?busca=igreja&categoria=Religioso&bairro=Centro&situacao=PRESERVADO&pagina=2&limite=5${status ? `&status=${status}` : ""}`, { user: editor });
        assert.equal(result.status, 200);
        assert.equal(args.where.status, status);
        assert.deepEqual(countWhere, args.where);
        assert.equal(args.where.OR.length, 6);
        assert.equal(args.where.OR[0].nome.contains, "igreja");
        const categoryFilter = { OR: [
            { nome: { equals: "Religioso", mode: "insensitive" } },
            { slug: { equals: "Religioso", mode: "insensitive" } },
        ] };
        assert.deepEqual(args.where.AND[0].OR[0].categoria, categoryFilter);
        assert.deepEqual(args.where.AND[0].OR[1].categoriasAdicionais.some.categoria, categoryFilter);
        assert.equal(args.where.localizacao.is.bairro.equals, "Centro");
        assert.equal(args.where.situacao, "PRESERVADO");
        assert.equal(args.skip, 5);
        assert.equal(args.take, 5);
        assert.deepEqual(args.orderBy, [{ ordemExibicao: { sort: "asc", nulls: "last" } }, { nome: "asc" }, { id: "asc" }]);
        assert.equal(args.select.status, true);
        assert.equal(args.select.arquivadoEm, true);
        assert.equal(args.select.numeroExibicao, true);
        assert.equal(args.select.ordemExibicao, true);
        assert.deepEqual(result.body.data, { itens: [], paginacao: { pagina: 2, limite: 5, total: 0, totalPaginas: 0 } });
    }
});

test("detalhes administrativos incluem relações e aceitam qualquer status por UUID textual", async (t) => {
    stub(t, prisma.user, "findUnique", async () => editor);
    let current;
    stub(t, prisma.patrimonio, "findUnique", async ({ where, include }) => {
        assert.equal(where.id, current.id);
        assert.equal(include.categoria, true);
        assert.equal(include.localizacao, true);
        assert.ok(include.imagens && include.documentos);
        assert.ok(include.categoriasAdicionais.include.categoria);
        for (const field of ["secoes", "fatos", "ligacoes"]) assert.deepEqual(include[field].orderBy, { ordem: "asc" });
        return current;
    });
    for (const status of ["RASCUNHO", "PUBLICADO", "ARQUIVADO"]) {
        current = record({ status });
        const result = await request(`/admin/patrimonios/${current.id}`, { user: editor });
        assert.equal(result.status, 200);
        assert.equal(result.body.data.status, status);
    }
});

test("edição preserva slug, campos omitidos e mídias, registra updatedBy", async (t) => {
    const original = record();
    const db = database(t, original);
    const result = await request(`/admin/patrimonios/${original.id}`, { user: editor, method: "PATCH", body: { nome: "Novo" } });
    assert.equal(result.status, 200);
    assert.deepEqual(db.state(), { ...original, nome: "Novo", updatedBy: editor.id });
    assert.deepEqual(db.writes[0], { nome: "Novo", updatedBy: editor.id });
    assert.equal(db.locks(), 1);
});

test("localização pode ser criada e atualizada parcialmente, validando coordenadas finais", async (t) => {
    const db = database(t);
    const id = db.state().id;
    await assert.rejects(service.updatePatrimonio(id, { localizacao: { bairro: "Centro" } }, admin));
    await assert.rejects(service.updatePatrimonio(id, { localizacao: { endereco: "Rua", bairro: "Centro", latitude: 1 } }, admin));
    assert.equal(db.writes.length, 0);
    await service.updatePatrimonio(id, { localizacao: { endereco: "Rua", bairro: "Centro", latitude: 1, longitude: 2 } }, admin);
    assert.equal(db.state().localizacao.cidade, "Guarulhos");
    assert.equal(db.state().localizacao.uf, "SP");
    await service.updatePatrimonio(id, { localizacao: { cidade: "Outra", uf: "RJ" } }, admin);
    await service.updatePatrimonio(id, schemas.updatePatrimonioSchema.parse({ localizacao: { latitude: 3 } }), admin);
    assert.deepEqual(db.state().localizacao, { endereco: "Rua", bairro: "Centro", cidade: "Outra", uf: "RJ", latitude: 3, longitude: 2 });
});

test("localização Prisma Decimal e campos opcionais nulos são validados sem sobrescrever omitidos", async (t) => {
    const { Prisma } = await import("@prisma/client");
    const db = database(t, record({ localizacao: { id: randomUUID(), patrimonioId: randomUUID(), endereco: "Rua", bairro: "Centro", cidade: "Guarulhos", uf: "SP", numero: null, cep: null, latitude: new Prisma.Decimal(1), longitude: new Prisma.Decimal(2) } }));
    await service.updatePatrimonio(db.state().id, { localizacao: { bairro: "Novo" } }, admin);
    assert.deepEqual(db.writes[0].localizacao, { update: { bairro: "Novo" } });
});

test("categoria inexistente retorna 400 e não escreve", async (t) => {
    const db = database(t);
    db.tx.categoria.findUnique = async () => null;
    const result = await request(`/admin/patrimonios/${db.state().id}`, { user: admin, method: "PATCH", body: { categoriaId: randomUUID() } });
    assert.equal(result.status, 400);
    assert.equal(db.writes.length, 0);
});

test("EDITOR não edita publicados/arquivados; ADMIN edita ambos", async (t) => {
    const db = database(t);
    for (const status of ["PUBLICADO", "ARQUIVADO"]) {
        db.state().status = status;
        const path = `/admin/patrimonios/${db.state().id}`;
        assert.equal((await request(path, { user: editor, method: "PATCH", body: { nome: "Novo" } })).status, 403);
        assert.equal((await request(path, { user: admin, method: "PATCH", body: { nome: "Novo" } })).status, 200);
    }
});

test("publicar, arquivar e republicar mantêm datas, autoria, mídias e visibilidade pública", async (t) => {
    const original = record();
    const db = database(t, original);
    stub(t, prisma.patrimonio, "findFirst", async ({ where }) => db.state().status === where.status ? db.state() : null);
    stub(t, prisma.patrimonio, "count", async ({ where }) => Number(db.state().status === where.status));
    stub(t, prisma.patrimonio, "findMany", async ({ where }) => db.state().status === where.status ? [db.state()] : []);
    for (const action of ["publicar", "arquivar", "publicar"]) {
        const start = Date.now();
        const response = await request(`/admin/patrimonios/${original.id}/${action}`, { user: admin, method: "PATCH" });
        assert.equal(response.status, 200);
        const current = db.state();
        const published = action === "publicar";
        const date = published ? current.publicadoEm : current.arquivadoEm;
        assert.ok(date.getTime() >= start && date.getTime() <= Date.now());
        if (published) assert.equal(current.arquivadoEm, null);
        else assert.ok(current.publicadoEm instanceof Date);
        assert.equal(current.updatedBy, admin.id);
        assert.deepEqual(current.imagens, original.imagens);
        assert.deepEqual(current.documentos, original.documentos);
        const writes = db.writes.length;
        const snapshot = { ...current };
        await request(`/admin/patrimonios/${original.id}/${action}`, { user: admin, method: "PATCH" });
        assert.equal(db.writes.length, writes);
        assert.deepEqual(db.state(), snapshot);
        assert.equal((await request("/patrimonios/igreja")).status, published ? 200 : 404);
        assert.equal((await request("/patrimonios")).body.data.itens.length, published ? 1 : 0);
    }
    assert.equal((await request("/patrimonios?status=RASCUNHO")).status, 400);
});

test("arquiva rascunho preservando data de publicação nula; publicação valida cadastro", async (t) => {
    const db = database(t, record({ descricao: "" }));
    const path = `/admin/patrimonios/${db.state().id}`;
    assert.equal((await request(`${path}/publicar`, { user: admin, method: "PATCH" })).status, 400);
    assert.equal(db.writes.length, 0);
    assert.equal((await request(`${path}/arquivar`, { user: admin, method: "PATCH" })).status, 200);
    assert.equal(db.state().publicadoEm, null);
});

test("rotas exigem login, UUID válido, existência e ADMIN nas transições", async (t) => {
    const db = database(t, null);
    const id = randomUUID();
    for (const [method, suffix, body] of [["GET", "", undefined], ["PATCH", "", { nome: "Novo" }], ["PATCH", "/publicar", undefined], ["PATCH", "/arquivar", undefined]]) {
        assert.equal((await request(`/admin/patrimonios/${id}${suffix}`, { method, body })).status, 401);
        assert.equal((await request(`/admin/patrimonios/123${suffix}`, { user: admin, method, body })).status, 400);
        assert.equal((await request(`/admin/patrimonios/${id}${suffix}`, { user: admin, method, body })).status, 404);
    }
    assert.equal((await request("/admin/patrimonios")).status, 401);
    for (const action of ["publicar", "arquivar"]) {
        assert.equal((await request(`/admin/patrimonios/${id}/${action}`, { user: editor, method: "PATCH" })).status, 403);
    }
    assert.equal(db.writes.length, 0);
});

test("Swagger expõe endpoints, autenticação e schemas", async () => {
    const { body } = await request("/docs.json");
    assert.equal(body.openapi, "3.0.3");
    assert.ok(body.paths["/api/admin/patrimonios/{id}"].patch);
    assert.ok(body.paths["/api/admin/patrimonios/{id}/publicar"].patch.security);
    assert.equal((await fetch(`${base}/docs`)).status, 200);
});

test("falhas internas do Prisma não expõem mensagens do banco", async (t) => {
    const db = database(t);
    const { Prisma } = await import("@prisma/client");
    db.tx.patrimonio.update = async () => {
        throw new Prisma.PrismaClientKnownRequestError("detalhe interno secreto", { code: "P2010", clientVersion: "7.10.0" });
    };
    stub(t, console, "error", () => {});
    const result = await request(`/admin/patrimonios/${db.state().id}`, { user: admin, method: "PATCH", body: { nome: "Novo" } });
    assert.equal(result.status, 500);
    assert.equal(result.body.error.code, "INTERNAL_ERROR");
    assert.equal(JSON.stringify(result.body).includes("secreto"), false);
});

test("edição valida categorias, ordens, destinos e aceita legados nulos", () => {
    const categoriaId = randomUUID(), adicional = randomUUID(), destino = randomUUID();
    assert.deepEqual(schemas.updatePatrimonioSchema.parse({ descricao: null, historia: null, importanciaCultural: null }),
        { descricao: null, historia: null, importanciaCultural: null });
    assert.equal(schemas.updatePatrimonioSchema.safeParse({ secoes: [], fatos: [], ligacoes: [], categoriasAdicionais: [] }).success, true);
    for (const dados of [
        { categoriaId, categoriasAdicionais: [categoriaId] },
        { categoriasAdicionais: [adicional, adicional] },
        { categoriasAdicionais: Array.from({ length: 7 }, () => randomUUID()) },
        { secoes: [{ titulo: "T", texto: "X", ordem: 1 }] },
        { fatos: [{ rotulo: "R", valor: "V", ordem: 0 }, { rotulo: "S", valor: "W", ordem: 0 }] },
        { ligacoes: [{ patrimonioDestinoId: destino, texto: "X", ordem: 0 }, { patrimonioDestinoId: destino, texto: "Y", ordem: 1 }] },
        { numeroExibicao: 0 }, { ordemExibicao: -1 },
    ]) assert.equal(schemas.updatePatrimonioSchema.safeParse(dados).success, false, JSON.stringify(dados));
});

test("edição grava pesquisa e categorias juntas, preserva omitidos e permite esvaziar arrays", async (t) => {
    const db = database(t);
    const adicional = randomUUID(), destino = randomUUID();
    db.tx.categoria.findMany = async () => [{ id: adicional }];
    db.tx.patrimonio.findMany = async ({ where }) => {
        assert.deepEqual(where, { id: { in: [destino] } });
        return [{ id: destino }];
    };
    const dados = schemas.updatePatrimonioSchema.parse({
        numeroExibicao: 1, ordemExibicao: 0, categoriasAdicionais: [adicional],
        secoes: [{ titulo: "T", texto: "X", ordem: 0 }],
        fatos: [{ rotulo: "R", valor: "V", ordem: 0 }],
        ligacoes: [{ patrimonioDestinoId: destino, texto: "Veja", ordem: 0 }],
    });
    // Retorno do Prisma contém registros, não as instruções de escrita.
    stub(t, db.tx.patrimonio, "update", async ({ data, include }) => {
        db.writes.push(data);
        assert.ok(include.secoes && include.fatos && include.ligacoes && include.categoriasAdicionais);
        return { ...record(), ...dados, categoriasAdicionais: [{ categoria: { id: adicional } }] };
    });
    const result = await service.updatePatrimonio(db.state().id, dados, admin);
    for (const field of ["secoes", "fatos", "ligacoes"]) {
        assert.deepEqual(db.writes[0][field], { deleteMany: {}, create: dados[field] });
        assert.deepEqual(result[field], dados[field]);
    }
    assert.deepEqual(db.writes[0].categoriasAdicionais, { deleteMany: {}, create: [{ categoriaId: adicional }] });
    assert.deepEqual(result.categoriasAdicionais, [{ id: adicional }]);
    assert.equal(db.writes[0].numeroExibicao, 1);
    assert.equal(db.writes[0].ordemExibicao, 0);
    assert.equal("nome" in db.writes[0], false);
    await service.updatePatrimonio(db.state().id, { secoes: [], fatos: [], ligacoes: [], categoriasAdicionais: [] }, admin);
    for (const field of ["secoes", "fatos", "ligacoes", "categoriasAdicionais"]) {
        assert.deepEqual(db.writes[1][field], { deleteMany: {}, create: [] });
    }
});

test("edição rejeita destinos inexistentes e ligação consigo mesmo antes da escrita", async (t) => {
    const db = database(t);
    db.tx.patrimonio.findMany = async () => [];
    for (const destino of [randomUUID(), db.state().id]) {
        await assert.rejects(service.updatePatrimonio(db.state().id, {
            ligacoes: [{ patrimonioDestinoId: destino, texto: "Veja", ordem: 0 }],
        }, admin), { statusCode: 400 });
    }
    assert.equal(db.writes.length, 0);
});

test("edição traduz conflitos de número e ordem em 409 sem expor o banco", async (t) => {
    const db = database(t);
    const { Prisma } = await import("@prisma/client");
    for (const field of ["numero_exibicao", "ordem_exibicao"]) {
        stub(t, db.tx.patrimonio, "update", async () => {
            throw new Prisma.PrismaClientKnownRequestError("detalhe interno", {
                code: "P2002", clientVersion: "7.10.0", meta: { target: [field] },
            });
        });
        await assert.rejects(service.updatePatrimonio(db.state().id, { numeroExibicao: 1 }, admin),
            { statusCode: 409, code: "PATRIMONIO_EDITORIAL_CONFLICT" });
    }
});

test("publicação valida pesquisa completa, categorias e numeração sem exigir textos legados", async (t) => {
    const id = randomUUID(), destino = randomUUID(), categoriaId = randomUUID();
    const valid = record({ id, categoriaId, descricao: null, numeroExibicao: 1, ordemExibicao: 0,
        categoriasAdicionais: [{ categoria: { id: randomUUID() } }],
        secoes: [{ id: randomUUID(), patrimonioId: id, icone: null, titulo: "T", texto: "X", ordem: 0 }],
        fatos: [{ id: randomUUID(), patrimonioId: id, rotulo: "R", valor: "V", ordem: 0 }],
        ligacoes: [{ id: randomUUID(), patrimonioOrigemId: id, patrimonioDestinoId: destino, texto: "Veja", ordem: 0 }],
    });
    const db = database(t, valid);
    const invalid = [
        { numeroExibicao: 0 }, { ordemExibicao: -1 },
        { categoriasAdicionais: [{ categoria: { id: categoriaId } }] },
        { secoes: [{ ...valid.secoes[0], ordem: 1 }] },
        { fatos: [valid.fatos[0], { ...valid.fatos[0], id: randomUUID() }] },
        { ligacoes: [valid.ligacoes[0], { ...valid.ligacoes[0], id: randomUUID(), ordem: 1 }] },
        { ligacoes: [{ ...valid.ligacoes[0], patrimonioDestinoId: id }] },
    ];
    for (const extra of invalid) {
        stub(t, db.tx.patrimonio, "findUnique", async () => ({ ...valid, ...extra }));
        await assert.rejects(service.changePatrimonioStatus(id, "PUBLICADO", admin));
    }
    assert.equal(db.writes.length, 0);
    stub(t, db.tx.patrimonio, "findUnique", async () => valid);
    await service.changePatrimonioStatus(id, "PUBLICADO", admin);
    assert.equal(db.writes[0].status, "PUBLICADO");
});
