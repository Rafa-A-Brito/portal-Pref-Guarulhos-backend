import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import env from "./env.js";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
// Criar o cliente não executa consultas nem exige que o PostgreSQL esteja disponível.
const prisma = new PrismaClient({ adapter });

export default prisma;
