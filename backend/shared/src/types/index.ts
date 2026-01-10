/**
 * Order Status Enum
 * Represents the lifecycle of an order through the fulfillment process
 */
export enum OrderStatus {
    PENDING = 'PENDING',                    // Order created, awaiting processing
    INVENTORY_RESERVED = 'INVENTORY_RESERVED', // Inventory allocated
    PAYMENT_PROCESSING = 'PAYMENT_PROCESSING', // Payment being processed
    PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',   // Payment successful
    SHIPPING_ALLOCATED = 'SHIPPING_ALLOCATED', // Shipping label created
    SHIPPED = 'SHIPPED',                    // Order shipped to customer
    DELIVERED = 'DELIVERED',                // Order delivered
    CANCELLED = 'CANCELLED',                // Order cancelled
    FAILED = 'FAILED',                      // Order failed (payment/inventory)
  }
  
  /**
   * Order Event Types
   * Events for event sourcing - tracks every state change
   */
  export enum OrderEventType {
    ORDER_CREATED = 'ORDER_CREATED',
    INVENTORY_RESERVED = 'INVENTORY_RESERVED',
    INVENTORY_RELEASED = 'INVENTORY_RELEASED',
    PAYMENT_INITIATED = 'PAYMENT_INITIATED',
    PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
    PAYMENT_FAILED = 'PAYMENT_FAILED',
    SHIPPING_ALLOCATED = 'SHIPPING_ALLOCATED',
    ORDER_SHIPPED = 'ORDER_SHIPPED',
    ORDER_DELIVERED = 'ORDER_DELIVERED',
    ORDER_CANCELLED = 'ORDER_CANCELLED',
  }
  
  /**
   * Product Category
   */
  export enum ProductCategory {
    ELECTRONICS = 'ELECTRONICS',
    CLOTHING = 'CLOTHING',
    BOOKS = 'BOOKS',
    HOME = 'HOME',
    SPORTS = 'SPORTS',
    TOYS = 'TOYS',
    OTHER = 'OTHER',
  }
  
  /**
   * Order Item
   * Represents a single product in an order
   */
  export interface OrderItem {
    productId: string;
    productName: string;
    quantity: number;
    pricePerUnit: number;
    totalPrice: number;
  }
  
  /**
   * Order
   * Main order entity
   */
  export interface Order {
    orderId: string;                    // Unique order ID (UUID)
    customerId: string;                 // Customer identifier
    items: OrderItem[];                 // Products in the order
    totalAmount: number;                // Total order amount
    status: OrderStatus;                // Current order status
    shippingAddress: Address;           // Delivery address
    paymentIntentId?: string;           // Stripe payment intent ID
    trackingNumber?: string;            // Shipping tracking number
    warehouseId?: string;               // Warehouse fulfilling the order
    createdAt: string;                  // ISO timestamp
    updatedAt: string;                  // ISO timestamp
    metadata?: Record<string, any>;     // Additional data
  }
  
  /**
   * Address
   */
  export interface Address {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }
  
  /**
   * Product
   * Product catalog entity
   */
  export interface Product {
    productId: string;                  // Unique product ID
    name: string;                       // Product name
    description: string;                // Product description
    price: number;                      // Price in cents
    category: ProductCategory;          // Product category
    imageUrl?: string;                  // Product image URL
    active: boolean;                    // Whether product is available
    createdAt: string;                  // ISO timestamp
    updatedAt: string;                  // ISO timestamp
  }
  
  /**
   * Inventory
   * Multi-warehouse inventory with optimistic locking
   */
  export interface Inventory {
    inventoryId: string;                // PK: productId#warehouseId
    productId: string;                  // Product reference
    warehouseId: string;                // Warehouse reference
    quantity: number;                   // Available quantity
    reserved: number;                   // Reserved quantity (pending orders)
    version: number;                    // Version for optimistic locking
    updatedAt: string;                  // ISO timestamp
  }
  
  /**
   * Order Event
   * Event sourcing - append-only log of order changes
   */
  export interface OrderEvent {
    eventId: string;                    // Unique event ID (UUID)
    orderId: string;                    // Order reference
    eventType: OrderEventType;          // Type of event
    timestamp: string;                  // ISO timestamp
    payload: Record<string, any>;       // Event-specific data
    userId?: string;                    // User who triggered event
    metadata?: Record<string, any>;     // Additional context
  }
  
  /**
   * Idempotency Key
   * Prevents duplicate operations (especially payments)
   */
  export interface IdempotencyKey {
    idempotencyKey: string;             // Unique key (e.g., orderId:operation)
    operation: string;                  // Operation being protected
    status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    result?: any;                       // Operation result (if completed)
    createdAt: string;                  // ISO timestamp
    expiresAt: number;                  // Unix timestamp (TTL)
  }
  
  /**
   * DynamoDB Item Mapper
   * Utility types for DynamoDB operations
   */
  export interface DynamoDBOrderItem {
    PK: string;                         // orderId
    orderId: string;
    customerId: string;
    items: OrderItem[];
    totalAmount: number;
    status: OrderStatus;
    shippingAddress: Address;
    paymentIntentId?: string;
    trackingNumber?: string;
    warehouseId?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, any>;
  }
  
  export interface DynamoDBProductItem {
    PK: string;                         // productId
    productId: string;
    name: string;
    description: string;
    price: number;
    category: ProductCategory;
    imageUrl?: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
  }
  
  export interface DynamoDBInventoryItem {
    PK: string;                         // productId#warehouseId
    inventoryId: string;
    productId: string;
    warehouseId: string;
    quantity: number;
    reserved: number;
    version: number;
    updatedAt: string;
  }
  
  export interface DynamoDBOrderEventItem {
    PK: string;                         // orderId
    SK: string;                         // timestamp#eventId
    eventId: string;
    orderId: string;
    eventType: OrderEventType;
    timestamp: string;
    payload: Record<string, any>;
    userId?: string;
    metadata?: Record<string, any>;
  }
  
  export interface DynamoDBIdempotencyItem {
    idempotencyKey: string;             // PK
    operation: string;
    status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    result?: any;
    createdAt: string;
    expiresAt: number;
  }
  
  /**
   * Repository Response Types
   */
  export interface RepositoryResult<T> {
    success: boolean;
    data?: T;
    error?: string;
  }
  
  export interface PaginatedResult<T> {
    items: T[];
    lastEvaluatedKey?: Record<string, any>;
    hasMore: boolean;
  }
  
  /**
   * Query Options
   */
  export interface QueryOptions {
    limit?: number;
    lastEvaluatedKey?: Record<string, any>;
    scanIndexForward?: boolean;
  }
  
  /**
   * Inventory Update Options
   */
  export interface InventoryUpdateOptions {
    quantity?: number;
    reserved?: number;
    expectedVersion: number;
  }