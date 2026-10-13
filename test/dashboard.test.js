import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test_dashboard";
process.env.JWT_SECRET = "test-secret-with-at-least-32-characters";

const { default: app } = await import("../src/app.js");
const { default: prisma } = await import("../src/config/prisma.js");
const { getDashboard } = await import("../src/services/dashboardService.js");
const { generateToken } = await import("../src/utils/token.js");
const adminUser = { id: randomUUID(), role: "ADMIN", isActive: true };
const adminHeaders = { authorization: `Bearer ${generateToken(adminUser.id)}` };

let server;
let baseUrl;

before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    try {
        if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    } finally {
        await prisma.$disconnect();
    }
});

function mockPrisma({ totalPatrimonios, gruposCategoria = [], categorias = [], gruposBairro = [], gruposRegiao = [], usuario }) {
    const originalTransaction = prisma.$transaction;
    const originalCount = prisma.patrimonio.count;
    const originalGroupByPatrimonio = prisma.patrimonio.groupBy;
    const originalCategoriaFindMany = prisma.categoria.findMany;
    const originalLocalizacaoGroupBy = prisma.localizacao.groupBy;
    const originalUserFindUnique = prisma.user.findUnique;
    const originalPatrimonioFindMany = prisma.patrimonio.findMany;

    prisma.$transaction = async (callback, options) => {
        assert.equal(options.isolationLevel, "RepeatableRead");
        return callback(prisma);
    };
    prisma.user.findUnique = async ({ where }) => {
        assert.ok(usuario, "O service do dashboard não deve consultar autenticação.");
        assert.equal(where.id, usuario.id);
        return usuario;
    };
    prisma.patrimonio.findMany = async () => assert.fail("Não carregar patrimônios completos.");

    prisma.patrimonio.count = async (args) => {
        assert.equal(args, undefined);
        return totalPatrimonios;
    };
    prisma.patrimonio.groupBy = async (args) => {
        assert.deepEqual(args.by, ["categoriaId"]);
        assert.equal(args.where, undefined);
        assert.deepEqual(args._count, { _all: true });
        return gruposCategoria;
    };
    prisma.categoria.findMany = async (args) => {
        assert.deepEqual(args.select, { id: true, nome: true });
        assert.deepEqual(args.where.id.in, gruposCategoria.map((item) => item.categoriaId));
        return categorias;
    };
    prisma.localizacao.groupBy = async (args) => {
        assert.ok(["bairro", "regiao"].includes(args.by[0]));
        assert.equal(args.by.length, 1);
        assert.equal(args.where, undefined);
        assert.deepEqual(args._count, { _all: true });
        return args.by[0] === "bairro" ? gruposBairro : gruposRegiao;
    };

    return () => {
        prisma.$transaction = originalTransaction;
        prisma.user.findUnique = originalUserFindUnique;
        prisma.patrimonio.findMany = originalPatrimonioFindMany;
        prisma.patrimonio.count = originalCount;
        prisma.patrimonio.groupBy = originalGroupByPatrimonio;
        prisma.categoria.findMany = originalCategoriaFindMany;
        prisma.localizacao.groupBy = originalLocalizacaoGroupBy;
    };
}

