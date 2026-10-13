import path from "node:path";
import prisma from "../config/prisma.js";
import { PASTAS, URL_PREFIXO } from "../config/storage.js";
import BadRequestError from "../errors/BadRequestError.js";
import BaseError from "../errors/BaseError.js";
import ForbiddenError from "../errors/ForbiddenError.js";
import NotFoundError from "../errors/NotFoundError.js";
import { TIPOS_DOCUMENTO, TIPOS_IMAGEM, apagarArquivoGerenciado, detectarMimeReal, lerCabecalho,
    limparUploadAposFalha, moverParaQuarentena, restaurarDaQuarentena, registrarPendenciaArquivo } from "../utils/arquivos.js";

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
            const nome = url.slice(prefixo.length + 1);
            if (!nome || nome === "." || nome === ".." || nome.includes("/") || nome.includes("\\")) return null;
            return path.join(PASTAS[tipo], nome);
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
        await limparUploadAposFalha(arquivo.path, { origem: "criar_imagem", patrimonioId });
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

    const imagem = await exigirMidia(prisma, "patrimonioImagem", { id: imagemId, patrimonioId }, "Imagem não encontrada.", "IMAGEM_NOT_FOUND");

    const arquivoRemovido = await excluirMidiaComQuarentena(imagem, "patrimonioImagem");

    return { ...imagem, arquivoRemovido };
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
        await limparUploadAposFalha(arquivo.path, { origem: "criar_documento", patrimonioId });
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

    const documento = await exigirMidia(prisma, "patrimonioDocumento", { id: documentoId, patrimonioId }, "Documento não encontrado.", "DOCUMENTO_NOT_FOUND");

    const arquivoRemovido = await excluirMidiaComQuarentena(documento, "patrimonioDocumento");

    return { ...documento, arquivoRemovido };
}

// Disco e banco não são atômicos. Falhas posteriores ao DELETE exigem
// recuperação pelos caminhos/IDs registrados, pois o registro já não existe.
async function excluirMidiaComQuarentena(midia, model) {
    const caminho = caminhoDoArquivo(midia.url);
    const contexto = { model, midiaId: midia.id, patrimonioId: midia.patrimonioId, url: midia.url, caminhoOriginal: caminho };
    let arquivo;
    try {
        arquivo = await moverParaQuarentena(caminho);
    } catch (error) {
        registrarPendenciaArquivo("mover_quarentena", { ...contexto, registroExcluido: false }, error);
        const erro = new BaseError("Não foi possível preparar a exclusão do arquivo da mídia.", 500);
        erro.code = "ARQUIVO_NAO_REMOVIDO";
        throw erro;
    }

    try {
        await prisma[model].delete({ where: { id: midia.id } });
    } catch (error) {
        if (arquivo) {
            try {
                await restaurarDaQuarentena(arquivo);
            } catch (restauracaoError) {
                registrarPendenciaArquivo("restaurar_quarentena", { ...contexto, caminhoQuarentena: arquivo.quarentena, registroExcluido: false }, restauracaoError);
            }
        }
        throw error;
    }

    if (arquivo) {
        try {
            await apagarArquivoGerenciado(arquivo.quarentena);
        } catch (error) {
            registrarPendenciaArquivo("limpar_quarentena", { ...contexto, caminhoQuarentena: arquivo.quarentena, registroExcluido: true }, error);
            return false;
        }
    }
    // Arquivo ausente ou URL externa não impede a exclusão do registro.
    return true;
}
