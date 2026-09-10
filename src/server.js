import "dotenv/config";
import env from "./config/env.js";
import app from "./app.js";

app.listen(env.PORT, () => {
    console.log(`Portal Cultural de Guarulhos: http://localhost:${env.PORT}/api`);
});
