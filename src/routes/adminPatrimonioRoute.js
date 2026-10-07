import { Router } from "express";
import { createPatrimonio } from "../controllers/patrimonioController.js";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import validate, { validateParams, validateQuery } from "../middlewares/validate.js";
import { createPatrimonioSchema, adminListPatrimoniosQuerySchema, patrimonioIdParamsSchema, updatePatrimonioSchema, statusPatrimonioSchema } from "../schemas/patrimonioSchema.js";
import { list, detail, update, publish, archive } from "../controllers/adminPatrimonioController.js";

const router = Router();

router.use(authenticate, authorize("ADMIN", "EDITOR"));
router.post("/", validate(createPatrimonioSchema), createPatrimonio);
router.get("/", validateQuery(adminListPatrimoniosQuerySchema), list);
router.get("/:id", validateParams(patrimonioIdParamsSchema), detail);
router.patch("/:id", validateParams(patrimonioIdParamsSchema), validate(updatePatrimonioSchema), update);
router.patch("/:id/publicar", authorize("ADMIN"), validateParams(patrimonioIdParamsSchema), validate(statusPatrimonioSchema), publish);
router.patch("/:id/arquivar", authorize("ADMIN"), validateParams(patrimonioIdParamsSchema), validate(statusPatrimonioSchema), archive);

export default router;
