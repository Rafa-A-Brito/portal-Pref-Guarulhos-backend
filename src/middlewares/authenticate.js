import prisma from "../config/prisma.js";
import UnauthorizedError from "../errors/UnauthorizedError.js";
import { verifyToken } from "../utils/token.js";

export default async function authenticate(req, _res, next) {
    const authorization = req.get("authorization");
    const match = authorization?.match(/^Bearer ([^\s]+)$/i);
    if (!match) throw new UnauthorizedError("Informe Authorization: Bearer TOKEN.");

    const payload = verifyToken(match[1]);
    // A consulta fica fora do tratamento de erros do JWT.
    const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
        throw new UnauthorizedError("Usuário indisponível.");
    }

    req.user = user;
    next();
}
