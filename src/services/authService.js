import prisma from "../config/prisma.js";
import UnauthorizedError from "../errors/UnauthorizedError.js";
import BadRequestError from "../errors/BadRequestError.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { generateToken } from "../utils/token.js";

export async function login({ email, password }) {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
        throw new UnauthorizedError("E-mail ou senha incorretos.");
    }

    return {
        token: generateToken(user.id),
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
        },
    };
}

export async function changePassword(userId, { senhaAtual, novaSenha }) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, isActive: true, passwordHash: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedError("Usuário indisponível.");
    if (!(await verifyPassword(senhaAtual, user.passwordHash))) {
        throw new BadRequestError("Senha atual incorreta.");
    }
    if (senhaAtual === novaSenha) {
        throw new BadRequestError("A nova senha deve ser diferente da atual.");
    }

    const result = await prisma.user.updateMany({
        where: { id: userId, isActive: true, passwordHash: user.passwordHash },
        data: { passwordHash: await hashPassword(novaSenha) },
    });
    if (result.count === 0) throw new BadRequestError("Senha atual incorreta ou conta indisponível.");
}
