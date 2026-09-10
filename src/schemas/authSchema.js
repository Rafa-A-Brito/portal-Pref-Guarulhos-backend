import { z } from "zod";

export const loginSchema = z.strictObject({
    email: z.string().trim().pipe(z.email("Informe um e-mail válido.").max(254))
        .transform((email) => email.toLowerCase()),
    password: z.string().min(1, "Informe a senha.").refine(
        (value) => Buffer.byteLength(value, "utf8") <= 72,
        "A senha deve ter no máximo 72 bytes em UTF-8."
    ),
});
