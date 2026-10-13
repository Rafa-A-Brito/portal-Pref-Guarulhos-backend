import assert from "node:assert/strict";
import { test } from "node:test";
import { createDocumentoSchema, updateDocumentoSchema, updateImagemSchema } from "../src/schemas/midiaSchema.js";
import errorHandler from "../src/middlewares/errorHandler.js";

test("data civil: null, omissão e texto multipart preservam a semântica", () => {
    assert.equal(updateDocumentoSchema.parse({ dataDocumento: null }).dataDocumento, null);
    assert.equal(createDocumentoSchema.parse({ titulo: "Teste", tipo: "pdf", dataDocumento: null }).dataDocumento, null);
    assert.equal("dataDocumento" in updateDocumentoSchema.parse({ titulo: "Teste" }), false);
    for (const schema of [createDocumentoSchema, updateDocumentoSchema]) {
        const parsed = schema.parse({ titulo: "Teste", tipo: "pdf", dataDocumento: "2024-02-29" });
        assert.equal(parsed.dataDocumento.toISOString(), "2024-02-29T00:00:00.000Z");
    }
});

test("datas inválidas e coerções indevidas retornam 400", () => {
    for (const value of ["", " ", "null", "inválida", "2023-02-29", "2026-04-31", true, false, 0, 123, {}, [], "2026-01-01T23:00:00-03:00"]) {
        for (const schema of [createDocumentoSchema, updateDocumentoSchema]) {
            const result = schema.safeParse({ titulo: "Teste", tipo: "pdf", dataDocumento: value });
            assert.equal(result.success, false, JSON.stringify(value));
            let status;
            errorHandler(result.error, {}, { status(code) { status = code; return this; }, json() {} }, () => assert.fail());
            assert.equal(status, 400);
        }
    }
});

test("PATCH permite limpar somente os metadados nullable e preserva omissões", () => {
    for (const [schema, fields, required] of [
        [updateImagemSchema, ["titulo", "credito", "fonte"], ["textoAlternativo", "principal"]],
        [updateDocumentoSchema, ["descricao", "fonte", "dataDocumento"], ["titulo", "tipo"]],
    ]) {
        for (const field of fields) {
            assert.deepEqual(schema.parse({ [field]: null }), { [field]: null });
        }
        for (const field of required) assert.equal(schema.safeParse({ [field]: null }).success, false);
        const parsed = schema.parse({ fonte: "null" });
        assert.deepEqual(parsed, { fonte: "null" });
    }
});
