import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
let databaseName;
try {
    databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
} catch { /* Sem banco de teste configurado. */ }
const safeDatabase = process.env.TEST_DATABASE_EXCLUSIVE === "1" &&
    /(?:^test_|_test$)/i.test(databaseName ?? "") && testDatabaseUrl !== process.env.DATABASE_URL;

test("PostgreSQL: dashboard ADMIN/EDITOR conta todos os status; transições preservam o total e consulta pública só PUBLICADO", {
    concurrency: false,
    skip: !safeDatabase && "Configure TEST_DATABASE_URL para um banco exclusivo *_test e TEST_DATABASE_EXCLUSIVE=1.",
}, async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.JWT_SECRET = "integration-test-secret-with-at-least-32-characters";
    const { default: app } = await import("../src/app.js");
    const { default: prisma } = await import("../src/config/prisma.js");
    const { generateToken } = await import("../src/utils/token.js");
    const { changePatrimonioStatus } = await import("../src/services/patrimonioService.js");
    const key = randomUUID();
    const bairro = `dashboard-${key}`;
    const bairroOculto = `oculto-${key}`;
    const categorias = [];
    const patrimonios = [];
    let user;
    let server;
    try {
        user = await prisma.user.create({ data: {
            name: "Teste dashboard", email: `${key}@example.test`, passwordHash: "unused", role: "ADMIN",
        } });
        for (const suffix of ["principal", "adicional"]) {
            categorias.push(await prisma.categoria.create({ data: { nome: `${key}-${suffix}`, slug: `${key}-${suffix}` } }));
        }
        const [principal, adicional] = categorias;
        const fixtures = [
            { status: "PUBLICADO", bairro },
            { status: "PUBLICADO", bairro: ` ${bairro} ` },
            { status: "PUBLICADO", bairro: "" },
            { status: "PUBLICADO" }, // Sem localização.
            { status: "RASCUNHO", bairro: bairroOculto },
            { status: "ARQUIVADO", bairro: bairroOculto },
        ];
        for (const [index, fixture] of fixtures.entries()) {
            patrimonios.push(await prisma.patrimonio.create({ data: {
                nome: `${key}-${index}`, slug: `${key}-${index}`, descricao: "Teste", descricaoResumida: "Teste",
                categoriaId: principal.id, createdBy: user.id, status: fixture.status,
                ...(fixture.bairro !== undefined && { localizacao: { create: { endereco: "Rua de teste", bairro: fixture.bairro } } }),
                categoriasAdicionais: { create: { categoriaId: adicional.id } },
            } }));
        }

        server = app.listen(0);
        await new Promise((resolve) => server.once("listening", resolve));
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/dashboard`, {
            headers: { authorization: `Bearer ${generateToken(user.id)}` },
        });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.success, true);
        const data = body.data;
        const categoria = data.porCategoria.dados.find((item) => item.id === principal.id);
        assert.equal(categoria.quantidade, 6);
        assert.equal(categoria.percentual, Number((6 * 100 / data.totalPatrimonios).toFixed(2)));
        assert.equal(data.porCategoria.dados.some((item) => item.id === adicional.id), false);
        assert.equal(data.porCategoria.dados.reduce((sum, item) => sum + item.quantidade, 0), data.totalPatrimonios);
        const bairros = data.localizacao.bairros;
        assert.equal(bairros.distribuicao.find((item) => item.bairro === bairro).quantidade, 2);
        assert.equal(bairros.distribuicao.find((item) => item.bairro === bairroOculto).quantidade, 2);
        assert.ok(bairros.distribuicao.find((item) => item.bairro === "Não informado").quantidade >= 2);
        assert.equal(bairros.distribuicao.reduce((sum, item) => sum + item.quantidade, 0), data.totalPatrimonios);
        assert.equal(data.meta.baseContagem, "TODOS_OS_STATUS");
        assert.equal(data.totalPublicados, undefined);

        const base = `http://127.0.0.1:${server.address().port}`;
        const consultarDashboard = async () => {
            const result = await fetch(`${base}/api/admin/dashboard`, {
                headers: { authorization: `Bearer ${generateToken(user.id)}` },
            });
            assert.equal(result.status, 200);
            return (await result.json()).data;
        };
        const conferirPublicos = async (esperado) => {
            const result = await fetch(`${base}/api/patrimonios?busca=${key}`);
            assert.equal(result.status, 200);
            const publicos = (await result.json()).data;
            assert.equal(publicos.paginacao.total, esperado);
            assert.equal(publicos.itens.length, esperado);
        };
        await conferirPublicos(4);
        await changePatrimonioStatus(patrimonios[4].id, "PUBLICADO", user);
        assert.deepEqual(await consultarDashboard(), data);
        await conferirPublicos(5);
        await changePatrimonioStatus(patrimonios[4].id, "ARQUIVADO", user);
        assert.deepEqual(await consultarDashboard(), data);
        await conferirPublicos(4);

        await prisma.user.update({ where: { id: user.id }, data: { role: "EDITOR" } });
        const editorResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/dashboard`, {
            headers: { authorization: `Bearer ${generateToken(user.id)}` },
        });
        assert.equal(editorResponse.status, 200);
        const editorBody = await editorResponse.json();
        assert.equal(editorBody.success, true);
        assert.equal(editorBody.data.porCategoria.dados.find((item) => item.id === principal.id).quantidade, 6);
    } finally {
        try {
            if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        } finally {
            try {
                // Remove somente as fixtures desta execução; relações são apagadas por cascade.
                if (user) await prisma.patrimonio.deleteMany({ where: { createdBy: user.id } });
                if (categorias.length) await prisma.categoria.deleteMany({ where: { id: { in: categorias.map((item) => item.id) } } });
                if (user) await prisma.user.delete({ where: { id: user.id } });
            } finally {
                await prisma.$disconnect();
            }
        }
    }
});
