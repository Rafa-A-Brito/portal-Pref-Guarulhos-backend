import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import BaseError from "../errors/BaseError.js";
import BadRequestError from "../errors/BadRequestError.js";
import ConflictError from "../errors/ConflictError.js";
import NotFoundError from "../errors/NotFoundError.js";

export default function errorHandler(error, _req, res, next) {
    if (res.headersSent) return next(error);

    if (error instanceof ZodError) {
        error = new BadRequestError("Dados inválidos.", error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
        })));
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
            error = new ConflictError("Já existe um registro com os dados únicos informados.");
        } else if (error.code === "P2025") {
            error = new NotFoundError();
        }
    } else if (error?.type === "entity.parse.failed") {
        error = new BadRequestError("JSON inválido.");
    } else if (error?.type === "entity.too.large") {
        error = new BaseError("Corpo da requisição muito grande.", 413);
    }

    if (!(error instanceof BaseError)) {
        console.error("Falha interna na API.", { name: error?.name, code: error?.code });
        error = new BaseError();
    }

    res.status(error.statusCode).json({
        success: false,
        message: error.message,
        details: error.details,
    });
}