test("todos os status entram no dashboard; publicar/arquivar não muda o total; consulta pública só PUBLICADO", { concurrency: false }, async () => {
    const categoriaId = randomUUID();
    // Fixtures em memória simulam o banco; não verificam SQL real.
    const registros = [
        { id: randomUUID(), status: "RASCUNHO", nome: "Rascunho" },
        { id: randomUUID(), status: "PUBLICADO", nome: "Publicado" },
        { id: randomUUID(), status: "ARQUIVADO", nome: "Arquivado" },
    ];
    const restore = mockPrisma({
        totalPatrimonios: 3,
        gruposCategoria: [{ categoriaId, _count: { _all: 3 } }],
        categorias: [{ id: categoriaId, nome: "Histórico" }],
        gruposRegiao: [{ regiao: "CUMBICA", _count: { _all: 3 } }],
        gruposBairro: [
            { bairro: "Centro", _count: { _all: 1 } },
            { bairro: " Centro ", _count: { _all: 1 } },
            { bairro: "", _count: { _all: 1 } },
        ],
    });
    prisma.patrimonio.count = async (args) => {
        if (!args) return registros.length;
        assert.equal(args.where.status, "PUBLICADO");
        return registros.filter((item) => item.status === args.where.status).length;
    };
    prisma.patrimonio.findMany = async ({ where }) => {
        assert.equal(where.status, "PUBLICADO");
        return registros.filter((item) => item.status === where.status);
    };
    try {
        const inicial = await getDashboard();
        assert.equal(inicial.totalPatrimonios, 3);
        assert.equal(inicial.totalPublicados, undefined);
        assert.equal(inicial.meta.baseContagem, "TODOS_OS_STATUS");
        assert.deepEqual(inicial.localizacao.regioes.distribuicao, [{ regiao: "CUMBICA", nome: "Cumbica", quantidade: 3 }]);
        assert.deepEqual(inicial.porCategoria.dados, [{ id: categoriaId, nome: "Histórico", quantidade: 3, percentual: 100 }]);
        assert.deepEqual(inicial.localizacao.bairros.distribuicao, [
            { bairro: "Centro", quantidade: 2 }, { bairro: "Não informado", quantidade: 1 },
        ]);
        for (const [status, totalPublico] of [["RASCUNHO", 1], ["PUBLICADO", 2], ["ARQUIVADO", 1]]) {
            registros[0].status = status;
            assert.deepEqual(await getDashboard(), inicial);
            const response = await fetch(`${baseUrl}/api/patrimonios`);
            const body = await response.json();
            assert.equal(response.status, 200);
            assert.equal(body.data.paginacao.total, totalPublico);
            assert.equal(body.data.itens.length, totalPublico);
            assert.ok(body.data.itens.every((item) => item.status === "PUBLICADO"));
        }
    } finally { restore(); }
});

test("Não informado já gravado e bairro vazio formam um único grupo sem bairro real", { concurrency: false }, async () => {
    const restore = mockPrisma({ totalPatrimonios: 4, gruposBairro: [
        { bairro: " Não informado ", _count: { _all: 1 } },
        { bairro: "", _count: { _all: 1 } },
    ] });
    try {
        assert.deepEqual((await getDashboard()).localizacao.bairros, {
            disponivel: true, totalBairrosDistintos: 0,
            distribuicao: [{ bairro: "Não informado", quantidade: 4 }],
        });
    } finally { restore(); }
});

test("arredonda todas as categorias e ordena por nome com desempate por ID", { concurrency: false }, async () => {
    const categorias = [
        { id: "c", nome: "Religioso" }, { id: "b", nome: "Histórico" }, { id: "a", nome: "Histórico" },
    ];
    const restore = mockPrisma({
        totalPatrimonios: 6,
        categorias,
        gruposCategoria: categorias.map((item, index) => ({ categoriaId: item.id, _count: { _all: [1, 2, 3][index] } })),
    });
    try {
        assert.deepEqual((await getDashboard()).porCategoria.dados, [
            { id: "a", nome: "Histórico", quantidade: 3, percentual: 50 },
            { id: "b", nome: "Histórico", quantidade: 2, percentual: 33.33 },
            { id: "c", nome: "Religioso", quantidade: 1, percentual: 16.67 },
        ]);
    } finally { restore(); }
});

test("bairro vazio, nulo e sem localização são contados uma vez; normaliza espaços", { concurrency: false }, async () => {
    const restore = mockPrisma({
        totalPatrimonios: 10,
        gruposBairro: [
            { bairro: "Centro", _count: { _all: 2 } },
            { bairro: " Centro ", _count: { _all: 1 } },
            { bairro: "", _count: { _all: 1 } },
            { bairro: null, _count: { _all: 2 } },
            { bairro: "   ", _count: { _all: 1 } },
        ],
    });
    try {
        const { bairros } = (await getDashboard()).localizacao;
        assert.equal(bairros.totalBairrosDistintos, 1);
        assert.deepEqual(bairros.distribuicao, [
            { bairro: "Centro", quantidade: 3 }, { bairro: "Não informado", quantidade: 7 },
        ]);
        assert.equal(bairros.distribuicao.reduce((sum, item) => sum + item.quantidade, 0), 10);
    } finally { restore(); }
});

