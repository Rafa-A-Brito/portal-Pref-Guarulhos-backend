import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

process.env.DATABASE_URL = "postgresql://localhost:5432/test_auth_password";
process.env.JWT_SECRET = "test-secret-with-at-least-32-characters";
const { default: app } = await import("../src/app.js");
const { default: prisma } = await import("../src/config/prisma.js");
const { hashPassword, verifyPassword } = await import("../src/utils/password.js");
const { generateToken, verifyToken } = await import("../src/utils/token.js");
const { changePasswordSchema } = await import("../src/schemas/authSchema.js");
const { createAdminSchema } = await import("../src/schemas/adminSchema.js");
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
function mockUser(t, role = "EDITOR", active = true) {
    const originalFind = prisma.user.findUnique;
    const originalUpdate = prisma.user.updateMany;
    const id = randomUUID();
    const email = `${id}@example.test`;
    let user;
    let writes = 0;
    prisma.user.findUnique = async ({ where }) => where.id === id || where.email === email ? user : null;
    prisma.user.updateMany = async ({ where, data }) => {
        writes++;
        assert.deepEqual(Object.keys(data), ["passwordHash"]);
        if (where.id !== id || where.isActive !== true || where.passwordHash !== user.passwordHash || !user.isActive) return { count: 0 };
        user = { ...user, ...data, updatedAt: new Date() };
        return { count: 1 };
    };
    t.after(() => {
        prisma.user.findUnique = originalFind;
        prisma.user.updateMany = originalUpdate;
    });
    return {
        async initialize() { user = { id, email, name: "Usuário", role, isActive: active, passwordHash: await hashPassword(" SenhaInicial123! "), updatedAt: new Date(0) }; },
        id, email, token: generateToken(id),
        get user() { return user; }, get writes() { return writes; },
    };
}
async function call(path, { token, body, method = "PATCH" } = {}) {
    const response = await fetch(base + path, { method, headers: {
        ...(token && { authorization: `Bearer ${token}` }),
        ...(body && { "content-type": "application/json" }),
    }, ...(body && { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
}

test("reutiliza regras de cadastro, preserva espaços e rejeita campos extras", () => {
    const current = " SenhaInicial123! ", next = " NovaSenhaSegura123! ";
    assert.deepEqual(changePasswordSchema.parse({ senhaAtual: current, novaSenha: next }), { senhaAtual: current, novaSenha: next });
    assert.deepEqual(createAdminSchema.parse({ nome: "Nome", email: "a@b.com", role: "EDITOR", password: next }).password, next);
    for (const body of [{ senhaAtual: current }, { novaSenha: next }, { senhaAtual: current, novaSenha: "curta" },
        { senhaAtual: current, novaSenha: "é".repeat(40) }, { senhaAtual: "", novaSenha: next },
        { senhaAtual: current, novaSenha: next, id: randomUUID() }, { senhaAtual: current, novaSenha: next, email: "x@y.com" }]) {
        assert.equal(changePasswordSchema.safeParse(body).success, false);
    }
});

for (const role of ["EDITOR", "ADMIN"]) {
    test(`${role} troca a própria senha; login aceita só a nova e resposta não expõe credenciais`, async (t) => {
        const fixture = mockUser(t, role);
        await fixture.initialize();
        const oldHash = fixture.user.passwordHash;
        const token = fixture.token;
        const changed = await call("/auth/senha", { token, body: { senhaAtual: " SenhaInicial123! ", novaSenha: " NovaSenhaSegura123! " } });
        assert.equal(changed.status, 200);
        assert.deepEqual(changed.body, { success: true, message: "Senha alterada com sucesso." });
        assert.equal(fixture.writes, 1);
        assert.notEqual(fixture.user.passwordHash, oldHash);
        assert.equal(await verifyPassword(" NovaSenhaSegura123! ", fixture.user.passwordHash), true);
        assert.equal(await verifyPassword("NovaSenhaSegura123!", fixture.user.passwordHash), false);
        assert.equal((await call("/auth/login", { method: "POST", body: { email: fixture.email, password: " SenhaInicial123! " } })).status, 401);
        assert.equal((await call("/auth/login", { method: "POST", body: { email: fixture.email, password: " NovaSenhaSegura123! " } })).status, 200);
        assert.equal(verifyToken(token).sub, fixture.id);
        assert.equal(JSON.stringify(changed.body).includes("passwordHash"), false);
        assert.equal(JSON.stringify(changed.body).includes("NovaSenhaSegura123!"), false);
    });
}

test("senha atual incorreta, nova igual e nova inválida não alteram o banco", async (t) => {
    const fixture = mockUser(t);
    await fixture.initialize();
    const first = await call("/auth/senha", { token: fixture.token, body: { senhaAtual: "SenhaErrada123!", novaSenha: "NovaSenhaSegura123!" } });
    assert.equal(first.status, 400);
    const second = await call("/auth/senha", { token: fixture.token, body: { senhaAtual: " SenhaInicial123! ", novaSenha: " SenhaInicial123! " } });
    assert.equal(second.status, 400);
    const third = await call("/auth/senha", { token: fixture.token, body: { senhaAtual: " SenhaInicial123! ", novaSenha: "curta" } });
    assert.equal(third.status, 400);
    assert.equal(fixture.writes, 0);
    assert.equal(await verifyPassword(" SenhaInicial123! ", fixture.user.passwordHash), true);
});

test("sem token, token inválido e usuário inativo retornam 401", async (t) => {
    const body = { senhaAtual: " SenhaInicial123! ", novaSenha: "NovaSenhaSegura123!" };
    assert.equal((await call("/auth/senha", { body })).status, 401);
    assert.equal((await call("/auth/senha", { token: "invalid", body })).status, 401);
    const fixture = mockUser(t, "EDITOR", false);
    await fixture.initialize();
    assert.equal((await call("/auth/senha", { token: fixture.token, body })).status, 401);
    assert.equal(fixture.writes, 0);
});

test("não aceita outro usuário no corpo", async (t) => {
    const fixture = mockUser(t);
    await fixture.initialize();
    for (const extra of [{ id: randomUUID() }, { email: "outro@example.com" }, { userId: randomUUID() }]) {
        const result = await call("/auth/senha", { token: fixture.token, body: { senhaAtual: " SenhaInicial123! ", novaSenha: "NovaSenhaSegura123!", ...extra } });
        assert.equal(result.status, 400);
    }
    assert.equal(fixture.writes, 0);
});

test("atualização concorrente não sobrescreve hash alterado", async (t) => {
    const fixture = mockUser(t);
    await fixture.initialize();
    prisma.user.updateMany = async () => ({ count: 0 });
    const result = await call("/auth/senha", { token: fixture.token, body: { senhaAtual: " SenhaInicial123! ", novaSenha: "NovaSenhaSegura123!" } });
    assert.equal(result.status, 400);
});
