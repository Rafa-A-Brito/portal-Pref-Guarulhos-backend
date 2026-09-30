import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

process.env.DATABASE_URL = "postgresql://localhost:5432/test_patrimonio";
process.env.JWT_SECRET = "test-secret-with-at-least-32-characters";

const { default: app } = await import("../src/app.js");
const { Prisma } = await import("@prisma/client");
const { default: prisma } = await import("../src/config/prisma.js");
const { createPatrimonioSchema } = await import("../src/schemas/patrimonioSchema.js");
const { createPatrimonio } = await import("../src/services/patrimonioService.js");
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

test("normaliza o cadastro e aplica os valores padrão", () => {
    const categoriaId = randomUUID();
    const result = createPatrimonioSchema.parse({
        nome: "  Igreja Matriz  ",
        descricao: "  Patrimônio histórico  ",
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
        categoriaId: randomUUID(),
    };

    const invalidBodies = [
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
            categoriaId,
            situacao: "PRESERVADO",
            localizacao: { endereco: "Rua A", bairro: "Centro", cidade: "Guarulhos", uf: "SP" },
            status: "PUBLICADO",
            createdBy: randomUUID(),
        }, createdBy);

        assert.equal(createArguments.data.slug, "igreja-matriz-2");
        assert.equal(createArguments.data.status, "RASCUNHO");
        assert.equal(createArguments.data.createdBy, createdBy);
        assert.deepEqual(createArguments.data.localizacao, {
            create: { endereco: "Rua A", bairro: "Centro", cidade: "Guarulhos", uf: "SP" },
        });
        assert.deepEqual(createArguments.include, { categoria: true, localizacao: true });
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
