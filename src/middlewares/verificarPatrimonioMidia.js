import prisma from "../config/prisma.js";
import ForbiddenError from "../errors/ForbiddenError.js";
import NotFoundError from "../errors/NotFoundError.js";

export default function verificarPatrimonioMidia() {
    return async (req, _res, next) => {
        const { id } = req.validatedParams;

        const patrimonio = await prisma.patrimonio.findUnique({
            where: { id },
            select: { id: true, status: true },
        });

        if (!patrimonio) {
            const erro = new NotFoundError("Patrimônio não encontrado.");
            erro.code = "PATRIMONIO_NOT_FOUND";
            throw erro;
        }

        if (req.user?.role !== "ADMIN" && (req.user?.role !== "EDITOR" || patrimonio.status !== "RASCUNHO")) {
            throw new ForbiddenError("Editor pode alterar mídias somente de rascunhos.");
        }

        next();
    };
}
