import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

process.env.DATABASE_URL = "postgresql://localhost:5432/test_admin";
process.env.JWT_SECRET = "test-secret-with-at-least-32-characters";

const { default: app } = await import("../src/app.js");
const { default: prisma } = await import("../src/config/prisma.js");
const { createAdminSchema } = await import("../src/schemas/adminSchema.js");
const { createAdmin } = await import("../src/services/adminService.js");
const { default: authorize } = await import("../src/middlewares/authorize.js");
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
});

test("exige autenticação antes de criar administrador", async () => {
    const response = await fetch(`${baseUrl}/api/admins`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nome: "Maria", email: "maria@example.com", role: "ADMIN" }),
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "UNAUTHORIZED");
});

test("permite que um ADMIN autenticado crie um administrador pela API", async () => {
    const authenticatedUserId = randomUUID();
    const email = `${randomUUID()}@example.com`;
    const originalFindUnique = prisma.user.findUnique;
    prisma.user.findUnique = async ({ where }) => {
        assert.deepEqual(where, { id: authenticatedUserId });
        return {
            id: authenticatedUserId,
            name: "Administrador",
            email: "admin@example.com",
            role: "ADMIN",
            isActive: true,
        };
    };

    try {
        const response = await fetch(`${baseUrl}/api/admins`, {
            method: "POST",
            headers: {
                authorization: `Bearer ${generateToken(authenticatedUserId)}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({ nome: " Maria ", email: email.toUpperCase(), role: "EDITOR" }),
        });
        const body = await response.json();

        assert.equal(response.status, 201);
        assert.equal(body.success, true);
        assert.deepEqual(body.data, {
            id: body.data.id,
            nome: "Maria",
            email,
            role: "EDITOR",
            ativo: false,
        });
        assert.match(body.data.id, /^[\da-f-]{36}$/);
    } finally {
        prisma.user.findUnique = originalFindUnique;
    }
});

test("valida e normaliza os dados de criação", () => {
    const result = createAdminSchema.parse({ nome: " Maria ", email: "MARIA@EXAMPLE.COM", role: "EDITOR" });
    assert.deepEqual(result, { nome: "Maria", email: "maria@example.com", role: "EDITOR" });
    for (const body of [
        { nome: " ", email: "maria@example.com", role: "ADMIN" },
        { nome: "Maria", email: "inválido", role: "ADMIN" },
        { nome: "Maria", email: "maria@example.com", role: "USER" },
    ]) {
        assert.equal(createAdminSchema.safeParse(body).success, false);
    }
});

test("cria conta inativa sem dados sensíveis e rejeita e-mail duplicado", async () => {
    const email = `${randomUUID()}@example.com`;
    const admin = await createAdmin({ nome: "Maria", email, role: "ADMIN" });
    assert.deepEqual(Object.keys(admin).sort(), ["ativo", "email", "id", "nome", "role"]);
    assert.equal(admin.ativo, false);
    assert.match(admin.id, /^[\da-f-]{36}$/);
    await assert.rejects(
        createAdmin({ nome: "Outra", email, role: "EDITOR" }),
        (error) => error.statusCode === 409 && error.code === "ADMIN_ALREADY_EXISTS"
    );
});

test("autoriza somente a role configurada", () => {
    let continued = false;
    authorize("ADMIN")({ user: { role: "ADMIN" } }, {}, () => { continued = true; });
    assert.equal(continued, true);
    assert.throws(
        () => authorize("ADMIN")({ user: { role: "EDITOR" } }, {}, () => {}),
        (error) => error.statusCode === 403
    );
});
