import jwt from "jsonwebtoken";
import { z } from "zod";
import env from "../config/env.js";
import UnauthorizedError from "../errors/UnauthorizedError.js";

export function generateToken(userId) {
    return jwt.sign({}, env.JWT_SECRET, {
        algorithm: "HS256",
        subject: userId,
        expiresIn: env.JWT_TTL_SECONDS,
    });
}

export function verifyToken(token) {
    let payload;
    try {
        payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            throw new UnauthorizedError("Token inválido ou expirado.");
        }
        throw error;
    }

    if (!payload || typeof payload !== "object" || !z.uuid().safeParse(payload.sub).success || !Number.isInteger(payload.exp)) {
        throw new UnauthorizedError("Token inválido ou expirado.");
    }
    return payload;
}
