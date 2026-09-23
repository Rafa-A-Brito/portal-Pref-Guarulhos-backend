import { Router } from "express";
import { createAdmin } from "../controllers/adminController.js";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import validate from "../middlewares/validate.js";
import { createAdminSchema } from "../schemas/adminSchema.js";

const router = Router();

router.post("/", authenticate, authorize("ADMIN"), validate(createAdminSchema), createAdmin);

export default router;
