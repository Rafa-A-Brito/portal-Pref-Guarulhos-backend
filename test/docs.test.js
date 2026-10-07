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
        "GET /api", "GET /api/health", "GET /api/docs", "GET /api/docs.json", "GET /api/admin/dashboard",
        "POST /api/auth/login", "PATCH /api/auth/senha", "POST /api/admins", "GET /api/patrimonios",
        "GET /api/patrimonios/{slug}", "POST /api/admin/patrimonios",
        "GET /api/admin/patrimonios", "GET /api/admin/patrimonios/{id}",
        "PATCH /api/admin/patrimonios/{id}", "PATCH /api/admin/patrimonios/{id}/publicar",
        "PATCH /api/admin/patrimonios/{id}/arquivar",
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
    for (const example of Object.values(dashboard.responses[200].content["application/json"].examples)) {
        assert.equal(example.value.data.meta.baseContagem, "TODOS_OS_STATUS");
        assert.equal(example.value.data.totalPublicados, undefined);
        assert.ok(Number.isInteger(example.value.data.totalPatrimonios));
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
