import { z } from "zod";

export const createAdminSchema = z.strictObject({
    nome: z.string().trim().min(1, "Informe o nome.").max(100),
    email: z.string().trim().pipe(z.email("Informe um e-mail válido.").max(254))
        .transform((email) => email.toLowerCase()),
    role: z.enum(["ADMIN", "EDITOR"]),
});
