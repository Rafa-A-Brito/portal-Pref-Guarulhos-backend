import prisma from "../config/prisma.js";
import { verifyToken } from "../utils/token.js";


export default async function authenticateOpcional(req, _res, next) {
    const match = req.get("authorization")?.match(/^Bearer ([^\s]+)$/i);
    if (!match) return next();

    try {
        const payload = verifyToken(match[1]);
        const user = await prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, role: true, isActive: true },
        });

        if (user?.isActive) req.user = user;
    } catch {
        // Token inválido ou expirado, segue como visitante e o controller decide.
    }

    next();
}
