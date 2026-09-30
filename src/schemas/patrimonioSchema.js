import { SituacaoPatrimonio } from "@prisma/client";
import { z } from "zod";

const optionalText = (max, message) => z.string().trim().min(1, message).max(max).optional();

const localizacaoSchema = z.strictObject({
    endereco: z.string().trim().min(1, "Informe o endereço.").max(250),
    numero: optionalText(30, "Informe um número válido."),
    complemento: optionalText(150, "Informe um complemento válido."),
    bairro: z.string().trim().min(1, "Informe o bairro.").max(100),
    cidade: z.string().trim().min(1, "Informe a cidade.").max(100).default("Guarulhos"),
    uf: z.string().trim().length(2, "A UF deve conter 2 caracteres.")
        .transform((uf) => uf.toUpperCase()).default("SP"),
    cep: z.string().trim().regex(/^\d{5}-?\d{3}$/, "Informe um CEP válido.")
        .transform((cep) => cep.replace(/^(\d{5})-?(\d{3})$/, "$1-$2")).optional(),
    latitude: z.number().min(-90, "A latitude mínima é -90.").max(90, "A latitude máxima é 90.").optional(),
    longitude: z.number().min(-180, "A longitude mínima é -180.").max(180, "A longitude máxima é 180.").optional(),
}).superRefine((localizacao, context) => {
    const hasLatitude = localizacao.latitude !== undefined;
    const hasLongitude = localizacao.longitude !== undefined;

    if (hasLatitude !== hasLongitude) {
        context.addIssue({
            code: "custom",
            path: hasLatitude ? ["longitude"] : ["latitude"],
            message: "Informe latitude e longitude juntas.",
        });
    }
});

export const createPatrimonioSchema = z.strictObject({
    nome: z.string().trim().min(1, "Informe o nome.").max(200),
    descricao: z.string().trim().min(1, "Informe a descrição."),
    categoriaId: z.uuid("Informe uma categoria válida."),
    historia: z.string().trim().min(1, "Informe uma história válida.").optional(),
    situacao: z.enum(Object.values(SituacaoPatrimonio)).default(SituacaoPatrimonio.NAO_INFORMADO),
    localizacao: localizacaoSchema.optional(),
});
