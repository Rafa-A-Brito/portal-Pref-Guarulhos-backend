import BaseError from "./BaseError.js";

export default class NotFoundError extends BaseError {
    constructor(message = "Recurso não encontrado.", details = []) {
        super(message, 404, details);
    }
}
