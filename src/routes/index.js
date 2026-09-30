import { Router } from "express";
import authRoutes from "./authRoute.js";
import adminRoutes from "./adminRoute.js";
import adminPatrimonioRoutes from "./adminPatrimonioRoute.js";
import patrimonioRoutes from "./patrimonioRoute.js";

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
router.use("/admin/patrimonios", adminPatrimonioRoutes);

export default router;
