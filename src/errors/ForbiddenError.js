import BaseError from "./BaseError.js";

export default class ForbiddenError extends BaseError {
    constructor(message = "Acesso não permitido.", details = []) {
        super(message, 403, details);
    }
}