test("todos sem localização não criam bairro real", { concurrency: false }, async () => {
    const restore = mockPrisma({ totalPatrimonios: 2 });
    try {
        assert.deepEqual((await getDashboard()).localizacao.bairros, {
            disponivel: true, totalBairrosDistintos: 0,
            distribuicao: [{ bairro: "Não informado", quantidade: 2 }],
        });
    } finally { restore(); }
});

test("falha de consulta segue o tratamento global de erros", { concurrency: false }, async (t) => {
    const restore = mockPrisma({ totalPatrimonios: 0, usuario: adminUser });
    t.mock.method(console, "error", () => {});
    prisma.patrimonio.count = async () => { throw new Error("detalhe privado do banco"); };
    try {
        const response = await fetch(`${baseUrl}/api/admin/dashboard`, { headers: adminHeaders });
        const body = await response.json();
        assert.equal(response.status, 500);
        assert.equal(body.success, false);
        assert.equal(body.error.code, "INTERNAL_ERROR");
        assert.equal(JSON.stringify(body).includes("detalhe privado"), false);
    } finally { restore(); }
});

test("banco sem patrimônios retorna total zero e listas vazias", { concurrency: false }, async () => {
    const restore = mockPrisma({ totalPatrimonios: 0 });

    try {
        const resultado = await getDashboard();

        assert.equal(resultado.totalPatrimonios, 0);
        assert.deepEqual(resultado.porCategoria, { disponivel: true, dados: [] });
        assert.deepEqual(resultado.localizacao.bairros, {
            disponivel: true,
            totalBairrosDistintos: 0,
            distribuicao: [],
        });
        assert.deepEqual(resultado.localizacao.regioes, { disponivel: true, totalRegioesDistintas: 0, distribuicao: [] });
        assert.deepEqual(resultado.meta, { parcial: false, baseContagem: "TODOS_OS_STATUS", pendencias: [] });
        assert.deepEqual(Object.keys(resultado).sort(), ["localizacao", "meta", "porCategoria", "totalPatrimonios"]);
    } finally {
        restore();
    }
});

test("soma das quantidades por categoria corresponde ao total e percentuais somam ~100", { concurrency: false }, async () => {
    const categoriaA = randomUUID();
    const categoriaB = randomUUID();

    const restore = mockPrisma({
        totalPatrimonios: 4,
        gruposCategoria: [
            { categoriaId: categoriaA, _count: { _all: 3 } },
            { categoriaId: categoriaB, _count: { _all: 1 } },
        ],
        categorias: [
            { id: categoriaA, nome: "Arquitetônico" },
            { id: categoriaB, nome: "Religioso" },
        ],
    });

    try {
        const resultado = await getDashboard();
        const somaQuantidades = resultado.porCategoria.dados.reduce((soma, item) => soma + item.quantidade, 0);
        const somaPercentuais = resultado.porCategoria.dados.reduce((soma, item) => soma + item.percentual, 0);

        assert.equal(somaQuantidades, resultado.totalPatrimonios);
        assert.ok(Math.abs(somaPercentuais - 100) < 0.1);

        const arquitetonico = resultado.porCategoria.dados.find((item) => item.id === categoriaA);
        assert.equal(arquitetonico.percentual, 75);
        assert.equal(resultado.porCategoria.dados.find((item) => item.id === categoriaB).percentual, 25);
    } finally {
        restore();
    }
});

