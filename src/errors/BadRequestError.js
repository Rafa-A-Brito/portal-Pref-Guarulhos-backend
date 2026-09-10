import BaseError from "./BaseError.js";

export default class BadRequestError extends BaseError {
    constructor(message = "Requisição inválida.", details = []) {
        super(message, 400, details);
    }
}
