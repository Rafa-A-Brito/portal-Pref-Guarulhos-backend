import prisma from "../config/prisma.js";
import UnauthorizedError from "../errors/UnauthorizedError.js";
import { verifyPassword } from "../utils/password.js";
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
