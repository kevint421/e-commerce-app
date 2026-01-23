import { Handler } from 'aws-lambda';
import {
  OrderRepository,
  InventoryRepository,
  OrderStatus,
  logger,
  getCurrentTimestamp,
} from 'ecommerce-backend-shared';

const orderRepo = new OrderRepository();
const inventoryRepo = new InventoryRepository();

interface ReserveInventoryInput {
  orderId: string;
}

interface ReserveInventoryOutput {
  orderId: string;
  status: string;
  reservedItems: Array<{
    productId: string;
    productName: string;
    quantity: number;
    warehouseId: string;
  }>;
}

/**
 * Reserve Inventory Step Function Task
 * Reserves inventory for order with optimistic locking
 */
export const handler: Handler<ReserveInventoryInput, ReserveInventoryOutput> = async (
  event
): Promise<ReserveInventoryOutput> => {
  const { orderId } = event;

  logger.setContext({ orderId });
  logger.info('Reserving inventory for order');

  // Get order
  const order = await orderRepo.getById(orderId);
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // Check if inventory is already reserved (idempotency)
  if (order.status === OrderStatus.INVENTORY_RESERVED) {
    logger.info('Inventory already reserved, skipping reservation', {
      orderId,
      status: order.status,
    });

    // Extract warehouse info from existing order items
    const reservedItems = order.items.map((item: any) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      warehouseId: item.warehouseId || 'warehouse-east', // fallback to default
    }));

    return {
      orderId,
      status: OrderStatus.INVENTORY_RESERVED,
      reservedItems,
    };
  }

  // Check if in correct status for new reservation
  if (order.status !== OrderStatus.PENDING) {
    logger.error('Order in unexpected status', { status: order.status });
    throw new Error(`Cannot reserve inventory: Order is in ${order.status} status`);
  }

  const reservedItems: Array<{
    productId: string;
    productName: string;
    quantity: number;
    warehouseId: string;
  }> = [];

  // Reserve inventory for each item
  for (const item of order.items) {
    const { productId, productName, quantity } = item;

    logger.info('Reserving inventory for item', { productId, quantity });

    // Find warehouse with available inventory
    const inventoryList = await inventoryRepo.getByProductId(productId);
    
    let reserved = false;
    let reservationError: Error | null = null;

    // Try each warehouse until successful (optimistic locking with retry)
    for (const inventory of inventoryList.items) {
      if (inventory.quantity - inventory.reserved < quantity) {
        logger.info('Insufficient inventory', {
          productId,
          warehouseId: inventory.warehouseId,
          available: inventory.quantity - inventory.reserved,
          needed: quantity,
        });
        continue;
      }

      // Try to reserve with optimistic locking
      const maxRetries = 3;
      let retryCount = 0;

      while (retryCount < maxRetries && !reserved) {
        try {
          // Get fresh inventory data
          const currentInventory = await inventoryRepo.get(inventory.productId, inventory.warehouseId);
          if (!currentInventory) {
            throw new Error('Inventory not found');
          }

          // Check if still available
          const available = currentInventory.quantity - currentInventory.reserved;
          if (available < quantity) {
            logger.info('Inventory no longer available after refresh', {
              available,
              needed: quantity,
            });
            break; // Try next warehouse
          }

          // Reserve inventory (optimistic locking)
          await inventoryRepo.reserve(
            inventory.productId,
            inventory.warehouseId,
            quantity,
            currentInventory.version
          );

          reserved = true;
          reservedItems.push({
            productId,
            productName,
            quantity,
            warehouseId: currentInventory.warehouseId,
          });

          logger.info('Inventory reserved successfully', {
            productId,
            warehouseId: currentInventory.warehouseId,
            quantity,
            newReserved: currentInventory.reserved + quantity,
          });
        } catch (error: any) {
          if (error.name === 'ConditionalCheckFailedException') {
            // Version conflict - retry
            retryCount++;
            logger.info('Optimistic lock conflict, retrying', {
              retryCount,
              productId,
            });
            await new Promise((resolve) => setTimeout(resolve, 100 * retryCount));
          } else {
            reservationError = error;
            throw error;
          }
        }
      }

      if (reserved) break; // Move to next item
    }

    if (!reserved) {
      // Failed to reserve inventory
      logger.error('Failed to reserve inventory', reservationError || new Error('No inventory available'), {
        productId,
        quantity,
      });

      throw new Error(
        `Insufficient inventory for product ${productName} (${productId}). Requested: ${quantity}`
      );
    }
  }

  // Update order items with warehouse IDs and update status
  // This is critical for compensation handler to know where to release inventory
  const updatedItems = order.items.map((item: any) => {
    const reservedItem = reservedItems.find(r => r.productId === item.productId);
    if (reservedItem) {
      return {
        ...item,
        warehouseId: reservedItem.warehouseId,
      };
    }
    return item;
  });

  await orderRepo.update(orderId, {
    items: updatedItems,
    status: OrderStatus.INVENTORY_RESERVED,
    updatedAt: getCurrentTimestamp(),
  });

  logger.info('Inventory reservation completed', {
    orderId,
    itemCount: reservedItems.length,
  });

  return {
    orderId,
    status: OrderStatus.INVENTORY_RESERVED,
    reservedItems,
  };
};