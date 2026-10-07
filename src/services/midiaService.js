import path from "node:path";
import prisma from "../config/prisma.js";
import { PASTAS, URL_PREFIXO } from "../config/storage.js";
import BadRequestError from "../errors/BadRequestError.js";
import BaseError from "../errors/BaseError.js";
import ForbiddenError from "../errors/ForbiddenError.js";
import NotFoundError from "../errors/NotFoundError.js";
import { TIPOS_DOCUMENTO, TIPOS_IMAGEM, apagarArquivoGerenciado, detectarMimeReal, lerCabecalho } from "../utils/arquivos.js";

const SELECT_MIDIA = {
    id: true,
    patrimonioId: true,
    url: true,
};

async function exigirPatrimonio(client, id) {
    const patrimonio = await client.patrimonio.findUnique({
        where: { id },
        select: { id: true, status: true },
    });

    if (!patrimonio) {
        const erro = new NotFoundError("Patrimônio não encontrado.");
        erro.code = "PATRIMONIO_NOT_FOUND";
        throw erro;
    }

    return patrimonio;
}

// EDITOR só altera mídia de rascunho; ADMIN altera em qualquer status.
function exigirPermissao(status, user) {
    if (user.role !== "ADMIN" && (user.role !== "EDITOR" || status !== "RASCUNHO")) {
        throw new ForbiddenError("Editor pode alterar mídias somente de rascunhos.");
    }
}

// Converte a URL pública em caminho de disco. URL externa devolve null, o que
// garante que a API nunca apague arquivo que não gerencia.
function caminhoDoArquivo(url) {
    for (const [tipo, prefixo] of Object.entries(URL_PREFIXO)) {
        if (url.startsWith(`${prefixo}/`)) {
            return path.join(PASTAS[tipo], path.basename(url));
        }
    }
    return null;
}

// Confere a assinatura do arquivo que o multer já gravou. 
async function validarConteudo(arquivo, tiposPermitidos) {
    const mimeReal = detectarMimeReal(await lerCabecalho(arquivo.path));

    if (!mimeReal || !tiposPermitidos[mimeReal] || mimeReal !== arquivo.mimetype) {
        const erro = new BaseError("O conteúdo do arquivo não corresponde a um formato suportado.", 415);
        erro.code = "UNSUPPORTED_MEDIA_TYPE";
        throw erro;
    }

    return mimeReal;
}

// O nome do arquivo é um UUID gerado pela API, então basename descarta qualquer
// resto de caminho e a URL nunca expõe diretório do computador.
function urlPublica(tipo, arquivo) {
    return `${URL_PREFIXO[tipo]}/${path.basename(arquivo.path)}`;
}

async function exigirMidia(client, model, where, mensagem, codigo) {
    const midia = await client[model].findFirst({ where, select: SELECT_MIDIA });
    if (!midia) {
        const erro = new NotFoundError(mensagem);
        erro.code = codigo;
        throw erro;
    }
    return midia;
}

// --- Imagens -------------------------------------------------------------

export async function createImagem(patrimonioId, metadados, arquivo, user) {
    if (!arquivo) throw new BadRequestError("Envie uma imagem no campo arquivo.");

    try {
        const patrimonio = await exigirPatrimonio(prisma, patrimonioId);
        exigirPermissao(patrimonio.status, user);
        await validarConteudo(arquivo, TIPOS_IMAGEM);

        return await prisma.$transaction(async (transaction) => {
            // Desmarcar a principal anterior e marcar a nova na mesma transação
            // evita o estado intermediário com duas principais.
            if (metadados.principal) {
                await transaction.patrimonioImagem.updateMany({
                    where: { patrimonioId, principal: true },
                    data: { principal: false },
                });
            }

            return transaction.patrimonioImagem.create({
                data: { ...metadados, patrimonioId, url: urlPublica("imagem", arquivo) },
            });
        });
    } catch (error) {
        // Se a gravação falhar, o arquivo recém-criado ficaria órfão no disco.
        await apagarArquivoGerenciado(arquivo.path).catch(() => {});
        throw error;
    }
}

