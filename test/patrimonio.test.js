import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

process.env.DATABASE_URL = "postgresql://localhost:5432/test_patrimonio";
process.env.JWT_SECRET = "test-secret-with-at-least-32-characters";

const { default: app } = await import("../src/app.js");
const { Prisma } = await import("@prisma/client");
const { default: prisma } = await import("../src/config/prisma.js");
const {
    createPatrimonioSchema,
    listPatrimoniosQuerySchema,
    patrimonioSlugParamsSchema,
} = await import("../src/schemas/patrimonioSchema.js");
const {
    createPatrimonio,
    getPatrimonioBySlug,
    listPatrimonios,
} = await import("../src/services/patrimonioService.js");
const { generateToken } = await import("../src/utils/token.js");

let server;
let baseUrl;

before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
});

test("normaliza os filtros públicos e aplica paginação padrão", () => {
    assert.deepEqual(listPatrimoniosQuerySchema.parse({
        busca: "  igreja  ",
        categoria: "  Religioso ",
        situacao: "DEMOLIDO",
        bairro: " Centro ",
    }), {
        busca: "igreja",
        categoria: "Religioso",
        situacao: "DEMOLIDO",
        bairro: "Centro",
        pagina: 1,
        limite: 20,
    });

    assert.deepEqual(listPatrimoniosQuerySchema.parse({ pagina: "2", limite: "10" }), {
        pagina: 2,
        limite: 10,
    });
});

test("rejeita filtros públicos e slugs inválidos", () => {
    for (const query of [
        { pagina: "0" },
        { pagina: "1.5" },
        { limite: "101" },
        { situacao: "DESCONHECIDA" },
        { campo: "nao-permitido" },
    ]) {
        assert.equal(listPatrimoniosQuerySchema.safeParse(query).success, false);
    }

    assert.equal(patrimonioSlugParamsSchema.safeParse({ slug: "igreja-matriz" }).success, true);
    assert.equal(patrimonioSlugParamsSchema.safeParse({ slug: "Igreja Matriz" }).success, false);
});

test("consulta apenas patrimônios publicados com filtros e paginação", async () => {
    const originalCount = prisma.patrimonio.count;
    const originalFindMany = prisma.patrimonio.findMany;
    let countArguments;
    let findManyArguments;

    prisma.patrimonio.count = async (args) => {
        countArguments = args;
        return 21;
    };
    prisma.patrimonio.findMany = async (args) => {
        findManyArguments = args;
        return [{ id: randomUUID(), nome: "Igreja Matriz", slug: "igreja-matriz" }];
    };

    try {
        const resultado = await listPatrimonios({
            busca: "igreja",
            categoria: "Religioso",
            situacao: "PRESERVADO",
            bairro: "Centro",
            pagina: 2,
            limite: 10,
        });

        assert.deepEqual(countArguments.where, findManyArguments.where);
        assert.equal(findManyArguments.where.status, "PUBLICADO");
        assert.deepEqual(findManyArguments.where.situacao, "PRESERVADO");
        assert.deepEqual(findManyArguments.where.categoria, {
            OR: [
                { nome: { equals: "Religioso", mode: "insensitive" } },
                { slug: { equals: "Religioso", mode: "insensitive" } },
            ],
        });
        assert.deepEqual(findManyArguments.where.localizacao, {
            is: { bairro: { equals: "Centro", mode: "insensitive" } },
        });
        assert.equal(findManyArguments.where.OR.length, 6);
        assert.deepEqual(findManyArguments.orderBy[0], { ordemExibicao: { sort: "asc", nulls: "last" } });
        assert.equal(findManyArguments.skip, 10);
        assert.equal(findManyArguments.take, 10);
        assert.deepEqual(resultado.paginacao, {
            pagina: 2,
            limite: 10,
            total: 21,
            totalPaginas: 3,
        });
        assert.equal(resultado.itens.length, 1);
    } finally {
        prisma.patrimonio.count = originalCount;
        prisma.patrimonio.findMany = originalFindMany;
    }
});

test("consulta detalhe público por slug e oculta registros não encontrados", async () => {
    const originalFindFirst = prisma.patrimonio.findFirst;
    let findFirstArguments;
    prisma.patrimonio.findFirst = async (args) => {
        findFirstArguments = args;
        return { id: randomUUID(), slug: args.where.slug, nome: "Igreja Matriz" };
    };

    try {
        const patrimonio = await getPatrimonioBySlug("igreja-matriz");
        assert.equal(patrimonio.slug, "igreja-matriz");
        assert.deepEqual(findFirstArguments.where, {
            slug: "igreja-matriz",
            status: "PUBLICADO",
        });

        prisma.patrimonio.findFirst = async () => null;
        await assert.rejects(
            getPatrimonioBySlug("rascunho"),
            (error) => error.statusCode === 404 && error.code === "PATRIMONIO_NOT_FOUND"
        );
    } finally {
        prisma.patrimonio.findFirst = originalFindFirst;
    }
});

