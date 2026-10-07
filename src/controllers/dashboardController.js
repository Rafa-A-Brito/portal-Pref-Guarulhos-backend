import { getDashboard as getDashboardService } from "../services/dashboardService.js";

export async function getDashboard(_req, res) {
    const resultado = await getDashboardService();
    res.json({ success: true, data: resultado });
}
