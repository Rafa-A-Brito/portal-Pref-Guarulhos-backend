import { z } from "zod";

export const passwordSchema = z.string().refine(
    (value) => Array.from(value).length >= 12,
    "A senha deve ter pelo menos 12 caracteres."
).refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "A senha deve ter no máximo 72 bytes em UTF-8."
);

export const createAdminSchema = z.strictObject({
    nome: z.string().trim().min(1, "Informe o nome.").max(100),
    email: z.string().trim().pipe(z.email("Informe um e-mail válido.").max(254))
        .transform((email) => email.toLowerCase()),
    role: z.enum(["ADMIN", "EDITOR"]),
    password: passwordSchema,
});
