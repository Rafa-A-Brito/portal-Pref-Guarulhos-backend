import { createAdmin as createAdminService } from "../services/adminService.js";

export async function createAdmin(req, res) {
    const admin = await createAdminService(req.body);
    res.status(201).json({ success: true, data: admin });
}
