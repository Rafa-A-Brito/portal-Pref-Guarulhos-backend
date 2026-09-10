import express from "express";
import cors from "cors";
import env from "./config/env.js";
import routes from "./routes/index.js";
import notFoundHandler from "./middlewares/notFoundHandler.js";
import errorHandler from "./middlewares/errorHandler.js";

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "100kb" }));
app.use("/api", routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
