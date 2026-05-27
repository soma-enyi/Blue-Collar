import type { Request, Response } from 'express'
import { paginate } from '../utils/paginate.js'
import { db } from '../db.js'
import { restoreWorker } from '../services/worker.service.js'

export async function listWorkers(req: Request, res: Response) {
  const { page = '1', limit = '20' } = req.query
  const { data, meta } = await paginate({
    model: 'worker',
    where: { deletedAt: null },
    include: { category: true, curator: true },
    page: Number(page),
    limit: Number(limit),
  })
  return res.json({ data, meta, status: 'success', code: 200 })
}

export async function listUsers(req: Request, res: Response) {
  const { page = '1', limit = '20' } = req.query
  const { data, meta } = await paginate({
    model: 'user',
    where: { deletedAt: null },
    page: Number(page),
    limit: Number(limit),
  })
  return res.json({ data, meta, status: 'success', code: 200 })
}

export async function restoreWorkerHandler(req: Request, res: Response) {
  const worker = await restoreWorker(req.params.id)
  return res.json({ data: worker, status: 'success', code: 200 })
}

export async function getStats(req: Request, res: Response) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const [
    totalWorkers,
    activeWorkers,
    totalUsers,
    totalCurators,
    workersThisMonth,
    usersThisMonth,
    topCategories,
    recentWorkers,
    recentUsers,
  ] = await Promise.all([
    db.worker.count(),
    db.worker.count({ where: { isActive: true } }),
    db.user.count(),
    db.user.count({ where: { role: 'curator' } }),
    db.worker.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.category.findMany({
      select: { id: true, name: true, _count: { select: { workers: true } } },
      orderBy: { workers: { _count: 'desc' } },
      take: 5,
    }),
    db.worker.findMany({
      select: { id: true, name: true, createdAt: true, category: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.user.findMany({
      select: { id: true, firstName: true, lastName: true, email: true, createdAt: true, role: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  return res.json({
    data: {
      totalWorkers,
      activeWorkers,
      totalUsers,
      totalCurators,
      workersThisMonth,
      usersThisMonth,
      topCategories: topCategories.map((cat) => ({
        name: cat.name,
        count: cat._count.workers,
      })),
      recentWorkers,
      recentUsers,
    },
    status: 'success',
    code: 200,
  })
}
