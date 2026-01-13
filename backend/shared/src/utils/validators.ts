/**
 * Input Validation Utilities
 * Validates data before database operations
 */

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public value?: any
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate UUID format
 */
export function validateUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate required fields
 */
export function validateRequired<T extends Record<string, any>>(
  data: T,
  requiredFields: (keyof T)[]
): void {
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      throw new ValidationError(
        `Missing required field: ${String(field)}`,
        String(field)
      );
    }
  }
}

/**
 * Validate positive number
 */
export function validatePositiveNumber(value: number, fieldName: string): void {
  if (typeof value !== 'number' || value <= 0) {
    throw new ValidationError(
      `${fieldName} must be a positive number`,
      fieldName,
      value
    );
  }
}

/**
 * Validate non-negative number
 */
export function validateNonNegativeNumber(value: number, fieldName: string): void {
  if (typeof value !== 'number' || value < 0) {
    throw new ValidationError(
      `${fieldName} must be a non-negative number`,
      fieldName,
      value
    );
  }
}

/**
 * Validate string length
 */
export function validateStringLength(
  value: string,
  fieldName: string,
  min?: number,
  max?: number
): void {
  if (typeof value !== 'string') {
    throw new ValidationError(
      `${fieldName} must be a string`,
      fieldName,
      value
    );
  }

  if (min !== undefined && value.length < min) {
    throw new ValidationError(
      `${fieldName} must be at least ${min} characters`,
      fieldName,
      value
    );
  }

  if (max !== undefined && value.length > max) {
    throw new ValidationError(
      `${fieldName} must be at most ${max} characters`,
      fieldName,
      value
    );
  }
}

/**
 * Validate array is not empty
 */
export function validateNonEmptyArray<T>(
  arr: T[],
  fieldName: string
): void {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new ValidationError(
      `${fieldName} must be a non-empty array`,
      fieldName,
      arr
    );
  }
}

/**
 * Validate enum value
 */
export function validateEnum<T extends Record<string, string>>(
  value: string,
  enumType: T,
  fieldName: string
): void {
  const validValues = Object.values(enumType);
  if (!validValues.includes(value)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${validValues.join(', ')}`,
      fieldName,
      value
    );
  }
}

/**
 * Validate address
 */
export interface Address {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export function validateAddress(address: any): void {
  validateRequired(address, ['street', 'city', 'state', 'postalCode', 'country']);
  validateStringLength(address.street, 'street', 1, 200);
  validateStringLength(address.city, 'city', 1, 100);
  validateStringLength(address.state, 'state', 2, 50);
  validateStringLength(address.postalCode, 'postalCode', 3, 20);
  validateStringLength(address.country, 'country', 2, 2); // ISO country code
}

/**
 * Validate order items
 */
export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  pricePerUnit: number;
  totalPrice: number;
}

export function validateOrderItems(items: any[]): void {
  validateNonEmptyArray(items, 'items');

  items.forEach((item, index) => {
    const fieldPrefix = `items[${index}]`;

    // Only validate fields that should be in the request
    validateRequired(item, ['productId', 'quantity']);
    validateStringLength(item.productId, `${fieldPrefix}.productId`, 1, 100);
    validatePositiveNumber(item.quantity, `${fieldPrefix}.quantity`);
    
    // Validate that quantity is an integer
    if (!Number.isInteger(item.quantity)) {
      throw new ValidationError(
        `${fieldPrefix}.quantity must be an integer`,
        `${fieldPrefix}.quantity`,
        item.quantity
      );
    }
  });
}

/**
 * Validate enriched order items (after adding product details)
 * Used internally after fetching product data from database
 */
export function validateEnrichedOrderItems(items: any[]): void {
  validateNonEmptyArray(items, 'items');

  items.forEach((item, index) => {
    const fieldPrefix = `items[${index}]`;

    validateRequired(item, ['productId', 'productName', 'quantity', 'pricePerUnit', 'totalPrice']);
    validateStringLength(item.productId, `${fieldPrefix}.productId`, 1, 100);
    validateStringLength(item.productName, `${fieldPrefix}.productName`, 1, 200);
    validatePositiveNumber(item.quantity, `${fieldPrefix}.quantity`);
    validatePositiveNumber(item.pricePerUnit, `${fieldPrefix}.pricePerUnit`);
    validatePositiveNumber(item.totalPrice, `${fieldPrefix}.totalPrice`);

    // Validate total price calculation
    const expectedTotal = item.quantity * item.pricePerUnit;
    if (Math.abs(item.totalPrice - expectedTotal) > 0.01) {
      throw new ValidationError(
        `${fieldPrefix}.totalPrice does not match quantity * pricePerUnit`,
        `${fieldPrefix}.totalPrice`,
        item.totalPrice
      );
    }
  });
}

/**
 * Validate price (in cents)
 */
export function validatePrice(price: number, fieldName: string): void {
  validatePositiveNumber(price, fieldName);
  
  // Must be an integer (cents)
  if (!Number.isInteger(price)) {
    throw new ValidationError(
      `${fieldName} must be an integer (cents)`,
      fieldName,
      price
    );
  }
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  // Remove control characters and excessive whitespace
  return input
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim()
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Validate and sanitize object
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized = { ...obj };
  
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitizeString(sanitized[key]) as any;
    }
  }
  
  return sanitized;
}

/**
 * Usage Examples:
 * 
 * // Validate required fields
 * validateRequired(order, ['orderId', 'customerId', 'totalAmount']);
 * 
 * // Validate positive number
 * validatePositiveNumber(order.totalAmount, 'totalAmount');
 * 
 * // Validate enum
 * validateEnum(order.status, OrderStatus, 'status');
 * 
 * // Validate address
 * validateAddress(order.shippingAddress);
 * 
 * // Validate order items
 * validateOrderItems(order.items);
 * 
 * // Sanitize input
 * const cleanInput = sanitizeString(userInput);
 */