-- Transição aditiva: conserva os textos legados e permite registros sem numeração editorial.
ALTER TABLE "patrimonio"
  ALTER COLUMN "descricao" DROP NOT NULL,
  ADD COLUMN "numero_exibicao" INTEGER,
  ADD COLUMN "ordem_exibicao" INTEGER,
  ADD CONSTRAINT "patrimonio_numero_exibicao_check" CHECK ("numero_exibicao" > 0),
  ADD CONSTRAINT "patrimonio_ordem_exibicao_check" CHECK ("ordem_exibicao" >= 0);

CREATE UNIQUE INDEX "patrimonio_numero_exibicao_key" ON "patrimonio"("numero_exibicao");
CREATE UNIQUE INDEX "patrimonio_ordem_exibicao_key" ON "patrimonio"("ordem_exibicao");

CREATE TABLE "patrimonio_secoes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "patrimonio_id" UUID NOT NULL,
  "icone" TEXT,
  "titulo" TEXT NOT NULL,
  "texto" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL,
  CONSTRAINT "patrimonio_secoes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "patrimonio_secoes_ordem_check" CHECK ("ordem" >= 0),
  CONSTRAINT "patrimonio_secoes_patrimonio_id_fkey" FOREIGN KEY ("patrimonio_id") REFERENCES "patrimonio"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "patrimonio_secoes_patrimonio_id_ordem_key" ON "patrimonio_secoes"("patrimonio_id", "ordem");

CREATE TABLE "patrimonio_fatos" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "patrimonio_id" UUID NOT NULL,
  "rotulo" TEXT NOT NULL,
  "valor" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL,
  CONSTRAINT "patrimonio_fatos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "patrimonio_fatos_ordem_check" CHECK ("ordem" >= 0),
  CONSTRAINT "patrimonio_fatos_patrimonio_id_fkey" FOREIGN KEY ("patrimonio_id") REFERENCES "patrimonio"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "patrimonio_fatos_patrimonio_id_ordem_key" ON "patrimonio_fatos"("patrimonio_id", "ordem");

CREATE TABLE "patrimonio_ligacoes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "patrimonio_origem_id" UUID NOT NULL,
  "patrimonio_destino_id" UUID NOT NULL,
  "texto" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL,
  CONSTRAINT "patrimonio_ligacoes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "patrimonio_ligacoes_ordem_check" CHECK ("ordem" >= 0),
  CONSTRAINT "patrimonio_ligacoes_distintos_check" CHECK ("patrimonio_origem_id" <> "patrimonio_destino_id"),
  CONSTRAINT "patrimonio_ligacoes_origem_fkey" FOREIGN KEY ("patrimonio_origem_id") REFERENCES "patrimonio"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "patrimonio_ligacoes_destino_fkey" FOREIGN KEY ("patrimonio_destino_id") REFERENCES "patrimonio"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "patrimonio_ligacoes_origem_destino_key" ON "patrimonio_ligacoes"("patrimonio_origem_id", "patrimonio_destino_id");
CREATE UNIQUE INDEX "patrimonio_ligacoes_origem_ordem_key" ON "patrimonio_ligacoes"("patrimonio_origem_id", "ordem");
CREATE INDEX "patrimonio_ligacoes_destino_idx" ON "patrimonio_ligacoes"("patrimonio_destino_id");
