import { Router } from "express";
import { createPatrimonio } from "../controllers/patrimonioController.js";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import validate, { validateComLimpezaDeArquivo, validateParams, validateQuery } from "../middlewares/validate.js";
import { createPatrimonioSchema, adminListPatrimoniosQuerySchema, patrimonioIdParamsSchema, updatePatrimonioSchema, statusPatrimonioSchema } from "../schemas/patrimonioSchema.js";
import { list, detail, update, publish, archive } from "../controllers/adminPatrimonioController.js";
import * as midia from "../controllers/midiaController.js";
import uploadArquivo from "../middlewares/upload.js";
import verificarPatrimonioMidia from "../middlewares/verificarPatrimonioMidia.js";
import { createDocumentoSchema, createImagemSchema, documentoParamsSchema, imagemParamsSchema, updateDocumentoSchema, updateImagemSchema } from "../schemas/midiaSchema.js";

const router = Router();

router.use(authenticate, authorize("ADMIN", "EDITOR"));
router.post("/", validate(createPatrimonioSchema), createPatrimonio);
router.get("/", validateQuery(adminListPatrimoniosQuerySchema), list);
router.get("/:id", validateParams(patrimonioIdParamsSchema), detail);
router.patch("/:id", validateParams(patrimonioIdParamsSchema), validate(updatePatrimonioSchema), update);
router.patch("/:id/publicar", authorize("ADMIN"), validateParams(patrimonioIdParamsSchema), validate(statusPatrimonioSchema), publish);
router.patch("/:id/arquivar", authorize("ADMIN"), validateParams(patrimonioIdParamsSchema), validate(statusPatrimonioSchema), archive);

// Imagens. A ordem dos middlewares importa: o UUID e a permissão sobre o
// patrimônio são recusados antes de qualquer gravação em disco, os metadados só
// existem depois que o multer lê o corpo, e um metadata inválido apaga o arquivo.
router.post("/:id/imagens", validateParams(patrimonioIdParamsSchema), verificarPatrimonioMidia(), uploadArquivo("imagem"), validateComLimpezaDeArquivo(createImagemSchema), midia.createImagem);
router.patch("/:id/imagens/:imagemId", validateParams(imagemParamsSchema), validate(updateImagemSchema), midia.updateImagem);
router.delete("/:id/imagens/:imagemId", validateParams(imagemParamsSchema), midia.deleteImagem);

// Documentos.
router.post("/:id/documentos", validateParams(patrimonioIdParamsSchema), verificarPatrimonioMidia(), uploadArquivo("documento"), validateComLimpezaDeArquivo(createDocumentoSchema), midia.createDocumento);
router.patch("/:id/documentos/:documentoId", validateParams(documentoParamsSchema), validate(updateDocumentoSchema), midia.updateDocumento);
router.delete("/:id/documentos/:documentoId", validateParams(documentoParamsSchema), midia.deleteDocumento);

export default router;
