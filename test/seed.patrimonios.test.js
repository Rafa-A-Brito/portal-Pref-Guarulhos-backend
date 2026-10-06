import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, basename, resolve, relative, isAbsolute } from "node:path";
import { runInNewContext } from "node:vm";
import { PATRIMONIOS, EXPECTED_COUNTS, SOURCE_SHA256 } from "../prisma/data/patrimonios.js";
import { validateResearch, validateAssets, planImport } from "../prisma/seed.patrimonios.js";

test("snapshot fiel ao mock atual, inclusive ausências, ordem e identidade 9/13", async (context) => {
    let raw;
    try { raw = await readFile(new URL("../../portal-PrefGuarulhos/frontend/src/features/mocks/patrimoniosMock.js", import.meta.url), "utf8"); }
    catch (error) { if (error.code === "ENOENT") return context.skip("Fonte externa ausente; o backend permanece independente."); throw error; }
    assert.equal(createHash("sha256").update(raw).digest("hex"), SOURCE_SHA256);
    // Conferência de fonte apenas no teste; a seed nunca executa esse módulo.
    const source = runInNewContext(raw.replace(/^import (\w+) from "([^"]+)";.*$/gm, (_, name, path) => `const ${name}=${JSON.stringify(basename(path))};`).replace("export const patrimoniosMock =", "const patrimoniosMock =") + "\npatrimoniosMock;", {}, { timeout: 1000 });
    assert.deepEqual(PATRIMONIOS, JSON.parse(JSON.stringify(source.map((p, index) => ({ ...p, numeroExibicao: Number(p.id), ordemExibicao: index })))));
    assert.deepEqual(validateResearch(), EXPECTED_COUNTS);
    assert.deepEqual(PATRIMONIOS.slice(26).map((p) => p.id), ["27", "32", "33", "28", "29", "30", "31", "34"]);
    const casa = PATRIMONIOS.find((p) => p.id === "9"), casarao = PATRIMONIOS.find((p) => p.id === "13");
    assert.deepEqual(casa.detalhes, casarao.detalhes);
    assert.notDeepEqual(casa.fatos, casarao.fatos);
    assert.notDeepEqual(casa.localizacao, casarao.localizacao);
    assert.notEqual(casa.imagemPrincipal, casarao.imagemPrincipal);
});

test("validação rejeita IDs, ordens, CEPs, coordenadas, textos, slugs e ligações inválidos", () => {
    const mutations = [
        (d) => { d[1].id = d[0].id; },
        (d) => { d[1].ordemExibicao = 0; },
        (d) => { d[0].cep = "123"; },
        (d) => { d[0].localizacao.lat = -91; },
        (d) => { d[0].localizacao.lng = null; },
        (d) => { d[0].resumo = "x".repeat(501); },
        (d) => { d[1].nome = d[0].nome; },
        (d) => { d[0].ligacoes[0].id = "99"; },
        (d) => { d[0].ligacoes[0].id = d[0].id; },
        (d) => { delete d[0].detalhes[0]; },
        (d) => { d[0].imagemPrincipal = "../../assets/foto.jpg"; },
        (d) => { d.pop(); },
    ];
    for (const mutate of mutations) { const data = structuredClone(PATRIMONIOS); mutate(data); assert.throws(() => validateResearch(data)); }
});

test("valida as 34 imagens por SHA256 e exige URL pública explícita", async () => {
    assert.equal(await validateAssets("http://localhost:3333/"), "http://localhost:3333");
    for (const url of [undefined, "/uploads", "ftp://host", "http://user:password@host", "http://host?token=1"]) await assert.rejects(validateAssets(url));
    const directory = await mkdtemp(join(tmpdir(), "patrimonios-assets-"));
    try { await assert.rejects(validateAssets("http://localhost:3333", PATRIMONIOS, directory), /ausente/); }
    finally {
        const target = resolve(directory), insideTemp = relative(resolve(tmpdir()), target);
        assert.ok(insideTemp && !insideTemp.startsWith("..") && !isAbsolute(insideTemp) && basename(target).startsWith("patrimonios-assets-"));
        await rm(target, { recursive: true });
    }
});

test("planejamento não aproxima nomes, detecta colisões e casos legados ambíguos", () => {
    const options = { existing: [], categories: [], user: null, logs: [], baseUrl: "http://localhost:3333" };
    assert.equal(planImport(options).report.novos, 34);
    const existing = [{ id: "old", nome: "Estação Ferroviária Central de Guarulhos", slug: "estacao-ferroviaria-central-de-guarulhos", numeroExibicao: null, ordemExibicao: null }];
    const plan = planImport({ ...options, existing });
    assert.ok(plan.issues.some((i) => i.includes("ambígua")));
    const collision = planImport({ ...options, categories: [{ nome: "Outra categoria", slug: "demolido" }] });
    assert.ok(collision.issues.some((i) => i.includes("Colisão de categoria")));
});
