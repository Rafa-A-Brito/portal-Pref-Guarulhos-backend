import multer from "multer";
import BaseError from "../errors/BaseError.js";
import BadRequestError from "../errors/BadRequestError.js";
import { LIMITES, PASTAS } from "../config/storage.js";
import { TIPOS_DOCUMENTO, TIPOS_IMAGEM, nomeArquivoUnico } from "../utils/arquivos.js";


function extensaoDe(tiposPermitidos, mimetype) {
    return tiposPermitidos[mimetype];
}

// tipos aceitos.
export default function uploadArquivo(tipo) {
    const tiposPermitidos = tipo === "imagem" ? TIPOS_IMAGEM : TIPOS_DOCUMENTO;

    const middleware = multer({
        storage: multer.diskStorage({
            destination: (_req, _file, cb) => cb(null, PASTAS[tipo]),
            filename: (_req, file, cb) => cb(null, nomeArquivoUnico(extensaoDe(tiposPermitidos, file.mimetype))),
        }),
        limits: { fileSize: LIMITES[tipo], files: 1 },
        fileFilter: (_req, file, cb) => {
        
            if (!extensaoDe(tiposPermitidos, file.mimetype)) {
                const erro = new BaseError(`Formato não suportado. Envie ${Object.keys(tiposPermitidos).join(", ")}.`, 415);
                erro.code = "UNSUPPORTED_MEDIA_TYPE";
                return cb(erro);
            }
            cb(null, true);
        },
    }).single("arquivo");

  
    return (req, res, next) => {
        middleware(req, res, (error) => {
            if (!error) return next();

            if (error instanceof multer.MulterError) {
                if (error.code === "LIMIT_FILE_SIZE") {
                    const erro = new BaseError("Arquivo excede o tamanho máximo permitido.", 413);
                    erro.code = "FILE_TOO_LARGE";
                    return next(erro);
                }
                if (error.code === "LIMIT_UNEXPECTED_FILE") {
                    return next(new BadRequestError("Envie um arquivo no campo arquivo."));
                }
                return next(new BadRequestError("Upload inválido."));
            }

            next(error);
        });
    };
}
