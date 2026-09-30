import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

process.env.DATABASE_URL = "postgresql://localhost:5432/test_admin";
process.env.JWT_SECRET = "test-secret-with-at-least-32-characters";

const { Prisma } = await import("@prisma/client");
const { default: app } = await import("../src/app.js");
const { default: prisma } = await import("../src/config/prisma.js");
const { createAdminSchema } = await import("../src/schemas/adminSchema.js");
const { verifyPassword } = await import("../src/utils/password.js");
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

function adminRequest(token, body) {
    return fetch(`${baseUrl}/api/admins`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(token && { authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(body),
    });
}

function mockUsers({ authenticatedRole = "ADMIN", onCreate } = {}) {
    const originalFindUnique = prisma.user.findUnique;
    const originalCreate = prisma.user.create;
    const authenticatedUserId = randomUUID();

    prisma.user.findUnique = async ({ where }) => {
        if (where.id === authenticatedUserId) {
            return {
                id: authenticatedUserId,
                name: "Administrador",
                email: "admin@example.com",
                role: authenticatedRole,
                isActive: true,
            };
        }
        return null;
    };
    prisma.user.create = onCreate ?? (async () => {
        throw new Error("A criação não deveria ser chamada.");
    });

    return {
        token: generateToken(authenticatedUserId),
        restore() {
            prisma.user.findUnique = originalFindUnique;
            prisma.user.create = originalCreate;
        },
    };
}

test("sem autenticação, cadastro retorna 401", async () => {
    const response = await adminRequest(null, {
        nome: "Maria", email: "maria@example.com", role: "ADMIN", password: "senha-segura-123",
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "UNAUTHORIZED");
});

test("EDITOR não pode cadastrar contas", async () => {
    const mock = mockUsers({ authenticatedRole: "EDITOR" });
    try {
        const response = await adminRequest(mock.token, {
            nome: "Maria", email: "maria@example.com", role: "EDITOR", password: "senha-segura-123",
        });
        assert.equal(response.status, 403);
        assert.equal((await response.json()).error.code, "FORBIDDEN");
    } finally {
        mock.restore();
    }
});

test("valida senha sem transformá-la e normaliza nome e e-mail", () => {
    const password = " senha-segura-123 ";
    assert.deepEqual(createAdminSchema.parse({
        nome: " Maria ", email: "MARIA@EXAMPLE.COM", role: "EDITOR", password,
    }), {
        nome: "Maria", email: "maria@example.com", role: "EDITOR", password,
    });

    for (const invalidPassword of [undefined, "curta", "😀".repeat(6), "é".repeat(40)]) {
        assert.equal(createAdminSchema.safeParse({
            nome: "Maria", email: "maria@example.com", role: "ADMIN", password: invalidPassword,
        }).success, false);
    }
});

test("ADMIN cria contas ADMIN e EDITOR ativas, com hash e resposta sem senha", async () => {
    const created = [];
    const mock = mockUsers({
        onCreate: async ({ data, select }) => {
            assert.deepEqual(select, {
                id: true, name: true, email: true, role: true, isActive: true,
            });
            assert.equal(data.isActive, true);
            assert.equal("id" in data, false);
            const stored = { id: randomUUID(), ...data };
            created.push(stored);
            return stored;
        },
    });

    try {
        for (const role of ["ADMIN", "EDITOR"]) {
            const password = ` senha-${role.toLowerCase()}-segura `;
            const email = `${randomUUID()}@example.com`;
            const response = await adminRequest(mock.token, {
                nome: " Maria ", email: email.toUpperCase(), role, password,
            });
            const body = await response.json();

            assert.equal(response.status, 201);
            assert.equal(body.success, true);
            assert.deepEqual(body.data, {
                id: created.at(-1).id, nome: "Maria", email, role, ativo: true,
            });
            assert.equal(created.at(-1).name, "Maria");
            assert.notEqual(created.at(-1).passwordHash, password);
            assert.equal(await verifyPassword(password, created.at(-1).passwordHash), true);
            assert.equal(JSON.stringify(body).includes("password"), false);
            assert.equal(JSON.stringify(body).includes(password), false);
        }
    } finally {
        mock.restore();
    }
});

test("dados inválidos retornam 400 antes da escrita", async () => {
    const mock = mockUsers();
    try {
        const valid = {
            nome: "Maria", email: "maria@example.com", role: "ADMIN", password: "senha-segura-123",
        };
        for (const body of [
            { ...valid, nome: " " },
            { ...valid, email: "inválido" },
            { ...valid, role: "USER" },
            { ...valid, password: "curta" },
            { ...valid, password: "é".repeat(40) },
            { nome: valid.nome, email: valid.email, role: valid.role },
        ]) {
            const response = await adminRequest(mock.token, body);
            assert.equal(response.status, 400);
            assert.equal((await response.json()).error.code, "BAD_REQUEST");
        }
    } finally {
        mock.restore();
    }
});

test("violação P2002 de e-mail retorna 409 com ADMIN_ALREADY_EXISTS", async () => {
    const mock = mockUsers({
        onCreate: async () => {
            throw new Prisma.PrismaClientKnownRequestError("E-mail duplicado.", {
                code: "P2002", clientVersion: "7.10.0", meta: { target: ["email"] },
            });
        },
    });

    try {
        const response = await adminRequest(mock.token, {
            nome: "Maria", email: "maria@example.com", role: "ADMIN", password: "senha-segura-123",
        });
        assert.equal(response.status, 409);
        assert.equal((await response.json()).error.code, "ADMIN_ALREADY_EXISTS");
    } finally {
        mock.restore();
    }
});

test("conta criada consegue login pelo endpoint existente", async () => {
    let stored;
    const mock = mockUsers({
        onCreate: async ({ data }) => {
            stored = { id: randomUUID(), ...data };
            return stored;
        },
    });
    const originalFindUnique = prisma.user.findUnique;
    prisma.user.findUnique = async (args) => {
        if (stored && args.where.email === stored.email) return stored;
        return originalFindUnique(args);
    };

    try {
        const email = `${randomUUID()}@example.com`;
        const password = "senha-segura-123";
        const created = await adminRequest(mock.token, { nome: "Maria", email, role: "EDITOR", password });
        assert.equal(created.status, 201);

        const response = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        const body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(body.data.user.id, stored.id);
        assert.equal(body.data.user.role, "EDITOR");
        assert.equal(typeof body.data.token, "string");
        assert.equal("passwordHash" in body.data.user, false);
    } finally {
        mock.restore();
    }
});
