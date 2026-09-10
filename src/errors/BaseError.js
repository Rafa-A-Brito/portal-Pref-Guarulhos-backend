export default class BaseError extends Error {
    constructor(message = "Erro interno do servidor.", statusCode = 500, details = []) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.details = details;
    }
}
