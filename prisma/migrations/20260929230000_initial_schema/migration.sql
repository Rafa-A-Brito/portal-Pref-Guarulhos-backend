-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "role" AS ENUM ('EDITOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "situacao_patrimonio" AS ENUM ('PRESERVADO', 'EM_RESTAURACAO', 'NECESSITA_RESTAURACAO', 'EM_RUINAS', 'NAO_INFORMADO');

-- CreateEnum
CREATE TYPE "status_publicacao" AS ENUM ('RASCUNHO', 'PUBLICADO', 'ARQUIVADO');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "role" NOT NULL DEFAULT 'EDITOR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "descricao" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrimonio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(220) NOT NULL,
    "descricao" TEXT NOT NULL,
    "descricao_resumida" VARCHAR(500) NOT NULL,
    "historia" TEXT,
    "importancia_cultural" TEXT,
    "situacao" "situacao_patrimonio" NOT NULL DEFAULT 'NAO_INFORMADO',
    "status" "status_publicacao" NOT NULL DEFAULT 'RASCUNHO',
    "categoria_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "arquivado_em" TIMESTAMPTZ(3),

    CONSTRAINT "patrimonio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patrimonio_id" UUID NOT NULL,
    "endereco" VARCHAR(250) NOT NULL,
    "numero" VARCHAR(30),
    "complemento" VARCHAR(150),
    "bairro" VARCHAR(100) NOT NULL,
    "cidade" VARCHAR(100) NOT NULL DEFAULT 'Guarulhos',
    "uf" CHAR(2) NOT NULL DEFAULT 'SP',
    "cep" VARCHAR(9),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),

    CONSTRAINT "local_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "local_latitude_check" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
    CONSTRAINT "local_longitude_check" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
);

-- CreateTable
CREATE TABLE "patrimonio_imagens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patrimonio_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "titulo" VARCHAR(200),
    "alt" VARCHAR(300) NOT NULL,
    "credito" VARCHAR(200),
    "fonte" VARCHAR(500),
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "is_capa" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patrimonio_imagens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "patrimonio_imagens_ordem_check" CHECK ("ordem" >= 0)
);

-- CreateTable
CREATE TABLE "patrimonio_documentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patrimonio_id" UUID NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "descricao" TEXT,
    "url" TEXT NOT NULL,
    "tipo" VARCHAR(100) NOT NULL,
    "fonte" VARCHAR(500),
    "data_documento" DATE,
    "mime_type" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patrimonio_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rota" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(220) NOT NULL,
    "descricao" TEXT,
    "status" "status_publicacao" NOT NULL DEFAULT 'RASCUNHO',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rota_patrimonio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rota_id" UUID NOT NULL,
    "patrimonio_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "rota_patrimonio_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rota_patrimonio_ordem_check" CHECK ("ordem" >= 0)
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity" VARCHAR(100) NOT NULL,
    "entity_id" UUID NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_nome_key" ON "categoria"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_slug_key" ON "categoria"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "patrimonio_slug_key" ON "patrimonio"("slug");

-- CreateIndex
CREATE INDEX "patrimonio_categoria_id_status_idx" ON "patrimonio"("categoria_id", "status");

-- CreateIndex
CREATE INDEX "patrimonio_created_by_idx" ON "patrimonio"("created_by");

-- CreateIndex
CREATE INDEX "patrimonio_updated_by_idx" ON "patrimonio"("updated_by");

-- CreateIndex
CREATE INDEX "patrimonio_status_idx" ON "patrimonio"("status");

-- CreateIndex
CREATE UNIQUE INDEX "local_patrimonio_id_key" ON "local"("patrimonio_id");

-- CreateIndex
CREATE INDEX "patrimonio_imagens_patrimonio_id_ordem_idx" ON "patrimonio_imagens"("patrimonio_id", "ordem");

-- PostgreSQL partial unique index: one cover image per patrimonio.
CREATE UNIQUE INDEX "patrimonio_imagens_one_capa_per_patrimonio_idx"
ON "patrimonio_imagens"("patrimonio_id")
WHERE "is_capa" = true;

-- CreateIndex
CREATE INDEX "patrimonio_documentos_patrimonio_id_idx" ON "patrimonio_documentos"("patrimonio_id");

-- CreateIndex
CREATE UNIQUE INDEX "rota_slug_key" ON "rota"("slug");

-- CreateIndex
CREATE INDEX "rota_status_idx" ON "rota"("status");

-- CreateIndex
CREATE INDEX "rota_patrimonio_patrimonio_id_idx" ON "rota_patrimonio"("patrimonio_id");

-- CreateIndex
CREATE UNIQUE INDEX "rota_patrimonio_rota_id_patrimonio_id_key" ON "rota_patrimonio"("rota_id", "patrimonio_id");

-- CreateIndex
CREATE UNIQUE INDEX "rota_patrimonio_rota_id_ordem_key" ON "rota_patrimonio"("rota_id", "ordem");

-- CreateIndex
CREATE INDEX "audit_log_user_id_idx" ON "audit_log"("user_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "patrimonio" ADD CONSTRAINT "patrimonio_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrimonio" ADD CONSTRAINT "patrimonio_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrimonio" ADD CONSTRAINT "patrimonio_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local" ADD CONSTRAINT "local_patrimonio_id_fkey" FOREIGN KEY ("patrimonio_id") REFERENCES "patrimonio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrimonio_imagens" ADD CONSTRAINT "patrimonio_imagens_patrimonio_id_fkey" FOREIGN KEY ("patrimonio_id") REFERENCES "patrimonio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrimonio_documentos" ADD CONSTRAINT "patrimonio_documentos_patrimonio_id_fkey" FOREIGN KEY ("patrimonio_id") REFERENCES "patrimonio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rota_patrimonio" ADD CONSTRAINT "rota_patrimonio_rota_id_fkey" FOREIGN KEY ("rota_id") REFERENCES "rota"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rota_patrimonio" ADD CONSTRAINT "rota_patrimonio_patrimonio_id_fkey" FOREIGN KEY ("patrimonio_id") REFERENCES "patrimonio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
