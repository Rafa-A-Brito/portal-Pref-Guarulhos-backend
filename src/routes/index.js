import { Router } from "express";

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

export default router;
