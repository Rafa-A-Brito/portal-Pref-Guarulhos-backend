import { apagarArquivoGerenciado } from "../utils/arquivos.js";

export default function validate(schema) {
    return (req, _res, next) => {
        req.body = schema.parse(req.body);
        next();
    };
}

// Usado depois do upload em disco: se o corpo não passar na validação, o arquivo
// que o multer já gravou ficaria órfão. Apaga antes de propagar o erro.
export function validateComLimpezaDeArquivo(schema) {
    return async (req, _res, next) => {
        try {
            req.body = schema.parse(req.body);
            next();
        } catch (error) {
            await apagarArquivoGerenciado(req.file?.path).catch(() => {});
            next(error);
        }
    };
}

export function validateQuery(schema) {
    return (req, _res, next) => {
        req.validatedQuery = schema.parse(req.query);
        next();
    };
}

export function validateParams(schema) {
    return (req, _res, next) => {
        req.validatedParams = schema.parse(req.params);
        next();
    };
}
