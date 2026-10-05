import { Router } from "express";
import { login, changePassword } from "../controllers/authController.js";
import validate from "../middlewares/validate.js";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import { loginSchema, changePasswordSchema } from "../schemas/authSchema.js";

const router = Router();

router.post("/login", validate(loginSchema), login);
router.patch("/senha", authenticate, authorize("EDITOR", "ADMIN"), validate(changePasswordSchema), changePassword);

export default router;
