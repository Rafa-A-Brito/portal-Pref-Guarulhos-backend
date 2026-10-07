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

test("PostgreSQL: edição, localização, transições concorrentes e visibilidade pública", {
    skip: !safeDatabase && "Configure TEST_DATABASE_URL para um banco exclusivo *_test e TEST_DATABASE_EXCLUSIVE=1.",
}, async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.JWT_SECRET = "integration-test-secret-with-at-least-32-characters";
    const { default: prisma } = await import("../src/config/prisma.js");
    const service = await import("../src/services/patrimonioService.js");
    const key = randomUUID();
    let user, categoria, categoriaAdicional, patrimonio;
    try {
        user = await prisma.user.create({ data: { name: "Teste patrimônio", email: `${key}@example.test`, passwordHash: "unused", role: "ADMIN" } });
        categoria = await prisma.categoria.create({ data: { nome: key, slug: key } });
        categoriaAdicional = await prisma.categoria.create({ data: { nome: `${key}-adicional`, slug: `${key}-adicional` } });
        patrimonio = await service.createPatrimonio({ nome: key, descricao: "Descrição", descricaoResumida: "Resumo", categoriaId: categoria.id, categoriasAdicionais: [categoriaAdicional.id] }, user.id);
        const id = patrimonio.id;
        const originalSlug = patrimonio.slug;
        await assert.rejects(service.getPatrimonioBySlug(originalSlug), { statusCode: 404 });
        await service.updatePatrimonio(id, { nome: `${key} editado`, localizacao: { endereco: "Rua", bairro: "Centro", latitude: -23, longitude: -46 } }, user);
        await service.updatePatrimonio(id, { localizacao: { latitude: -24 } }, user);
        const edited = await service.getAdminPatrimonio(id);
        assert.deepEqual(edited.categoriasAdicionais.map((item) => item.id), [categoriaAdicional.id]);
        assert.equal(edited.slug, originalSlug);
        assert.equal(edited.localizacao.latitude.toNumber(), -24);
        assert.equal(edited.localizacao.longitude.toNumber(), -46);
        assert.equal(edited.updatedBy, user.id);
        await assert.rejects(service.updatePatrimonio(id, { categoriaId: categoriaAdicional.id }, user), { statusCode: 400 });
        await assert.rejects(service.updatePatrimonio(id, { categoriasAdicionais: [randomUUID()] }, user), { statusCode: 400 });
        assert.deepEqual((await service.getAdminPatrimonio(id)).categoriasAdicionais.map((item) => item.id), [categoriaAdicional.id]);
        await service.updatePatrimonio(id, { categoriasAdicionais: [] }, user);
        assert.deepEqual((await service.getAdminPatrimonio(id)).categoriasAdicionais, []);
        await service.updatePatrimonio(id, { categoriasAdicionais: [categoriaAdicional.id] }, user);
        assert.deepEqual((await service.getAdminPatrimonio(id)).categoriasAdicionais.map((item) => item.id), [categoriaAdicional.id]);
        await assert.rejects(service.updatePatrimonio(id, { nome: "Não persistir", categoriaId: randomUUID() }, user), { statusCode: 400 });
        assert.equal((await service.getAdminPatrimonio(id)).nome, `${key} editado`);

        // Duas publicações simultâneas devem observar a mesma data após o bloqueio da linha.
        const published = await Promise.all([
            service.changePatrimonioStatus(id, "PUBLICADO", user),
            service.changePatrimonioStatus(id, "PUBLICADO", user),
        ]);
        assert.equal(published[0].publicadoEm.getTime(), published[1].publicadoEm.getTime());
        assert.equal(published[0].updatedAt.getTime(), published[1].updatedAt.getTime());
        assert.equal((await service.getPatrimonioBySlug(originalSlug)).id, id);
        assert.deepEqual((await service.getPatrimonioBySlug(originalSlug)).categoriasAdicionais.map((item) => item.id), [categoriaAdicional.id]);
        assert.equal((await service.listPatrimonios({ busca: key, pagina: 1, limite: 20 })).itens.length, 1);
        await assert.rejects(service.updatePatrimonio(id, { nome: "Proibido" }, { id: user.id, role: "EDITOR" }), { statusCode: 403 });

        const archived = await service.changePatrimonioStatus(id, "ARQUIVADO", user);
        assert.equal(archived.publicadoEm.getTime(), published[0].publicadoEm.getTime());
        assert.ok(archived.arquivadoEm);
        await assert.rejects(service.getPatrimonioBySlug(originalSlug), { statusCode: 404 });
        assert.equal((await service.listPatrimonios({ busca: key, pagina: 1, limite: 20 })).itens.length, 0);
        const repeated = await service.changePatrimonioStatus(id, "ARQUIVADO", user);
        assert.equal(repeated.arquivadoEm.getTime(), archived.arquivadoEm.getTime());
        assert.equal(repeated.updatedAt.getTime(), archived.updatedAt.getTime());
        const republished = await service.changePatrimonioStatus(id, "PUBLICADO", user);
        assert.equal(republished.arquivadoEm, null);
        assert.ok(republished.publicadoEm >= published[0].publicadoEm);
        assert.equal((await service.getPatrimonioBySlug(originalSlug)).id, id);
    } finally {
        // Remove somente os registros criados por este teste no banco exclusivo.
        try {
            if (patrimonio) await prisma.patrimonio.delete({ where: { id: patrimonio.id } });
            if (categoriaAdicional) await prisma.categoria.delete({ where: { id: categoriaAdicional.id } });
            if (categoria) await prisma.categoria.delete({ where: { id: categoria.id } });
            if (user) await prisma.user.delete({ where: { id: user.id } });
        } finally {
            await prisma.$disconnect();
        }
    }
});
