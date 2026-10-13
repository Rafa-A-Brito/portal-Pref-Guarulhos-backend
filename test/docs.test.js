import assert from "node:assert/strict";
import { test } from "node:test";
import SwaggerParser from "@apidevtools/swagger-parser";
import openapi from "../src/docs/openapi.js";

test("Swagger documenta região opcional nullable com códigos e rótulos em todos os contratos", async () => {
    const { RegiaoPatrimonio } = await import("@prisma/client");
    for (const name of ["LocalizacaoRequest", "LocalizacaoPatch", "Localizacao"]) {
        const schema = openapi.components.schemas[name];
        const regiao = schema.properties.regiao;
        assert.equal(schema.required?.includes("regiao") ?? false, false);
        assert.equal(regiao.nullable, true);
        assert.deepEqual(regiao.enum, [...Object.values(RegiaoPatrimonio), null]);
        assert.deepEqual(Object.keys(regiao["x-enum-labels"]), Object.values(RegiaoPatrimonio));
        assert.equal(regiao["x-enum-labels"].VILA_GALVAO, "Vila Galvão");
        assert.equal(regiao.enum.includes("NAO_INFORMADO"), false);
    }
});

test("especificação OpenAPI válida, com referências, rotas e autenticação corretas", async () => {
    await SwaggerParser.validate(openapi);
    assert.equal(openapi.openapi, "3.0.3");
    assert.deepEqual(openapi.servers, [{ url: "/" }]);

    const operations = Object.entries(openapi.paths).flatMap(([path, methods]) =>
        Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`));
    assert.deepEqual(operations.sort(), [
        "GET /api", "GET /api/health", "GET /api/docs", "GET /api/docs.json", "GET /api/admin/dashboard",
        "POST /api/auth/login", "PATCH /api/auth/senha", "POST /api/admins", "GET /api/patrimonios",
        "GET /api/patrimonios/{slug}", "POST /api/admin/patrimonios",
        "GET /api/admin/patrimonios", "GET /api/admin/patrimonios/{id}",
        "PATCH /api/admin/patrimonios/{id}", "PATCH /api/admin/patrimonios/{id}/publicar",
        "PATCH /api/admin/patrimonios/{id}/arquivar",
        "POST /api/admin/patrimonios/{id}/imagens", "PATCH /api/admin/patrimonios/{id}/imagens/{imagemId}",
        "DELETE /api/admin/patrimonios/{id}/imagens/{imagemId}",
        "POST /api/admin/patrimonios/{id}/documentos", "PATCH /api/admin/patrimonios/{id}/documentos/{documentoId}",
        "DELETE /api/admin/patrimonios/{id}/documentos/{documentoId}",
        "GET /api/uploads/{tipo}/{arquivo}",
    ].sort());

    for (const [path, methods] of Object.entries(openapi.paths)) {
        for (const operation of Object.values(methods)) {
            assert.equal(Boolean(operation.security), path === "/api/admins" || path === "/api/auth/senha" || path.startsWith("/api/admin/"));
        }
    }
    assert.equal(openapi.components.schemas.AdminRequest.properties.password.writeOnly, true);
    assert.equal(openapi.components.schemas.LoginRequest.properties.password.writeOnly, true);
    assert.equal(openapi.components.schemas.ChangePasswordRequest.properties.novaSenha.writeOnly, true);
    assert.equal(JSON.stringify(openapi).includes("passwordHash"), false);
    assert.equal(openapi.components.schemas.PatrimonioResumo.properties.imagens.maxItems, 1);
    assert.equal(openapi.paths["/api/dashboard"], undefined);
    const dashboard = openapi.paths["/api/admin/dashboard"].get;
    assert.deepEqual(dashboard.security, [{ bearerAuth: [] }]);
    assert.match(dashboard.description, /ADMIN/);
    assert.match(dashboard.description, /EDITOR/);
    assert.ok(dashboard.responses[401]);
    assert.ok(dashboard.responses[403]);
    const dashboardSchema = openapi.components.schemas.Dashboard;
    assert.ok(dashboardSchema.required.includes("totalPatrimonios"));
    assert.equal(dashboardSchema.properties.totalPublicados, undefined);
    assert.deepEqual(dashboardSchema.properties.meta.properties.baseContagem.enum, ["TODOS_OS_STATUS"]);
    assert.deepEqual(dashboardSchema.properties.meta.properties.parcial.enum, [false]);
    assert.equal(dashboardSchema.properties.meta.properties.pendencias.maxItems, 0);
    assert.deepEqual(Object.keys(dashboardSchema.properties).sort(), ["localizacao", "meta", "porCategoria", "totalPatrimonios"]);
    assert.equal(openapi.components.schemas.DashboardIndicadorPendente, undefined);
    const regionalSchema = dashboardSchema.properties.localizacao.properties.regioes;
    assert.deepEqual(regionalSchema.required, ["disponivel", "totalRegioesDistintas", "distribuicao"]);
    assert.deepEqual(regionalSchema.properties.disponivel.enum, [true]);
    const regionalItem = regionalSchema.properties.distribuicao.items;
    assert.deepEqual(regionalItem.required, ["regiao", "nome", "quantidade"]);
    assert.equal(regionalItem.properties.regiao.nullable, true);
    assert.equal(regionalItem.properties.quantidade.minimum, 1);
    for (const example of Object.values(dashboard.responses[200].content["application/json"].examples)) {
        assert.equal(example.value.data.meta.baseContagem, "TODOS_OS_STATUS");
        assert.equal(example.value.data.totalPublicados, undefined);
        assert.ok(Number.isInteger(example.value.data.totalPatrimonios));
        assert.deepEqual(example.value.data.meta, { parcial: false, baseContagem: "TODOS_OS_STATUS", pendencias: [] });
        assert.equal(Object.hasOwn(example.value.data, "porTombamento"), false);
        assert.equal(Object.hasOwn(example.value.data, "rotas"), false);
        const regions = example.value.data.localizacao.regioes;
        assert.equal(regions.disponivel, true);
        assert.equal(regions.distribuicao.reduce((sum, item) => sum + item.quantidade, 0), example.value.data.totalPatrimonios);
        assert.equal(regions.totalRegioesDistintas, regions.distribuicao.filter((item) => item.regiao !== null).length);
        for (const item of regions.distribuicao) {
            assert.ok(item.quantidade > 0);
            assert.equal(item.nome, item.regiao === null ? "Não informado" : regionalItem.properties.regiao["x-enum-labels"][item.regiao]);
        }
    }
    assert.equal(openapi.components.schemas.PatrimonioRequest.required.includes("descricao"), false);
    assert.equal(openapi.components.schemas.PatrimonioDetalhe.properties.descricao.nullable, true);
    for (const name of ["Secao", "Fato", "Ligacao"]) assert.ok(openapi.components.schemas[name].properties.id);
    for (const name of ["PatrimonioRequest", "PatrimonioPatch"]) {
        const fields = openapi.components.schemas[name].properties;
        assert.equal(fields.categoriasAdicionais.maxItems, 6);
        assert.equal(fields.categoriasAdicionais.uniqueItems, true);
        for (const field of ["secoes", "fatos", "ligacoes", "numeroExibicao", "ordemExibicao"]) assert.ok(fields[field]);
        for (const field of ["descricao", "historia", "importanciaCultural"]) assert.equal(fields[field].nullable, true);
    }
    for (const name of ["PatrimonioResumo", "PatrimonioDetalhe", "PatrimonioCriado", "PatrimonioAdminResumo", "PatrimonioAdmin"]) {
        const contract = openapi.components.schemas[name];
        assert.equal(new Set(contract.required).size, contract.required.length, name);
        assert.ok(contract.properties.categoriasAdicionais);
    }
});

test("Swagger UI e JSON respondem sem consultar o banco", async () => {
    process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/docs_test";
    process.env.JWT_SECRET = "docs-test-secret-with-at-least-32-characters";
    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);

    try {
        await new Promise((resolve) => server.once("listening", resolve));
        const base = `http://127.0.0.1:${server.address().port}`;
        const jsonResponse = await fetch(`${base}/api/docs.json`);
        assert.equal(jsonResponse.status, 200);
        assert.match(jsonResponse.headers.get("content-type"), /application\/json/);
        const json = await jsonResponse.json();
        assert.equal(json.openapi, "3.0.3");
        assert.ok(json.paths["/api/patrimonios/{slug}"]);

        const uiResponse = await fetch(`${base}/api/docs`);
        assert.equal(uiResponse.status, 200);
        assert.match(uiResponse.headers.get("content-type"), /text\/html/);
        const html = await uiResponse.text();
        assert.match(html, /Swagger UI/);
        const initResponse = await fetch(`${base}/api/docs/swagger-ui-init.js`);
        assert.equal(initResponse.status, 200);
        assert.match(await initResponse.text(), /persistAuthorization/);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
