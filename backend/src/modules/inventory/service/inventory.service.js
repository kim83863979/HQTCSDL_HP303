
const { sequelize } = require("../../../model");
const inventoryRepository = require("../repository/inventory.repository");

// Tạo lỗi có HTTP status code
const createError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

class InventoryService {
    // ==========================================
    // SPRINT 1: TRUY VẤN TỒN KHO
    // ==========================================

    async getInventoryByMachine(machineId) {
        if (!machineId) {
            throw createError("Machine ID is required");
        }

        return await inventoryRepository.getInventoryByMachine(machineId);
    }

    async getInventoryBySlot(slotId) {
        if (!slotId) {
            throw createError("Slot ID is required");
        }

        return await inventoryRepository.getInventoryBySlot(slotId);
    }

    // ==========================================
    // SPRINT 2: KIỂM TRA TỒN KHO
    // ==========================================

    async checkAvailability(slotId, productId, requestedQuantity) {
        if (!slotId || !productId) {
            throw createError("Slot ID and Product ID are required");
        }

        const quantity = Number(requestedQuantity);

        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw createError("Quantity must be a positive integer");
        }

        return await sequelize.transaction(async (transaction) => {
            const inventory = await inventoryRepository.getInventoryForUpdate(
                slotId,
                productId,
                transaction
            );

            if (!inventory) {
                throw createError("Inventory not found", 404);
            }

            if (inventory.slot_status !== "ACTIVE") {
                throw createError("Slot is not active", 400);
            }

            if (inventory.product_status !== "ACTIVE") {
                throw createError("Product is not active", 400);
            }

            const availableQuantity =
                inventory.quantity - inventory.reserved_quantity;

            return {
                inventoryId: inventory.inventory_id,
                slotId: inventory.slot_id,
                productId: inventory.product_id,
                quantity: inventory.quantity,
                reservedQuantity: inventory.reserved_quantity,
                availableQuantity,
                requestedQuantity: quantity,
                isAvailable: availableQuantity >= quantity
            };
        });
    }

    // ==========================================
    // SPRINT 2: GIỮ HÀNG KHI TẠO ORDER ITEM
    // ==========================================

    async reserveInventory(orderItemId, slotId, productId, requestedQuantity) {
        if (!orderItemId || !slotId || !productId) {
            throw createError(
                "Order Item ID, Slot ID and Product ID are required"
            );
        }

        const quantity = Number(requestedQuantity);

        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw createError("Quantity must be a positive integer");
        }

        try {
            return await sequelize.transaction(async (transaction) => {
                // Khóa dòng tồn kho để tránh giữ hàng vượt số lượng
                const inventory =
                    await inventoryRepository.getInventoryForUpdate(
                        slotId,
                        productId,
                        transaction
                    );

                if (!inventory) {
                    throw createError("Inventory not found", 404);
                }

                if (inventory.slot_status !== "ACTIVE") {
                    throw createError("Slot is not active");
                }

                if (inventory.product_status !== "ACTIVE") {
                    throw createError("Product is not active");
                }

                const availableQuantity =
                    inventory.quantity - inventory.reserved_quantity;

                if (availableQuantity < quantity) {
                    throw createError(
                        `Not enough inventory. Available: ${availableQuantity}`,
                        409
                    );
                }

                // Tăng số lượng hàng đang được giữ
                const updatedInventory =
                    await inventoryRepository.increaseReservedQuantity(
                        inventory.inventory_id,
                        quantity,
                        transaction
                    );

                if (!updatedInventory) {
                    throw createError("Unable to reserve inventory", 409);
                }

                // Tạo reservation gắn với order item
                const reservation =
                    await inventoryRepository.createReservation(
                        orderItemId,
                        inventory.inventory_id,
                        quantity,
                        transaction
                    );

                return {
                    reservation,
                    inventory: updatedInventory
                };
            });
        } catch (error) {
            // Mỗi order item chỉ được có một reservation đang RESERVED
            if (error.name === "SequelizeUniqueConstraintError") {
                throw createError(
                    "This order item already has an active reservation",
                    409
                );
            }

            throw error;
        }
    }

    // ==========================================
    // SPRINT 2: XÁC NHẬN THANH TOÁN THÀNH CÔNG
    // ==========================================

    async consumeReservation(reservationId) {
        if (!reservationId) {
            throw createError("Reservation ID is required");
        }

        return await sequelize.transaction(async (transaction) => {
            const result =
                await inventoryRepository.consumeReservation(
                    reservationId,
                    transaction
                );

            if (!result) {
                throw createError(
                    "Reservation not found or already resolved",
                    409
                );
            }

            return result;
        });
    }

    // ==========================================
    // SPRINT 2: GIẢI PHÓNG HÀNG
    // ==========================================

    async releaseReservation(reservationId) {
        if (!reservationId) {
            throw createError("Reservation ID is required");
        }

        return await sequelize.transaction(async (transaction) => {
            const result =
                await inventoryRepository.releaseReservation(
                    reservationId,
                    transaction
                );

            if (!result) {
                throw createError(
                    "Reservation not found or already resolved",
                    409
                );
            }

            return result;
        });
    }
}

module.exports = new InventoryService();
