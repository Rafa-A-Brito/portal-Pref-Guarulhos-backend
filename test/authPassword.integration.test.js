import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

const testUrl = process.env.TEST_DATABASE_URL;
let databaseName;
try { databaseName = decodeURIComponent(new URL(testUrl).pathname.slice(1)); } catch { /* Configuração ausente. */ }
const safeDatabase = process.env.TEST_DATABASE_EXCLUSIVE === "1" &&
    /(?:^test_|_test$)/i.test(databaseName ?? "") && testUrl !== process.env.DATABASE_URL;

test("PostgreSQL: troca real de senha preserva login e não expõe hash", {
    skip: !safeDatabase && "Configure TEST_DATABASE_URL para um banco exclusivo *_test e TEST_DATABASE_EXCLUSIVE=1.",
}, async () => {
    process.env.DATABASE_URL = testUrl;
    process.env.JWT_SECRET = "integration-test-secret-with-at-least-32-characters";
    const { default: app } = await import("../src/app.js");
    const { default: prisma } = await import("../src/config/prisma.js");
    const { hashPassword, verifyPassword } = await import("../src/utils/password.js");
    const { generateToken } = await import("../src/utils/token.js");
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const senhaAtual = " SenhaInicial123! ", novaSenha = " NovaSenhaSegura123! ";
    let user;
    async function login(password) {
        const response = await fetch(`${base}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: user.email, password }) });
        return response;
    }
    try {
        user = await prisma.user.create({ data: {
            name: "Teste de senha", email: `${randomUUID()}@example.test`, role: "EDITOR", isActive: true,
            passwordHash: await hashPassword(senhaAtual),
        } });
        assert.equal((await login(senhaAtual)).status, 200);
        const token = generateToken(user.id);
        const response = await fetch(`${base}/auth/senha`, { method: "PATCH", headers: {
            authorization: `Bearer ${token}`, "content-type": "application/json",
        }, body: JSON.stringify({ senhaAtual, novaSenha }) });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.deepEqual(body, { success: true, message: "Senha alterada com sucesso." });
        assert.equal(JSON.stringify(body).includes("passwordHash"), false);
        const stored = await prisma.user.findUnique({ where: { id: user.id } });
        assert.notEqual(stored.passwordHash, senhaAtual);
        assert.notEqual(stored.passwordHash, novaSenha);
        assert.notEqual(stored.passwordHash, user.passwordHash);
        assert.equal(await verifyPassword(novaSenha, stored.passwordHash), true);
        assert.ok(stored.updatedAt >= user.updatedAt);
        assert.equal((await login(senhaAtual)).status, 401);
        assert.equal((await login(novaSenha)).status, 200);
    } finally {
        try { if (user) await prisma.user.delete({ where: { id: user.id } }); }
        finally {
            await new Promise((resolve) => server.close(resolve));
            await prisma.$disconnect();
        }
    }
});
