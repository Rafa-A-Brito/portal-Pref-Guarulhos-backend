-- Classificação opcional: registros existentes permanecem com região NULL.
CREATE TYPE "regiao_patrimonio" AS ENUM (
    'CENTRO', 'VILA_GALVAO', 'TABOAO', 'SAO_JOAO', 'CUMBICA',
    'PIMENTAS', 'BONSUCESSO', 'CABUCU', 'TANQUE_GRANDE', 'CAPELINHA',
    'JAGUARI', 'AEROPORTO', 'PARQUE_ESTADUAL_CANTAREIRA'
);

ALTER TABLE "local" ADD COLUMN "regiao" "regiao_patrimonio";
