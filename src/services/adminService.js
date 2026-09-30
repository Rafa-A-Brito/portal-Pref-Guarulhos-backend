import { randomUUID } from "node:crypto";
import ConflictError from "../errors/ConflictError.js";

// Armazenamento temporário. Substituir estas operações por consultas ao banco.
const adminsByEmail = new Map();

export async function createAdmin({ nome, email, role }) {
    if (adminsByEmail.has(email)) {
        const error = new ConflictError("Já existe um administrador cadastrado com este e-mail.");
        error.code = "ADMIN_ALREADY_EXISTS";
        throw error;
    }

    // A conta permanece inativa até o futuro fluxo de convite e definição de senha.
    const admin = { id: randomUUID(), nome, email, role, ativo: false };
    adminsByEmail.set(email, admin);

    return { ...admin };
}
