import BaseError from "./BaseError.js";

export default class ForbiddenError extends BaseError {
    constructor(message = "Você não possui permissão para realizar esta ação.", details = []) {
        super(message, 403, details);
    }
}
