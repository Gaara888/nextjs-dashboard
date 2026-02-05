import { MongoClient, Db } from 'mongodb';
import { formatCurrency } from './utils';

import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoice,
  LatestInvoiceRaw,
  Revenue,
} from './definitions';

// 全局连接缓存
let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    // 检查连接是否仍然有效
    try {
      // 发送一个简单的ping命令检查连接
      await cachedDb.command({ ping: 1 });
      return { client: cachedClient, db: cachedDb };
    } catch (error) {
      // 连接无效，清除缓存
      cachedClient = null;
      cachedDb = null;
    }
  }
  
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const DATABASE_NAME = process.env.MONGODB_NAME || 'your_database_name';
  
  if (!MONGODB_URI) {
    throw new Error('请设置 MONGODB_URI 环境变量');
  }
  
  if (!DATABASE_NAME) {
    throw new Error('请设置 MONGODB_NAME 环境变量');
  }
  
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db(DATABASE_NAME);
    
    // 测试连接
    await db.command({ ping: 1 });
    
    // 缓存连接
    cachedClient = client;
    cachedDb = db;
    
    console.log('MongoDB 连接成功');
    return { client, db };
  } catch (error) {
    console.error('MongoDB 连接失败:', error);
    // 确保关闭无效的连接
    await client.close();
    throw error;
  }
}

// 用于生产环境手动关闭连接（如果需要）
export async function closeDatabaseConnection() {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
    console.log('MongoDB 连接已关闭');
  }
}

export async function fetchRevenue() {
  try {

    console.log('Fetching revenue data...');
    await new Promise((resolve) => setTimeout(resolve, 3000));


    const { db } = await connectToDatabase();
    const revenueCollection = db.collection('revenue');


    const data = await revenueCollection
      .find({})
      .project({ 
        month: 1, 
        revenue: 1,
        _id: 0
      })
      .toArray() as { month: string; revenue: number }[];
    
    console.log('Data fetch completed: ' + JSON.stringify(data));

    console.log('Data fetch completed after 3 seconds.');
      
    return data;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch revenue data.');
  }
  // 注意：这里不再关闭连接，连接由全局缓存管理
}

export async function fetchLatestInvoices(): Promise<LatestInvoice[]> {
  try {

    console.log('Fetching latestInvoices data...');
    await new Promise((resolve) => setTimeout(resolve, 5000));


    const { db } = await connectToDatabase();
    
    const result = await db.collection('invoices').aggregate([
      { $sort: { date: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'customers',
          let: { customerId: '$customer_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$customerId'] } } },
            { $project: { name: 1, image_url: 1, email: 1 } }
          ],
          as: 'customer'
        }
      },
      { $unwind: '$customer' },
      {
        $project: {
          _id: 0,
          id: '$_id',
          amount: 1,
          name: '$customer.name',
          image_url: '$customer.image_url',
          email: '$customer.email'
        }
      }
    ]).toArray() as LatestInvoiceRaw[];
    

    console.log('Data fetch completed after 5 seconds.');

    return result.map((invoice: LatestInvoiceRaw) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch the latest invoices.');
  }
  // 注意：这里不再关闭连接，连接由全局缓存管理
}


export async function fetchCardData() {
  try {

    console.log('Fetching card data...');
    await new Promise((resolve) => setTimeout(resolve, 6000));

    const { db } = await connectToDatabase();
    
    // 并行执行 3 个独立的查询
    const [
      invoiceCountResult,
      customerCountResult,
      invoiceStatsResult
    ] = await Promise.all([
      // 1. 统计发票总数
      db.collection('invoices').countDocuments({}),
      
      // 2. 统计客户总数
      db.collection('customers').countDocuments({}),
      
      // 3. 统计发票状态金额
      db.collection('invoices').aggregate([
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" },
            paid: {
              $sum: {
                $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0]
              }
            },
            pending: {
              $sum: {
                $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0]
              }
            },
            // 可选：统计发票数量
            paidCount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'paid'] }, 1, 0]
              }
            },
            pendingCount: {
              $sum: {
                $cond: [{ $eq: ['$status', 'pending'] }, 1, 0]
              }
            }
          }
        }
      ]).toArray()
    ]);

    // 提取统计数据
    const invoiceStats = invoiceStatsResult[0] || {
      paid: 0,
      pending: 0,
      totalAmount: 0,
      paidCount: 0,
      pendingCount: 0
    };

    console.log('Data fetch completed after 5 seconds.');

    return {
      numberOfCustomers: customerCountResult,
      numberOfInvoices: invoiceCountResult,
      totalPaidInvoices: formatCurrency(invoiceStats.paid),
      totalPendingInvoices: formatCurrency(invoiceStats.pending),
      // 可选：返回额外统计数据
      totalInvoicesAmount: formatCurrency(invoiceStats.totalAmount),
      paidInvoicesCount: invoiceStats.paidCount,
      pendingInvoicesCount: invoiceStats.pendingCount
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  }
}