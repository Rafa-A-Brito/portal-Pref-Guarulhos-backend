import { Router } from "express";
import { getPatrimonioBySlug, listPatrimonios } from "../controllers/patrimonioController.js";
import { validateParams, validateQuery } from "../middlewares/validate.js";
import { listPatrimoniosQuerySchema, patrimonioSlugParamsSchema } from "../schemas/patrimonioSchema.js";

const router = Router();

router.get("/", validateQuery(listPatrimoniosQuerySchema), listPatrimonios);
router.get("/:slug", validateParams(patrimonioSlugParamsSchema), getPatrimonioBySlug);

export default router;
