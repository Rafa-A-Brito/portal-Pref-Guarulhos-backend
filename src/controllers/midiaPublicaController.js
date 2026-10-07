import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import prisma from "../config/prisma.js";
import { PASTAS } from "../config/storage.js";
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

// Entrega o arquivo sem expor a pasta uploads inteira.
export async function servirArquivo(req, res) {
    const { tipo, arquivo } = req.validatedParams;
    const nome = path.basename(arquivo);
    const caminho = path.join(PASTAS[PASTA_POR_TIPO[tipo]], nome);
    const url = `/uploads/${tipo}/${nome}`;

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

    createReadStream(caminho).pipe(res);
}
