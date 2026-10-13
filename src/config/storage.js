import { mkdir } from "node:fs/promises";
import path from "node:path";
import env from "./env.js";


export const UPLOAD_ROOT = path.resolve(env.UPLOAD_ROOT);


export const PASTAS = {
    imagem: path.join(UPLOAD_ROOT, "imagens"),
    documento: path.join(UPLOAD_ROOT, "documentos"),
};

export const URL_PREFIXO = {
    imagem: "/api/uploads/imagens",
    documento: "/api/uploads/documentos",
};

export const LIMITES = {
    imagem: env.UPLOAD_MAX_IMAGE_BYTES,
    documento: env.UPLOAD_MAX_DOCUMENT_BYTES,
};

export async function garantirPastas() {
    await Promise.all(Object.values(PASTAS).map((pasta) => mkdir(pasta, { recursive: true })));
}
