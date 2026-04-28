import type { Request, Response } from 'express'
import { paymentService } from '../services/payment.service.js'
import { handleError } from '../utils/handleError.js'

/**
 * POST /api/payments/tip
 * Body: { from, to, amount }
 */
export async function processTip(req: Request, res: Response) {
  try {
    const { from, to, amount } = req.body
    if (!from || !to || amount === undefined) {
      return res.status(400).json({ status: 'error', message: 'from, to, and amount are required', code: 400 })
    }
    const result = paymentService.tip({ from, to, amount: Number(amount) })
    return res.status(200).json({ data: result, status: 'success', code: 200 })
  } catch (err) {
    return handleError(res, err)
  }
}

/**
 * POST /api/payments/escrow
 * Body: { from, to, amount, expiryDate }
 */
export async function createEscrow(req: Request, res: Response) {
  try {
    const { from, to, amount, expiryDate } = req.body
    if (!from || !to || amount === undefined || !expiryDate) {
      return res.status(400).json({ status: 'error', message: 'from, to, amount, and expiryDate are required', code: 400 })
    }
    const result = paymentService.createEscrow({
      from,
      to,
      amount: Number(amount),
      expiryDate: new Date(expiryDate),
    })
    return res.status(201).json({ data: result, status: 'success', code: 201 })
  } catch (err) {
    return handleError(res, err)
  }
}

/**
 * GET /api/payments/fee
 */
export function getFee(_req: Request, res: Response) {
  return res.status(200).json({
    data: { fee_bps: paymentService.getFeeBps() },
    status: 'success',
    code: 200,
  })
}

/**
 * PATCH /api/payments/fee
 * Body: { fee_bps }
 * Requires admin role.
 */
export function updateFee(req: Request, res: Response) {
  try {
    const { fee_bps } = req.body
    if (fee_bps === undefined) {
      return res.status(400).json({ status: 'error', message: 'fee_bps is required', code: 400 })
    }
    paymentService.setFeeBps(req.user?.role ?? '', Number(fee_bps))
    return res.status(200).json({
      data: { fee_bps: paymentService.getFeeBps() },
      status: 'success',
      code: 200,
    })
  } catch (err) {
    return handleError(res, err)
  }
}
