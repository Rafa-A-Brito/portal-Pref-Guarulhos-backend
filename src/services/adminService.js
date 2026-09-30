import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import ConflictError from "../errors/ConflictError.js";
import { hashPassword } from "../utils/password.js";

export async function createAdmin({ nome, email, role, password }) {
    try {
        const user = await prisma.user.create({
            data: {
                name: nome,
                email,
                role,
                passwordHash: await hashPassword(password),
                isActive: true,
            },
            select: { id: true, name: true, email: true, role: true, isActive: true },
        });

        return {
            id: user.id,
            nome: user.name,
            email: user.email,
            role: user.role,
            ativo: user.isActive,
        };
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            const conflict = new ConflictError("Já existe um administrador cadastrado com este e-mail.");
            conflict.code = "ADMIN_ALREADY_EXISTS";
            throw conflict;
        }

        throw error;
    }
}
