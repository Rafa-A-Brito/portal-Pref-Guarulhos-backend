import * as service from "../services/midiaService.js";


export async function createImagem(req, res) {
    const imagem = await service.createImagem(req.validatedParams.id, req.body, req.file, req.user);
    res.status(201).json({ success: true, data: imagem });
}

export async function updateImagem(req, res) {
    const imagem = await service.updateImagem(req.validatedParams.id, req.validatedParams.imagemId, req.body, req.user);
    res.json({ success: true, data: imagem });
}

export async function deleteImagem(req, res) {
    const imagem = await service.deleteImagem(req.validatedParams.id, req.validatedParams.imagemId, req.user);
    res.json({ success: true, data: imagem, ...(imagem.aviso && { message: imagem.aviso }) });
}

export async function createDocumento(req, res) {
    const documento = await service.createDocumento(req.validatedParams.id, req.body, req.file, req.user);
    res.status(201).json({ success: true, data: documento });
}

export async function updateDocumento(req, res) {
    const documento = await service.updateDocumento(req.validatedParams.id, req.validatedParams.documentoId, req.body, req.user);
    res.json({ success: true, data: documento });
}

export async function deleteDocumento(req, res) {
    const documento = await service.deleteDocumento(req.validatedParams.id, req.validatedParams.documentoId, req.user);
    res.json({ success: true, data: documento, ...(documento.aviso && { message: documento.aviso }) });
}
