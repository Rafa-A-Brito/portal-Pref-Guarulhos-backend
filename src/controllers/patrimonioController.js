import { createPatrimonio as createPatrimonioService } from "../services/patrimonioService.js";

export async function createPatrimonio(req, res) {
    const patrimonio = await createPatrimonioService(req.body, req.user.id);
    res.status(201).json({ success: true, data: patrimonio });
}
