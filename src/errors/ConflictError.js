import BaseError from "./BaseError.js";

export default class ConflictError extends BaseError {
    constructor(message = "Este valor já está em uso.", details = []) {
        super(message, 409, details);
    }
}
