import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const exclusive = process.env.TEST_DATABASE_EXCLUSIVE === "1";
let testDatabaseName;

if (testDatabaseUrl) {
    try {
        testDatabaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
    } catch {
        // A configuração inválida é recusada abaixo, antes de qualquer conexão.
    }
}

const safeTestDatabase = exclusive &&
    testDatabaseName &&
    /(?:^test_|_test$)/i.test(testDatabaseName) &&
    testDatabaseUrl !== process.env.DATABASE_URL;

test("cadastro persiste no PostgreSQL e permite login após reiniciar a API", {
    skip: !safeTestDatabase && "Configure TEST_DATABASE_URL para um banco exclusivo *_test e TEST_DATABASE_EXCLUSIVE=1.",
}, async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.JWT_SECRET = "integration-test-secret-with-at-least-32-characters";

    const { default: app } = await import("../src/app.js");
    const { default: prisma } = await import("../src/config/prisma.js");
    const { hashPassword, verifyPassword } = await import("../src/utils/password.js");
    const { generateToken } = await import("../src/utils/token.js");

    let server;
    const startServer = async () => {
        server = app.listen(0);
        await new Promise((resolve) => server.once("listening", resolve));
        return `http://127.0.0.1:${server.address().port}`;
    };
    const stopServer = async () => {
        await new Promise((resolve) => server.close(resolve));
    };

    try {
        const bootstrap = await prisma.user.create({
            data: {
                name: "Administrador de teste",
                email: `bootstrap-${randomUUID()}@example.test`,
                passwordHash: await hashPassword(randomUUID()),
                role: "ADMIN",
                isActive: true,
            },
            select: { id: true },
        });

        const email = `novo-${randomUUID()}@example.test`;
        const password = "senha-de-teste-123";
        let baseUrl = await startServer();
        const createResponse = await fetch(`${baseUrl}/api/admins`, {
            method: "POST",
            headers: {
                authorization: `Bearer ${generateToken(bootstrap.id)}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({ nome: "Nova Editora", email, role: "EDITOR", password }),
        });
        const created = await createResponse.json();
        assert.equal(createResponse.status, 201);
        assert.equal(created.data.ativo, true);
        assert.equal("passwordHash" in created.data, false);

        const stored = await prisma.user.findUnique({ where: { email } });
        assert.equal(stored.id, created.data.id);
        assert.equal(stored.isActive, true);
        assert.notEqual(stored.passwordHash, password);
        assert.equal(await verifyPassword(password, stored.passwordHash), true);

        const duplicateResponse = await fetch(`${baseUrl}/api/admins`, {
            method: "POST",
            headers: {
                authorization: `Bearer ${generateToken(bootstrap.id)}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({ nome: "Outra", email, role: "ADMIN", password }),
        });
        assert.equal(duplicateResponse.status, 409);
        assert.equal((await duplicateResponse.json()).error.code, "ADMIN_ALREADY_EXISTS");

        await stopServer();
        server = undefined;
        baseUrl = await startServer();
        const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        const login = await loginResponse.json();
        assert.equal(loginResponse.status, 200);
        assert.equal(login.data.user.id, stored.id);
    } finally {
        if (server) await stopServer();
        await prisma.$disconnect();
    }
});
