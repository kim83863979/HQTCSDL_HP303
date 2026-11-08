
const inventoryService = require("../service/inventory.service");

class InventoryController {
    // ==========================================
    // SPRINT 1: TRUY VẤN TỒN KHO
    // ==========================================

    // GET /api/inventory/machines/:machineId
    async getInventoryByMachine(req, res, next) {
        try {
            const { machineId } = req.params;

            const result = await inventoryService.getInventoryByMachine(
                machineId
            );

            return res.status(200).json({
                success: true,
                message: "Get inventory by machine successfully",
                data: result
            });
        } catch (error) {
            return next(error);
        }
    }

    // GET /api/inventory/slots/:slotId
    async getInventoryBySlot(req, res, next) {
        try {
            const { slotId } = req.params;

            const result = await inventoryService.getInventoryBySlot(slotId);

            return res.status(200).json({
                success: true,
                message: "Get inventory by slot successfully",
                data: result
            });
        } catch (error) {
            return next(error);
        }
    }

    // ==========================================
    // SPRINT 2: KIỂM TRA TỒN KHO
    // ==========================================

    // GET /api/inventory/availability
    async checkAvailability(req, res, next) {
        try {
            const { slotId, productId, quantity } = req.query;

            const result = await inventoryService.checkAvailability(
                slotId,
                productId,
                quantity
            );

            return res.status(200).json({
                success: true,
                message: "Check inventory availability successfully",
                data: result
            });
        } catch (error) {
            return next(error);
        }
    }

    // ==========================================
    // SPRINT 2: GIỮ HÀNG
    // ==========================================

    // POST /api/inventory/reservations
    async reserveInventory(req, res, next) {
        try {
            const { orderItemId, slotId, productId, quantity } = req.body;

            const result = await inventoryService.reserveInventory(
                orderItemId,
                slotId,
                productId,
                quantity
            );

            return res.status(201).json({
                success: true,
                message: "Inventory reserved successfully",
                data: result
            });
        } catch (error) {
            return next(error);
        }
    }

    // ==========================================
    // SPRINT 2: XÁC NHẬN TRỪ KHO
    // ==========================================

    // POST /api/inventory/reservations/:reservationId/consume
    async consumeReservation(req, res, next) {
        try {
            const { reservationId } = req.params;

            const result = await inventoryService.consumeReservation(
                reservationId
            );

            return res.status(200).json({
                success: true,
                message: "Inventory consumed successfully",
                data: result
            });
        } catch (error) {
            return next(error);
        }
    }

    // ==========================================
    // SPRINT 2: GIẢI PHÓNG HÀNG
    // ==========================================

    // POST /api/inventory/reservations/:reservationId/release
    async releaseReservation(req, res, next) {
        try {
            const { reservationId } = req.params;

            const result = await inventoryService.releaseReservation(
                reservationId
            );

            return res.status(200).json({
                success: true,
                message: "Inventory released successfully",
                data: result
            });
        } catch (error) {
            return next(error);
        }
    }
}

module.exports = new InventoryController();
