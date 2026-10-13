// Executa migrations e testes somente em um PostgreSQL Docker descartável criado aqui.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const name = `patrimonios-test-${randomBytes(6).toString("hex")}`;
const password = randomBytes(32).toString("hex");
const run = (cmd, args, { env = process.env, capture = false } = {}) => new Promise((resolveResult, reject) => {
    const child = spawn(cmd, args, { cwd, env, windowsHide: true, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    let output = "";
    if (capture) {
        child.stdout.on("data", (chunk) => { output += chunk; });
        child.stderr.on("data", (chunk) => { output += chunk; });
    }
    child.on("error", () => reject(new Error(`Não foi possível executar ${cmd}.`)));
    child.on("exit", (code) => code === 0 ? resolveResult(output.trim()) : reject(new Error(`Falha em ${cmd} (código ${code}).`)));
});
let started = false;
try {
    console.log("Criando PostgreSQL 17 isolado em Docker, sem volume persistente.");
    await run("docker", ["run", "--detach", "--name", name, "--publish", "127.0.0.1::5432", "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_DB=patrimonio_test", "postgres:17"], { env: { ...process.env, POSTGRES_PASSWORD: password }, capture: true });
    started = true;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
        try { await run("docker", ["exec", name, "pg_isready", "-U", "postgres", "-d", "patrimonio_test"], { capture: true }); ready = true; break; } catch { await setTimeout(1000); }
    }
    if (!ready) throw new Error("PostgreSQL isolado não ficou disponível.");
    const port = (await run("docker", ["port", name, "5432/tcp"], { capture: true })).split(":").at(-1);
    const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/patrimonio_test`;
    const env = { ...process.env, DATABASE_URL: databaseUrl, CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1", PATRIMONIOS_PUBLIC_BASE_URL: "http://localhost:3333" };
    const cli = resolve(cwd, "node_modules/prisma/build/index.js");
    await run(process.execPath, [cli, "migrate", "deploy"], { env });
    await run(process.execPath, [cli, "migrate", "status"], { env });
    // O banco principal configurado no .env nunca é utilizado pelos testes.
    await run(process.execPath, ["--test", "--test-concurrency=1"], { env: { ...env, DATABASE_URL: "postgresql://unused@127.0.0.1:1/unused", TEST_DATABASE_URL: databaseUrl, TEST_DATABASE_EXCLUSIVE: "1" } });
    console.log("Migrations e testes no PostgreSQL isolado concluídos.");
} catch (error) {
    console.error(error.message.replaceAll(password, "[redacted]"));
    process.exitCode = 1;
} finally {
    if (started) {
        await run("docker", ["rm", "--force", "--volumes", name], { capture: true });
        console.log("Container e dados de teste descartados.");
    }
}