test("expõe listagem e detalhe em rotas públicas", async () => {
    const originalCount = prisma.patrimonio.count;
    const originalFindMany = prisma.patrimonio.findMany;
    const originalFindFirst = prisma.patrimonio.findFirst;

    prisma.patrimonio.count = async () => 1;
    prisma.patrimonio.findMany = async () => [{
        id: randomUUID(),
        nome: "Casarão Lima",
        slug: "casarao-lima",
        situacao: "DEMOLIDO",
    }];
    prisma.patrimonio.findFirst = async ({ where }) => ({
        id: randomUUID(),
        nome: "Casarão Lima",
        slug: where.slug,
        situacao: "DEMOLIDO",
    });

    try {
        const listResponse = await fetch(
            `${baseUrl}/api/patrimonios?situacao=DEMOLIDO&pagina=1&limite=5`
        );
        const listBody = await listResponse.json();
        assert.equal(listResponse.status, 200);
        assert.equal(listBody.success, true);
        assert.equal(listBody.data.itens[0].slug, "casarao-lima");
        assert.deepEqual(listBody.data.paginacao, {
            pagina: 1,
            limite: 5,
            total: 1,
            totalPaginas: 1,
        });

        const detailResponse = await fetch(`${baseUrl}/api/patrimonios/casarao-lima`);
        const detailBody = await detailResponse.json();
        assert.equal(detailResponse.status, 200);
        assert.equal(detailBody.success, true);
        assert.equal(detailBody.data.situacao, "DEMOLIDO");
    } finally {
        prisma.patrimonio.count = originalCount;
        prisma.patrimonio.findMany = originalFindMany;
        prisma.patrimonio.findFirst = originalFindFirst;
    }
});

test("retorna 400 para consulta pública inválida", async () => {
    const response = await fetch(`${baseUrl}/api/patrimonios?limite=101`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "BAD_REQUEST");
});

test("normaliza o cadastro e aplica os valores padrão", () => {
    const categoriaId = randomUUID();
    const result = createPatrimonioSchema.parse({
        nome: "  Igreja Matriz  ",
        descricao: "  Patrimônio histórico  ",
        descricaoResumida: "  Resumo do patrimônio  ",
        importanciaCultural: "  Referência cultural da cidade  ",
        categoriaId,
        localizacao: {
            endereco: " Praça Tereza Cristina ",
            bairro: " Centro ",
            uf: "sp",
            cep: "07023070",
            latitude: -23.4678,
            longitude: -46.5333,
        },
    });

    assert.deepEqual(result, {
        nome: "Igreja Matriz",
        descricao: "Patrimônio histórico",
        descricaoResumida: "Resumo do patrimônio",
        importanciaCultural: "Referência cultural da cidade",
        categoriaId,
        situacao: "NAO_INFORMADO",
        localizacao: {
            endereco: "Praça Tereza Cristina",
            bairro: "Centro",
            cidade: "Guarulhos",
            uf: "SP",
            cep: "07023-070",
            latitude: -23.4678,
            longitude: -46.5333,
        },
    });
});

test("rejeita situação, coordenadas e campos controlados pelo servidor inválidos", () => {
    const valid = {
        nome: "Igreja Matriz",
        descricao: "Patrimônio histórico",
        descricaoResumida: "Resumo do patrimônio",
        categoriaId: randomUUID(),
    };

    const invalidBodies = [
        { nome: valid.nome, descricao: valid.descricao, categoriaId: valid.categoriaId },
        { ...valid, situacao: "DESCONHECIDA" },
        { ...valid, localizacao: { endereco: "Rua A", bairro: "Centro", latitude: -23 } },
        { ...valid, localizacao: { endereco: "Rua A", bairro: "Centro", latitude: -91, longitude: 0 } },
        { ...valid, localizacao: { endereco: "Rua A", bairro: "Centro", latitude: 0, longitude: 181 } },
        { ...valid, status: "PUBLICADO" },
        { ...valid, id: randomUUID() },
        { ...valid, createdBy: randomUUID() },
        { ...valid, updatedBy: randomUUID() },
        { ...valid, publicadoEm: new Date().toISOString() },
        { ...valid, arquivadoEm: new Date().toISOString() },
        { ...valid, numeroExibicao: 0 },
        { ...valid, ordemExibicao: -1 },
        { ...valid, secoes: [{ titulo: "T", texto: "X", ordem: 1 }] },
        { ...valid, fatos: [{ rotulo: "R", valor: "V", ordem: 0 }, { rotulo: "R2", valor: "V2", ordem: 0 }] },
        { ...valid, ligacoes: [{ patrimonioDestinoId: valid.categoriaId, texto: "X", ordem: 0 }, { patrimonioDestinoId: valid.categoriaId, texto: "Y", ordem: 1 }] },
    ];

    for (const body of invalidBodies) {
        assert.equal(createPatrimonioSchema.safeParse(body).success, false);
    }
});

