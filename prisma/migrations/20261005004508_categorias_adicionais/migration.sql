-- CreateTable
CREATE TABLE "patrimonio_categoria" (
    "patrimonio_id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,

    CONSTRAINT "patrimonio_categoria_pkey" PRIMARY KEY ("patrimonio_id","categoria_id")
);

-- CreateIndex
CREATE INDEX "patrimonio_categoria_categoria_id_idx" ON "patrimonio_categoria"("categoria_id");

-- AddForeignKey
ALTER TABLE "patrimonio_categoria" ADD CONSTRAINT "patrimonio_categoria_patrimonio_id_fkey" FOREIGN KEY ("patrimonio_id") REFERENCES "patrimonio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrimonio_categoria" ADD CONSTRAINT "patrimonio_categoria_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
