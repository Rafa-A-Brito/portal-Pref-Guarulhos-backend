import { z } from "zod";

// multipart/form-data sempre entrega texto. Cada campo precisa converter o tipo.
const optionalText = (max, message) => z.string().trim().min(1, message).max(max).optional();


const booleano = z.union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .transform((valor) => valor === true || valor === "true" || valor === "1");

const ordem = z.coerce.number().int("A ordem deve ser um número inteiro.")
    .min(0, "A ordem não pode ser negativa.");

const dataDocumento = z.coerce.date("Informe uma data válida.");


// O strictObject recusa qualquer campo desconhecido, inclusive esses.
export const createImagemSchema = z.strictObject({
    textoAlternativo: z.string().trim().min(1, "Informe o texto alternativo.").max(300),
    titulo: optionalText(200, "Informe um título válido."),
    credito: optionalText(200, "Informe um crédito válido."),
    fonte: optionalText(500, "Informe uma fonte válida."),
    ordem: ordem.optional(),
    principal: booleano.optional(),
});

export const createDocumentoSchema = z.strictObject({
    titulo: z.string().trim().min(1, "Informe o título.").max(200),
    tipo: z.string().trim().min(1, "Informe o tipo.").max(100),
    descricao: z.string().trim().min(1, "Informe uma descrição válida.").optional(),
    fonte: optionalText(500, "Informe uma fonte válida."),
    dataDocumento: dataDocumento.optional(),
});

const nonEmpty = (data) => Object.keys(data).length > 0;

export const updateImagemSchema = createImagemSchema.partial()
    .refine(nonEmpty, "Informe algum campo para atualizar.");

export const updateDocumentoSchema = createDocumentoSchema.partial()
    .refine(nonEmpty, "Informe algum campo para atualizar.");

// Rotas alinhadas assim os dois UUIDs da URL precisam ser validados.
export const imagemParamsSchema = z.strictObject({ id: z.uuid(), imagemId: z.uuid() });

export const documentoParamsSchema = z.strictObject({ id: z.uuid(), documentoId: z.uuid() });


export const arquivoParamsSchema = z.strictObject({
    tipo: z.enum(["imagens", "documentos"]),
    arquivo: z.string().trim().min(1).max(120).regex(/^[0-9a-f-]+\.[a-z0-9]+$/, "Informe um arquivo válido."),
});
