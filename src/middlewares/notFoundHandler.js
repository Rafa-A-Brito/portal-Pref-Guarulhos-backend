import NotFoundError from "../errors/NotFoundError.js";

export default function notFoundHandler(_req, _res, next) {
    next(new NotFoundError("Rota não encontrada."));
}
