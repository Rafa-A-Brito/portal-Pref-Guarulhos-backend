import "dotenv/config";
import env from "./config/env.js";
import app from "./app.js";
import { garantirPastas } from "./config/storage.js";

await garantirPastas();

app.listen(env.PORT, () => {
    console.log(`Portal Cultural de Guarulhos: http://localhost:${env.PORT}/api`);
});
