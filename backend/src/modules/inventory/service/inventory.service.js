
const { getClient } = require("../../../config/db");
const inventoryRepository = require("../repository/inventory.repository");

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Kiểm tra UUID
const requireUuid = (id, label) => {
    if (!id || !UUID_RE.test(id)) {
        const error = new Error(`${label} must be a valid UUID`);
        error.statusCode = 400;
        error.status = 400;
        throw error;
    }
};

// Tạo lỗi có HTTP status
const createError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.status = statusCode;
    return error;
};

// Chạy transaction PostgreSQL
const withTransaction = async (callback) => {
    const client = await getClient();

    try {
        await client.query("BEGIN");

        const result = await callback(client);

        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

class InventoryService {

    // ==========================================
    // SPRINT 1: TRUY VẤN TỒN KHO
    // ==========================================

    async getInventoryByMachine(machineId) {
        requireUuid(machineId, "Machine ID");

        const result =
            await inventoryRepository.getInventoryByMachine(machineId);

        if (result.length === 0 || !result[0].machine_id) {
            throw createError("Machine not found", 404);
        }

        return result;
    }

    async getInventoryBySlot(slotId) {
        requireUuid(slotId, "Slot ID");

        const result =
            await inventoryRepository.getInventoryBySlot(slotId);

        if (result.length === 0 || !result[0].slot_id) {
            throw createError("Slot not found", 404);
        }

        return result;
    }

    // ==========================================
    // SPRINT 2: KIỂM TRA TỒN KHO
    // ==========================================

    async checkAvailability(slotId, productId, requestedQuantity) {
        requireUuid(slotId, "Slot ID");
        requireUuid(productId, "Product ID");

        const quantity = Number(requestedQuantity);

        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw createError("Quantity must be a positive integer");
        }

        return withTransaction(async (client) => {
            const inventory =
                await inventoryRepository.getInventoryForUpdate(
                    slotId,
                    productId,
                    client
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
                Number(inventory.available_quantity);

            return {
                inventoryId: inventory.inventory_id,
                slotId: inventory.slot_id,
                productId: inventory.product_id,
                quantity: Number(inventory.quantity),
                reservedQuantity: Number(inventory.reserved_quantity),
                availableQuantity,
                requestedQuantity: quantity,
                isAvailable: availableQuantity >= quantity
            };
        });
    }

    // ==========================================
    // SPRINT 2: GIỮ HÀNG KHI TẠO ORDER ITEM
    // ==========================================

    async reserveInventory(
        orderItemId,
        slotId,
        productId,
        requestedQuantity
    ) {
        requireUuid(orderItemId, "Order Item ID");
        requireUuid(slotId, "Slot ID");
        requireUuid(productId, "Product ID");

        const quantity = Number(requestedQuantity);

        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw createError("Quantity must be a positive integer");
        }

        try {
            return await withTransaction(async (client) => {

                // Khóa dòng inventory để tránh giữ hàng vượt tồn kho
                const inventory =
                    await inventoryRepository.getInventoryForUpdate(
                        slotId,
                        productId,
                        client
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
                    Number(inventory.available_quantity);

                if (availableQuantity < quantity) {
                    throw createError(
                        `Not enough inventory. Available: ${availableQuantity}`,
                        409
                    );
                }

                // Tạo reservation.
                // Không cập nhật inventories.quantity tại bước giữ hàng.
                const reservation =
                    await inventoryRepository.createReservation(
                        orderItemId,
                        inventory.inventory_id,
                        quantity,
                        client
                    );

                return {
                    reservation,
                    inventory: {
                        inventoryId: inventory.inventory_id,
                        quantity: Number(inventory.quantity),
                        reservedQuantity:
                            Number(inventory.reserved_quantity) + quantity,
                        availableQuantity:
                            availableQuantity - quantity
                    }
                };
            });
        } catch (error) {

            // PostgreSQL unique violation
            // Mỗi order item chỉ có một reservation RESERVED.
            if (error.code === "23505") {
                throw createError(
                    "This order item already has an active reservation",
                    409
                );
            }

            throw error;
        }
    }

    // ==========================================
    // SPRINT 2: THANH TOÁN THÀNH CÔNG
    // ==========================================

    async consumeReservation(reservationId) {
        requireUuid(reservationId, "Reservation ID");

        return withTransaction(async (client) => {
            const result =
                await inventoryRepository.consumeReservation(
                    reservationId,
                    client
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
        requireUuid(reservationId, "Reservation ID");

        return withTransaction(async (client) => {
            const result =
                await inventoryRepository.releaseReservation(
                    reservationId,
                    client
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
