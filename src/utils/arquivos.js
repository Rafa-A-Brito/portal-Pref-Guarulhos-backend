import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { UPLOAD_ROOT } from "../config/storage.js";

export const TIPOS_IMAGEM = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
};

export const TIPOS_DOCUMENTO = {
    "application/pdf": ".pdf",
};

export const MIME_POR_EXTENSAO = {
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
};

export function nomeArquivoUnico(extensao) {
    return `${randomUUID()}${extensao}`;
}

// Confere os bytes iniciais para ver se não é um conteúdo malicioso
export function detectarMimeReal(cabecalho) {
    const b = cabecalho;
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
    if (b.length >= 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
    if (b.length >= 5 && b.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
    return null;
}


export async function lerCabecalho(caminho, bytes = 12) {
    const arquivo = await fs.open(caminho, "r");
    try {
        const buffer = Buffer.alloc(bytes);
        const { bytesRead } = await arquivo.read(buffer, 0, bytes, 0);
        return buffer.subarray(0, bytesRead);
    } finally {
        await arquivo.close();
    }
}

// Apaga somente o que a API gerencia, dentro de UPLOAD_ROOT
export async function apagarArquivoGerenciado(caminho) {
    if (!caminho) return false;
    const absoluto = path.resolve(caminho);
    const relativo = path.relative(UPLOAD_ROOT, absoluto);
    if (!relativo || relativo.startsWith("..") || path.isAbsolute(relativo)) return false;

    try {
        await fs.unlink(absoluto);
        return true;
    } catch (error) {
    
        if (error.code === "ENOENT") return false;
        throw error;
    }
}

// A rota pública só serve imagens/documentos por nome, nunca esta pasta.
export const QUARENTENA_ROOT = path.join(UPLOAD_ROOT, ".quarentena");

function dentroDaPasta(pasta, caminho) {
    const relativo = path.relative(pasta, path.resolve(caminho));
    return relativo && !relativo.startsWith("..") && !path.isAbsolute(relativo);
}

export function registrarPendenciaArquivo(acao, contexto, error) {
    console.error("Pendência de arquivo de mídia; requer recuperação operacional.", {
        acao, ...contexto, code: error.code, mensagem: error.message,
    });
}

// Falhas secundárias de limpeza não substituem o erro que motivou a limpeza.
export async function limparUploadAposFalha(caminho, contexto = {}) {
    try {
        await apagarArquivoGerenciado(caminho);
    } catch (error) {
        registrarPendenciaArquivo("limpar_upload", { ...contexto, caminhoOriginal: caminho }, error);
    }
}

export async function moverParaQuarentena(caminho) {
    if (!caminho) return null;
    const original = path.resolve(caminho);
    if (!dentroDaPasta(UPLOAD_ROOT, original) || dentroDaPasta(QUARENTENA_ROOT, original)) {
        throw Object.assign(new Error("Caminho de mídia fora da pasta gerenciada."), { code: "INVALID_MEDIA_PATH" });
    }
    await fs.mkdir(QUARENTENA_ROOT, { recursive: true, mode: 0o700 });
    const quarentena = path.join(QUARENTENA_ROOT, `${randomUUID()}-${path.basename(original)}`);
    try {
        await fs.rename(original, quarentena);
        return { original, quarentena };
    } catch (error) {
        if (error.code === "ENOENT") {
            // ENOENT também pode indicar destino indisponível; só é permitido
            // prosseguir quando o arquivo original está realmente ausente.
            try { await fs.stat(original); }
            catch (statError) {
                if (statError.code === "ENOENT") return null;
                throw statError;
            }
        }
        throw error;
    }
}

export async function restaurarDaQuarentena({ original, quarentena }) {
    if (!dentroDaPasta(UPLOAD_ROOT, original) || dentroDaPasta(QUARENTENA_ROOT, original) ||
        !dentroDaPasta(QUARENTENA_ROOT, quarentena)) {
        throw Object.assign(new Error("Caminho de restauração inválido."), { code: "INVALID_MEDIA_PATH" });
    }
    // Evita sobrescrever um arquivo que tenha reaparecido no caminho original.
    // copyFile com EXCL funciona também no Windows; só apaga a cópia privada após restaurar.
    await fs.copyFile(quarentena, original, fs.constants.COPYFILE_EXCL);
    await fs.unlink(quarentena);
}
