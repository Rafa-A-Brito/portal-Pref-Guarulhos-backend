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

const position = z.number().int().min(0).max(2147483647);
const orderedArray = (schema) => z.array(schema).superRefine((items, context) => {
    const orders = items.map((item) => item.ordem).sort((a, b) => a - b);
    if (orders.some((order, index) => order !== index)) context.addIssue({ code: "custom", message: "As ordens devem ser únicas e contíguas a partir de zero." });
}).optional();
const sectionSchema = z.strictObject({
    icone: z.string().trim().min(1).nullable().optional(),
    titulo: z.string().trim().min(1), texto: z.string().trim().min(1), ordem: position,
});
const factSchema = z.strictObject({ rotulo: z.string().trim().min(1), valor: z.string().trim().min(1), ordem: position });
const linkSchema = z.strictObject({ patrimonioDestinoId: z.uuid(), texto: z.string().trim().min(1), ordem: position });

export const createPatrimonioSchema = z.strictObject({
    nome: z.string().trim().min(1, "Informe o nome.").max(200),
    descricao: z.string().trim().min(1, "Informe a descrição.").nullable().optional(),
    numeroExibicao: z.number().int().min(1).max(2147483647).nullable().optional(),
    ordemExibicao: position.nullable().optional(),
    descricaoResumida: z.string().trim().min(1, "Informe a descrição resumida.").max(500),
    categoriaId: z.uuid("Informe uma categoria válida."),
    historia: z.string().trim().min(1, "Informe uma história válida.").nullable().optional(),
    importanciaCultural: z.string().trim().min(1, "Informe uma importância cultural válida.").nullable().optional(),
    situacao: z.enum(Object.values(SituacaoPatrimonio)).default(SituacaoPatrimonio.NAO_INFORMADO),
    localizacao: localizacaoSchema.optional(),
    secoes: orderedArray(sectionSchema),
    fatos: orderedArray(factSchema),
    ligacoes: orderedArray(linkSchema),
}).superRefine((data, context) => {
    const ids = (data.ligacoes ?? []).map((l) => l.patrimonioDestinoId);
    if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["ligacoes"], message: "O destino não pode se repetir." });
});

const queryText = (max, message) => z.string().trim().min(1, message).max(max).optional();

export const listPatrimoniosQuerySchema = z.strictObject({
    busca: queryText(200, "Informe um termo de busca válido."),
    categoria: queryText(100, "Informe uma categoria válida."),
    situacao: z.enum(Object.values(SituacaoPatrimonio)).optional(),
    bairro: queryText(100, "Informe um bairro válido."),
    pagina: z.coerce.number().int().min(1).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
});

export const patrimonioSlugParamsSchema = z.strictObject({
    slug: z.string().trim().min(1).max(220)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Informe um slug válido."),
});