test("patrimônios sem localização caem no grupo 'Não informado' e não contam no total de bairros", { concurrency: false }, async () => {
    const restore = mockPrisma({
        totalPatrimonios: 5,
        gruposBairro: [
            { bairro: "Centro", _count: { _all: 2 } },
            { bairro: "Bonsucesso", _count: { _all: 1 } },
        ],
        // soma dos grupos de localização = 3; totalPatrimonios = 5 -> 2 sem localização
    });

    try {
        const resultado = await getDashboard();

        assert.equal(resultado.localizacao.bairros.totalBairrosDistintos, 2);
        assert.deepEqual(resultado.localizacao.bairros.distribuicao, [
            { bairro: "Bonsucesso", quantidade: 1 },
            { bairro: "Centro", quantidade: 2 },
            { bairro: "Não informado", quantidade: 2 },
        ]);
    } finally {
        restore();
    }
});


test("regiões usam todos os códigos e nomes, ordenação pt-BR e Não informado ao final", { concurrency: false }, async () => {
    const expected = [
        ["AEROPORTO", "Aeroporto"], ["BONSUCESSO", "Bonsucesso"], ["CABUCU", "Cabuçu"],
        ["CAPELINHA", "Capelinha"], ["CENTRO", "Centro"], ["CUMBICA", "Cumbica"],
        ["JAGUARI", "Jaguari"], ["PARQUE_ESTADUAL_CANTAREIRA", "Parque Estadual da Cantareira"],
        ["PIMENTAS", "Pimentas"], ["SAO_JOAO", "São João"], ["TABOAO", "Taboão"],
        ["TANQUE_GRANDE", "Tanque Grande"], ["VILA_GALVAO", "Vila Galvão"],
    ];
    const restore = mockPrisma({
        totalPatrimonios: 15,
        gruposRegiao: [...expected].reverse().map(([regiao]) => ({ regiao, _count: { _all: 1 } })),
    });
    try {
        const result = await getDashboard();
        assert.deepEqual(result.localizacao.regioes, {
            disponivel: true, totalRegioesDistintas: 13,
            distribuicao: [...expected.map(([regiao, nome]) => ({ regiao, nome, quantidade: 1 })),
                { regiao: null, nome: "Não informado", quantidade: 2 }],
        });
        assert.equal(result.localizacao.regioes.distribuicao.reduce((sum, item) => sum + item.quantidade, 0), result.totalPatrimonios);
    } finally { restore(); }
});

for (const caso of [
    { nome: "vários na mesma região", total: 8, grupos: [["CUMBICA", 8]], expected: [["CUMBICA", "Cumbica", 8]], distintas: 1 },
    { nome: "somente região nula", total: 2, grupos: [[null, 2]], expected: [[null, "Não informado", 2]], distintas: 0 },
    { nome: "somente sem localização", total: 2, grupos: [], expected: [[null, "Não informado", 2]], distintas: 0 },
    { nome: "nula e sem localização sem duplicação", total: 5, grupos: [[null, 3]], expected: [[null, "Não informado", 5]], distintas: 0 },
    { nome: "classificadas, nulas e sem localização", total: 10, grupos: [[null, 2], ["CUMBICA", 5], ["CENTRO", 1]], expected: [["CENTRO", "Centro", 1], ["CUMBICA", "Cumbica", 5], [null, "Não informado", 4]], distintas: 2 },
    { nome: "não inclui grupo zero nem Não informado sem associados", total: 1, grupos: [["CUMBICA", 1], ["CENTRO", 0], [null, 0]], expected: [["CUMBICA", "Cumbica", 1]], distintas: 1 },
]) {
    test(`distribuição regional: ${caso.nome}`, { concurrency: false }, async () => {
        const restore = mockPrisma({ totalPatrimonios: caso.total, gruposRegiao: caso.grupos.map(([regiao, count]) => ({ regiao, _count: { _all: count } })) });
        try {
            const result = await getDashboard();
            assert.deepEqual(result.localizacao.regioes, {
                disponivel: true, totalRegioesDistintas: caso.distintas,
                distribuicao: caso.expected.map(([regiao, nome, quantidade]) => ({ regiao, nome, quantidade })),
            });
            assert.equal(result.localizacao.regioes.distribuicao.reduce((sum, item) => sum + item.quantidade, 0), result.totalPatrimonios);
            assert.equal(Object.hasOwn(result, "porTombamento"), false);
            assert.equal(Object.hasOwn(result, "rotas"), false);
            assert.deepEqual(result.meta, { parcial: false, baseContagem: "TODOS_OS_STATUS", pendencias: [] });
        } finally { restore(); }
    });
}

