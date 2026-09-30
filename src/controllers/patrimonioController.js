import {
    createPatrimonio as createPatrimonioService,
    getPatrimonioBySlug as getPatrimonioBySlugService,
    listPatrimonios as listPatrimoniosService,
} from "../services/patrimonioService.js";

export async function listPatrimonios(req, res) {
    const resultado = await listPatrimoniosService(req.validatedQuery);
    res.json({ success: true, data: resultado });
}

export async function getPatrimonioBySlug(req, res) {
    const patrimonio = await getPatrimonioBySlugService(req.validatedParams.slug);
    res.json({ success: true, data: patrimonio });
}

export async function createPatrimonio(req, res) {
    const patrimonio = await createPatrimonioService(req.body, req.user.id);
    res.status(201).json({ success: true, data: patrimonio });
}
