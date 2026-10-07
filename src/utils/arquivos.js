import { randomUUID } from "node:crypto";
import { open, unlink } from "node:fs/promises";
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
    const arquivo = await open(caminho, "r");
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
        await unlink(absoluto);
        return true;
    } catch (error) {
    
        if (error.code === "ENOENT") return false;
        throw error;
    }
}