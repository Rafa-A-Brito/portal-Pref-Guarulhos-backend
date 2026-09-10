import "dotenv/config";
import { z } from "zod";

const result = z.object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3333),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    CORS_ORIGIN: z.url().default("http://localhost:5173"),
}).safeParse(process.env);

if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join("."));
    throw new Error(`Variáveis de ambiente inválidas: ${fields.join(", ")}.`);
}

export default result.data;
