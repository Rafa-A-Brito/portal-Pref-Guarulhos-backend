import ForbiddenError from "../errors/ForbiddenError.js";

export default function authorize(...roles) {
    return (req, _res, next) => {
        if (!req.user || !roles.includes(req.user.role)) throw new ForbiddenError();
        next();
    };
}