export async function updateImagem(patrimonioId, imagemId, metadados, user) {
    const patrimonio = await exigirPatrimonio(prisma, patrimonioId);
    exigirPermissao(patrimonio.status, user);

    return prisma.$transaction(async (transaction) => {
        // O filtro por patrimonioId garante que a mídia pertence ao patrimônio da URL.
        await exigirMidia(transaction, "patrimonioImagem", { id: imagemId, patrimonioId }, "Imagem não encontrada.", "IMAGEM_NOT_FOUND");

        if (metadados.principal === true) {
            await transaction.patrimonioImagem.updateMany({
                where: { patrimonioId, principal: true, id: { not: imagemId } },
                data: { principal: false },
            });
        }

        return transaction.patrimonioImagem.update({ where: { id: imagemId }, data: metadados });
    });
}

export async function deleteImagem(patrimonioId, imagemId, user) {
    const patrimonio = await exigirPatrimonio(prisma, patrimonioId);
    exigirPermissao(patrimonio.status, user);

    const removida = await prisma.$transaction(async (transaction) => {
        const midia = await exigirMidia(transaction, "patrimonioImagem", { id: imagemId, patrimonioId }, "Imagem não encontrada.", "IMAGEM_NOT_FOUND");
        await transaction.patrimonioImagem.delete({ where: { id: imagemId } });
        return midia;
    });

    // O disco fica fora da transação do Prisma. Se a remoção física falhar, o
    // registro já saiu do banco e a operação pode ser repetida.
    return removerArquivo(removida, "imagem");
}

// --- Documentos ----------------------------------------------------------

export async function createDocumento(patrimonioId, metadados, arquivo, user) {
    if (!arquivo) throw new BadRequestError("Envie um documento no campo arquivo.");

    try {
        const patrimonio = await exigirPatrimonio(prisma, patrimonioId);
        exigirPermissao(patrimonio.status, user);
        const mimeReal = await validarConteudo(arquivo, TIPOS_DOCUMENTO);

        return await prisma.patrimonioDocumento.create({
            data: {
                ...metadados,
                patrimonioId,
                url: urlPublica("documento", arquivo),
              
                mimeType: mimeReal,
            },
        });
    } catch (error) {
        await apagarArquivoGerenciado(arquivo.path).catch(() => {});
        throw error;
    }
}

export async function updateDocumento(patrimonioId, documentoId, metadados, user) {
    const patrimonio = await exigirPatrimonio(prisma, patrimonioId);
    exigirPermissao(patrimonio.status, user);

    await exigirMidia(prisma, "patrimonioDocumento", { id: documentoId, patrimonioId }, "Documento não encontrado.", "DOCUMENTO_NOT_FOUND");

    return prisma.patrimonioDocumento.update({ where: { id: documentoId }, data: metadados });
}

export async function deleteDocumento(patrimonioId, documentoId, user) {
    const patrimonio = await exigirPatrimonio(prisma, patrimonioId);
    exigirPermissao(patrimonio.status, user);

    const removido = await prisma.$transaction(async (transaction) => {
        const midia = await exigirMidia(transaction, "patrimonioDocumento", { id: documentoId, patrimonioId }, "Documento não encontrado.", "DOCUMENTO_NOT_FOUND");
        await transaction.patrimonioDocumento.delete({ where: { id: documentoId } });
        return midia;
    });

    return removerArquivo(removido, "documento");
}

// Remove o arquivo gerenciado e devolve um aviso quando a remoção física falha,
// para não informar conclusão completa ao cliente.
async function removerArquivo(midia, rotulo) {
    const caminho = caminhoDoArquivo(midia.url);

    try {
        await apagarArquivoGerenciado(caminho);
        return { ...midia, arquivoRemovido: true };
    } catch (error) {
        console.error(`Falha ao remover o arquivo da mídia (${rotulo}).`, { caminho, code: error.code });
        return { ...midia, arquivoRemovido: false, aviso: "Registro removido, mas o arquivo não pôde ser apagado do disco. Tente novamente." };
    }
}
