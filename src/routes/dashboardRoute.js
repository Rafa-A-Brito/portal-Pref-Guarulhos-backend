import { Router } from "express";
import { getDashboard } from "../controllers/dashboardController.js";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";

const router = Router();
router.get("/", authenticate, authorize("ADMIN", "EDITOR"), getDashboard);

export default router;
