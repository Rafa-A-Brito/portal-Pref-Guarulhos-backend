import assert from "node:assert/strict";
import { test } from "node:test";
import SwaggerParser from "@apidevtools/swagger-parser";
import openapi from "../src/docs/openapi.js";

test("especificação OpenAPI válida, com referências, rotas e autenticação corretas", async () => {
    await SwaggerParser.validate(openapi);
    assert.equal(openapi.openapi, "3.0.3");
    assert.deepEqual(openapi.servers, [{ url: "/" }]);

    const operations = Object.entries(openapi.paths).flatMap(([path, methods]) =>
        Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`));
    assert.deepEqual(operations.sort(), [
        "GET /api", "GET /api/health", "GET /api/docs", "GET /api/docs.json",
        "POST /api/auth/login", "PATCH /api/auth/senha", "POST /api/admins", "GET /api/patrimonios",
        "GET /api/patrimonios/{slug}", "POST /api/admin/patrimonios",
        "GET /api/admin/patrimonios", "GET /api/admin/patrimonios/{id}",
        "PATCH /api/admin/patrimonios/{id}", "PATCH /api/admin/patrimonios/{id}/publicar",
        "PATCH /api/admin/patrimonios/{id}/arquivar",
    ].sort());

    for (const [path, methods] of Object.entries(openapi.paths)) {
        for (const operation of Object.values(methods)) {
            assert.equal(Boolean(operation.security), path === "/api/admins" || path === "/api/auth/senha" || path.startsWith("/api/admin/patrimonios"));
        }
    }
    assert.equal(openapi.components.schemas.AdminRequest.properties.password.writeOnly, true);
    assert.equal(openapi.components.schemas.LoginRequest.properties.password.writeOnly, true);
    assert.equal(openapi.components.schemas.ChangePasswordRequest.properties.novaSenha.writeOnly, true);
    assert.equal(JSON.stringify(openapi).includes("passwordHash"), false);
    assert.equal(openapi.components.schemas.PatrimonioResumo.properties.imagens.maxItems, 1);
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