for (const role of ["ADMIN", "EDITOR"]) {
test(`${role} recebe indicadores pelo GET /api/admin/dashboard`, { concurrency: false }, async () => {
    const categoriaId = randomUUID();
    const restore = mockPrisma({
        totalPatrimonios: 3, usuario: { ...adminUser, role },
        gruposCategoria: [{ categoriaId, _count: { _all: 3 } }],
        categorias: [{ id: categoriaId, nome: "Histórico" }],
        gruposBairro: [{ bairro: "Centro", _count: { _all: 2 } }],
        gruposRegiao: [{ regiao: "CUMBICA", _count: { _all: 2 } }],
    });

    try {
        const response = await fetch(`${baseUrl}/api/admin/dashboard`, { headers: adminHeaders });
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.deepEqual(body.data, await getDashboard());
        assert.equal(body.data.totalPatrimonios, 3);
        assert.deepEqual(body.data.localizacao.regioes, {
            disponivel: true, totalRegioesDistintas: 1,
            distribuicao: [{ regiao: "CUMBICA", nome: "Cumbica", quantidade: 2 }, { regiao: null, nome: "Não informado", quantidade: 1 }],
        });
        assert.deepEqual(body.data.porCategoria.dados, [
            { id: categoriaId, nome: "Histórico", quantidade: 3, percentual: 100 },
        ]);
        assert.deepEqual(body.data.meta, { parcial: false, baseContagem: "TODOS_OS_STATUS", pendencias: [] });
        assert.equal(Object.hasOwn(body.data, "porTombamento"), false);
        assert.equal(Object.hasOwn(body.data, "rotas"), false);
    } finally {
        restore();
    }
});
}

for (const caso of [
    { nome: "sem token retorna 401", status: 401, headers: {}, consultaUsuario: false },
    { nome: "token inválido retorna 401", status: 401, headers: { authorization: "Bearer invalido" }, consultaUsuario: false },
    { nome: "EDITOR inativo retorna 401", status: 401, usuario: { ...adminUser, role: "EDITOR", isActive: false } },
    { nome: "ADMIN inativo retorna 401", status: 401, usuario: { ...adminUser, isActive: false } },
    { nome: "usuário inexistente retorna 401", status: 401, usuario: null },
]) {
    test(`GET /api/admin/dashboard: ${caso.nome}`, { concurrency: false }, async () => {
        const restore = mockPrisma({ totalPatrimonios: 0 });
        prisma.$transaction = async () => assert.fail("Acesso negado não deve consultar os indicadores.");
        prisma.user.findUnique = async () => {
            assert.notEqual(caso.consultaUsuario, false, "Token ausente/inválido não deve consultar usuário.");
            return caso.usuario;
        };
        try {
            const response = await fetch(`${baseUrl}/api/admin/dashboard`, { headers: caso.headers ?? adminHeaders });
            const body = await response.json();
            assert.equal(response.status, caso.status);
            assert.equal(body.success, false);
            assert.equal(body.error.code, caso.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN");
        } finally { restore(); }
    });
}

test("GET /api/dashboard foi removido, mesmo com token ADMIN", { concurrency: false }, async () => {
    const restore = mockPrisma({ totalPatrimonios: 0 });
    prisma.$transaction = async () => assert.fail("A rota removida não deve consultar indicadores.");
    prisma.user.findUnique = async () => assert.fail("A rota removida não deve consultar usuário.");
    try {
        for (const headers of [{}, adminHeaders]) {
            const response = await fetch(`${baseUrl}/api/dashboard`, { headers });
            const body = await response.json();
            assert.equal(response.status, 404);
            assert.equal(body.success, false);
            assert.equal(body.error.code, "NOT_FOUND");
        }
    } finally { restore(); }
});
