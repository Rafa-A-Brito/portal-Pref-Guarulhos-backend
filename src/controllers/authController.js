import { login as loginService, changePassword as changePasswordService } from "../services/authService.js";

export async function login(req, res) {
    const data = await loginService(req.body);
    res.json({ success: true, data });
}

export async function changePassword(req, res) {
    await changePasswordService(req.user.id, req.body);
    res.json({ success: true, message: "Senha alterada com sucesso." });
}
