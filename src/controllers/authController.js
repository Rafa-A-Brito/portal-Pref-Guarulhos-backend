import { login as loginService } from "../services/authService.js";

export async function login(req, res) {
    const data = await loginService(req.body);
    res.json({ success: true, data });
}
