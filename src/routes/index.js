import { Router } from "express";
import authRoutes from "./authRoute.js";
import adminRoutes from "./adminRoute.js";
import adminPatrimonioRoutes from "./adminPatrimonioRoute.js";
<<<<<<< HEAD
=======
import dashboardRoutes from "./dashboardRoute.js";
>>>>>>> 8d9ed379cf2a1845294ead092f79225af2182b2e
import patrimonioRoutes from "./patrimonioRoute.js";
import { servirArquivo } from "../controllers/midiaPublicaController.js";
import authenticateOpcional from "../middlewares/authenticateOpcional.js";
import { validateParams } from "../middlewares/validate.js";
import { arquivoParamsSchema } from "../schemas/midiaSchema.js";
<<<<<<< HEAD
import dashboardRoutes from "./dashboardRoute.js";
=======
>>>>>>> 8d9ed379cf2a1845294ead092f79225af2182b2e

const router = Router();

router.get("/", (_req, res) => {
    res.json({
        success: true,
        data: { name: "Portal Cultural de Guarulhos API", version: "1.0.0" },
    });
});

router.get("/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok" } });
});

router.use("/auth", authRoutes);
router.use("/admins", adminRoutes);
router.use("/patrimonios", patrimonioRoutes);
router.use("/admin/dashboard", dashboardRoutes);
router.use("/admin/patrimonios", adminPatrimonioRoutes);

// Mídias são entregues por rota própria, com checagem do status do patrimônio,
// em vez de expor a pasta uploads inteira com express.static.
router.get("/uploads/:tipo/:arquivo", authenticateOpcional, validateParams(arquivoParamsSchema), servirArquivo);

export default router;
