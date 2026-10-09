import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import prisma from "../config/prisma.js";
import { PASTAS, URL_PREFIXO } from "../config/storage.js";
import { MIME_POR_EXTENSAO } from "../utils/arquivos.js";
import NotFoundError from "../errors/NotFoundError.js";
import UnauthorizedError from "../errors/UnauthorizedError.js";


const PASTA_POR_TIPO = { imagens: "imagem", documentos: "documento" };

function consultarRegistro(tipo, url) {
    const select = { patrimonio: { select: { status: true } } };
    return tipo === "imagens"
        ? prisma.patrimonioImagem.findFirst({ where: { url }, select })
        : prisma.patrimonioDocumento.findFirst({ where: { url }, select });
}

// Vai entregar o arquivo sem expor a pasta uploads inteira.
export async function servirArquivo(req, res, next) {
    const { tipo, arquivo } = req.validatedParams;
    const nome = path.basename(arquivo);
    const caminho = path.join(PASTAS[PASTA_POR_TIPO[tipo]], nome);
    const url = `${URL_PREFIXO[PASTA_POR_TIPO[tipo]]}/${nome}`;

    try {
        await stat(caminho);
    } catch {
        throw new NotFoundError("Arquivo não encontrado.");
    }

    const registro = await consultarRegistro(tipo, url);
    if (!registro) throw new NotFoundError("Arquivo não encontrado.");

    if (registro.patrimonio.status !== "PUBLICADO") {
        if (!req.user || !["ADMIN", "EDITOR"].includes(req.user.role)) {
            throw new UnauthorizedError("Mídia disponível apenas para usuários autenticados.");
        }
    }

    res.setHeader("Content-Type", MIME_POR_EXTENSAO[path.extname(nome)] ?? "application/octet-stream");

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `inline; filename="${nome}"`);

    const stream = createReadStream(caminho);

    // Se o arquivo desaparecer ou falhar durante a leitura, o pipe precisa ser
    // encerrado. Quando o erro vem antes de enviar qualquer byte, ainda dá para
    // responder via errorHandler; depois disso, destrói a resposta.
    stream.on("error", (erro) => {
        if (res.headersSent) {
            res.destroy(erro);
            return;
        }
        next(erro);
    });

    stream.pipe(res).on("error", (erro) => {
        stream.destroy();
        if (res.headersSent) {
            res.destroy(erro);
            return;
        }
        next(erro);
    });
}
