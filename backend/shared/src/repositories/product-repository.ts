import {
    GetCommand,
    PutCommand,
    UpdateCommand,
    QueryCommand,
    ScanCommand,
    BatchGetCommand,
  } from '@aws-sdk/lib-dynamodb';
  import {
    dynamoClient,
    handleDynamoDBError,
    withRetry,
    getCurrentTimestamp,
    getTableName,
    buildUpdateExpression,
    buildPaginatedResponse,
  } from '../utils/dynamodb-client';
  import {
    Product,
    ProductCategory,
    DynamoDBProductItem,
    PaginatedResult,
    QueryOptions,
  } from '../types';
  
  export class ProductRepository {
    private tableName: string;
  
    constructor() {
      this.tableName = getTableName('PRODUCTS_TABLE_NAME');
    }
  
    /**
     * Create a new product
     */
    async create(product: Omit<Product, 'createdAt' | 'updatedAt'>): Promise<Product> {
      const now = getCurrentTimestamp();
      const newProduct: Product = {
        ...product,
        createdAt: now,
        updatedAt: now,
      };
  
      const item: DynamoDBProductItem = {
        PK: newProduct.productId,
        ...newProduct,
      };
  
      try {
        await withRetry(() =>
          dynamoClient.send(
            new PutCommand({
              TableName: this.tableName,
              Item: item,
              ConditionExpression: 'attribute_not_exists(PK)',
            })
          )
        );
  
        return newProduct;
      } catch (error) {
        return handleDynamoDBError(error);
      }
    }
  
    /**
     * Get product by ID
     */
    async getById(productId: string): Promise<Product | null> {
      try {
        const response = await dynamoClient.send(
          new GetCommand({
            TableName: this.tableName,
            Key: { PK: productId },
          })
        );
  
        if (!response.Item) {
          return null;
        }
  
        const { PK, ...product } = response.Item as DynamoDBProductItem;
        return product as Product;
      } catch (error) {
        return handleDynamoDBError(error);
      }
    }
  
    /**
     * Get multiple products by IDs
     */
    async getByIds(productIds: string[]): Promise<Product[]> {
      if (productIds.length === 0) {
        return [];
      }
  
      try {
        const keys = productIds.map((id) => ({ PK: id }));
        const response = await dynamoClient.send(
          new BatchGetCommand({
            RequestItems: {
              [this.tableName]: {
                Keys: keys,
              },
            },
          })
        );
  
        const items = response.Responses?.[this.tableName] || [];
        return items.map((item) => {
          const { PK, ...product } = item as DynamoDBProductItem;
          return product as Product;
        });
      } catch (error) {
        return handleDynamoDBError(error);
      }
    }
  
    /**
     * Update product
     */
    async update(
      productId: string,
      updates: Partial<Omit<Product, 'productId' | 'createdAt'>>
    ): Promise<Product> {
      const updatesWithTimestamp = {
        ...updates,
        updatedAt: getCurrentTimestamp(),
      };
  
      const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
        buildUpdateExpression(updatesWithTimestamp);
  
      try {
        const response = await withRetry(() =>
          dynamoClient.send(
            new UpdateCommand({
              TableName: this.tableName,
              Key: { PK: productId },
              UpdateExpression,
              ExpressionAttributeNames,
              ExpressionAttributeValues,
              ConditionExpression: 'attribute_exists(PK)',
              ReturnValues: 'ALL_NEW',
            })
          )
        );
  
        const { PK, ...product } = response.Attributes as DynamoDBProductItem;
        return product as Product;
      } catch (error) {
        return handleDynamoDBError(error);
      }
    }
  
    /**
     * Activate/deactivate product
     */
    async setActive(productId: string, active: boolean): Promise<Product> {
      return this.update(productId, { active });
    }
  
    /**
     * Update product price
     */
    async updatePrice(productId: string, price: number): Promise<Product> {
      return this.update(productId, { price });
    }
  
    /**
     * Get products by category
     */
    async getByCategory(
      category: ProductCategory,
      options: QueryOptions = {}
    ): Promise<PaginatedResult<Product>> {
      try {
        const response = await dynamoClient.send(
          new QueryCommand({
            TableName: this.tableName,
            IndexName: 'category-name-index',
            KeyConditionExpression: 'category = :category',
            ExpressionAttributeValues: {
              ':category': category,
            },
            ScanIndexForward: true, // Alphabetical by name
            Limit: options.limit,
            ExclusiveStartKey: options.lastEvaluatedKey,
          })
        );
  
        const items = (response.Items || []).map((item) => {
          const { PK, ...product } = item as DynamoDBProductItem;
          return product as Product;
        });
  
        return buildPaginatedResponse(items, response.LastEvaluatedKey);
      } catch (error) {
        return handleDynamoDBError(error);
      }
    }
  
    /**
     * Get all active products
     */
    async getAllActive(options: QueryOptions = {}): Promise<PaginatedResult<Product>> {
      try {
        const response = await dynamoClient.send(
          new ScanCommand({
            TableName: this.tableName,
            FilterExpression: 'active = :active',
            ExpressionAttributeValues: {
              ':active': true,
            },
            Limit: options.limit,
            ExclusiveStartKey: options.lastEvaluatedKey,
          })
        );
  
        const items = (response.Items || []).map((item) => {
          const { PK, ...product } = item as DynamoDBProductItem;
          return product as Product;
        });
  
        return buildPaginatedResponse(items, response.LastEvaluatedKey);
      } catch (error) {
        return handleDynamoDBError(error);
      }
    }
  
    /**
     * Search products by name (basic implementation)
     */
    async searchByName(
      searchTerm: string,
      options: QueryOptions = {}
    ): Promise<PaginatedResult<Product>> {
      try {
        const response = await dynamoClient.send(
          new ScanCommand({
            TableName: this.tableName,
            FilterExpression: 'contains(#name, :searchTerm) AND active = :active',
            ExpressionAttributeNames: {
              '#name': 'name',
            },
            ExpressionAttributeValues: {
              ':searchTerm': searchTerm,
              ':active': true,
            },
            Limit: options.limit,
            ExclusiveStartKey: options.lastEvaluatedKey,
          })
        );
  
        const items = (response.Items || []).map((item) => {
          const { PK, ...product } = item as DynamoDBProductItem;
          return product as Product;
        });
  
        return buildPaginatedResponse(items, response.LastEvaluatedKey);
      } catch (error) {
        return handleDynamoDBError(error);
      }
    }
  
    /**
     * Delete product (soft delete by setting inactive)
     */
    async delete(productId: string): Promise<Product> {
      return this.setActive(productId, false);
    }
  
    /**
     * Check if product exists and is active
     */
    async isActive(productId: string): Promise<boolean> {
      const product = await this.getById(productId);
      return product !== null && product.active;
    }
  
    /**
     * Get products with low stock (needs inventory data)
     * TODO: This would typically join with inventory table
     * For now, just returns active products
     */
    async getActiveProducts(limit: number = 100): Promise<Product[]> {
      const result = await this.getAllActive({ limit });
      return result.items;
    }
  }
  