import { Router } from "express";
import { createPatrimonio } from "../controllers/patrimonioController.js";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import validate from "../middlewares/validate.js";
import { createPatrimonioSchema } from "../schemas/patrimonioSchema.js";

const router = Router();

router.post("/", authenticate, authorize("ADMIN", "EDITOR"), validate(createPatrimonioSchema), createPatrimonio);

export default router;