test("prepara patrimônio e localização para criação atômica como rascunho", async () => {
    const categoriaId = randomUUID();
    const createdBy = randomUUID();
    const originalTransaction = prisma.$transaction;
    let createArguments;
    let slugSearches = 0;

    prisma.$transaction = async (callback) => callback({
        categoria: {
            findUnique: async () => ({ id: categoriaId }),
        },
        patrimonio: {
            findUnique: async () => {
                slugSearches += 1;
                return slugSearches === 1 ? { id: randomUUID() } : null;
            },
            create: async (args) => {
                createArguments = args;
                return { id: randomUUID(), ...args.data };
            },
        },
    });

    try {
        await createPatrimonio({
            nome: "Igreja Matriz",
            descricao: "Patrimônio histórico",
            descricaoResumida: "Resumo do patrimônio",
            importanciaCultural: "Referência cultural da cidade",
            categoriaId,
            situacao: "PRESERVADO",
            localizacao: { endereco: "Rua A", bairro: "Centro", cidade: "Guarulhos", uf: "SP" },
            status: "PUBLICADO",
            createdBy: randomUUID(),
        }, createdBy);

        assert.equal(createArguments.data.slug, "igreja-matriz-2");
        assert.equal(createArguments.data.descricaoResumida, "Resumo do patrimônio");
        assert.equal(createArguments.data.importanciaCultural, "Referência cultural da cidade");
        assert.equal(createArguments.data.status, "RASCUNHO");
        assert.equal(createArguments.data.createdBy, createdBy);
        assert.deepEqual(createArguments.data.localizacao, {
            create: { endereco: "Rua A", bairro: "Centro", cidade: "Guarulhos", uf: "SP" },
        });
        assert.equal(createArguments.include.categoria, true);
        assert.equal(createArguments.include.localizacao, true);
        assert.deepEqual(createArguments.include.secoes, { orderBy: { ordem: "asc" } });
        assert.equal("updatedBy" in createArguments.data, false);
    } finally {
        prisma.$transaction = originalTransaction;
    }
});

test("retorna erro quando a categoria não existe", async () => {
    const originalTransaction = prisma.$transaction;
    prisma.$transaction = async (callback) => callback({
        categoria: { findUnique: async () => null },
        patrimonio: {},
    });

    try {
        await assert.rejects(
            createPatrimonio({
                nome: "Igreja Matriz",
                descricao: "Patrimônio histórico",
                descricaoResumida: "Resumo do patrimônio",
                categoriaId: randomUUID(),
            }, randomUUID()),
            (error) => error.statusCode === 404 && error.code === "CATEGORIA_NOT_FOUND"
        );
    } finally {
        prisma.$transaction = originalTransaction;
    }
});

test("traduz conflito de slug para o padrão da API", async () => {
    const originalTransaction = prisma.$transaction;
    prisma.$transaction = async () => {
        throw new Prisma.PrismaClientKnownRequestError("Slug duplicado.", {
            code: "P2002",
            clientVersion: "7.10.0",
            meta: { target: ["slug"] },
        });
    };

    try {
        await assert.rejects(
            createPatrimonio({
                nome: "Igreja Matriz",
                descricao: "Patrimônio histórico",
                descricaoResumida: "Resumo do patrimônio",
                categoriaId: randomUUID(),
            }, randomUUID()),
            (error) => error.statusCode === 409 && error.code === "PATRIMONIO_SLUG_CONFLICT"
        );
    } finally {
        prisma.$transaction = originalTransaction;
    }
});

test("exige autenticação para cadastrar patrimônio", async () => {
    const response = await fetch(`${baseUrl}/api/admin/patrimonios`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            nome: "Igreja Matriz",
            descricao: "Patrimônio histórico",
            categoriaId: randomUUID(),
        }),
    });

    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "UNAUTHORIZED");
});

test("ADMIN e EDITOR podem cadastrar patrimônio pela rota protegida", async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalTransaction = prisma.$transaction;
    let currentRole;
    let currentUserId;

    prisma.user.findUnique = async ({ where }) => ({
        id: where.id,
        name: "Usuário interno",
        email: `${currentRole.toLowerCase()}@example.com`,
        role: currentRole,
        isActive: true,
    });
    prisma.$transaction = async (callback) => callback({
        categoria: { findUnique: async ({ where }) => ({ id: where.id }) },
        patrimonio: {
            findUnique: async () => null,
            create: async ({ data }) => {
                assert.equal(data.createdBy, currentUserId);
                assert.equal(data.status, "RASCUNHO");
                return { id: randomUUID(), ...data, localizacao: null };
            },
        },
    });

    try {
        for (const role of ["ADMIN", "EDITOR"]) {
            currentRole = role;
            currentUserId = randomUUID();
            const response = await fetch(`${baseUrl}/api/admin/patrimonios`, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${generateToken(currentUserId)}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    nome: `Patrimônio ${role}`,
                    descricao: "Patrimônio histórico",
                    descricaoResumida: "Resumo do patrimônio",
                    categoriaId: randomUUID(),
                }),
            });
            const body = await response.json();

            assert.equal(response.status, 201);
            assert.equal(body.success, true);
            assert.equal(body.data.createdBy, currentUserId);
            assert.equal(body.data.status, "RASCUNHO");
        }
    } finally {
        prisma.user.findUnique = originalFindUnique;
        prisma.$transaction = originalTransaction;
    }
});
