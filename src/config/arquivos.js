import { fileURLToPath } from "node:url";

export const PATRIMONIOS_IMAGE_DIR = fileURLToPath(new URL("../../public/patrimonios/", import.meta.url));
export const PATRIMONIOS_IMAGE_ROUTE = "/arquivos/patrimonios";
