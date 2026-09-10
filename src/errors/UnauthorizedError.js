import BaseError from "./BaseError.js";

export default class UnauthorizedError extends BaseError {
    constructor(message = "Autenticação necessária.", details = []) {
        super(message, 401, details);
    }
}
