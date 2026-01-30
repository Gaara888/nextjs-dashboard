import { MongoClient } from 'mongodb';
import { NextResponse } from 'next/server';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'nextjs-dashboard-postgres';

async function listInvoices() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db(DATABASE_NAME);
    
    // 直接使用 find 查询 amount = 666 的发票
    const invoices = await db.collection('invoices')
      .find({ amount: 666 })
      .toArray();
    
    // 获取所有相关的客户信息
    const customerIds = invoices.map(invoice => invoice.customer_id);
    const customers = await db.collection('customers')
      .find({ _id: { $in: customerIds } })
      .toArray();
    
    // 创建客户 ID 到名称的映射
    const customerMap = new Map(
      customers.map(customer => [customer._id, customer.name])
    );
    
    // 格式化响应数据
    const result = invoices.map(invoice => ({
      amount: invoice.amount,
      name: customerMap.get(invoice.customer_id) || 'Unknown Customer'
    }));
    
    return result;
  } finally {
    await client.close();
  }
}

export async function GET() {
  try {
    const data = await listInvoices();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}