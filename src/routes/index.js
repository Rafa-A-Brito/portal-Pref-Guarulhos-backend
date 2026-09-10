import { Router } from "express";
import authRoutes from "./authRoute.js";

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

export default router;
