#!/usr/bin/env node

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const rows = await prisma.$queryRaw`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
`
const tables = rows.map((r) => `"${r.tablename}"`).join(', ')

if (tables) {
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`)
  console.log(`Reset e2e database: truncated ${rows.length} table(s).`)
}

await prisma.$disconnect()
