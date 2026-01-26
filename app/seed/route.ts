import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';
import { NextResponse } from 'next/server';
import { users, customers, invoices, revenue } from '../lib/placeholder-data';

// MongoDB 连接配置 - 提供默认值
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'nextjs-dashboard-postgres';

export async function GET() {
  let client: MongoClient | null = null;
  
  try {
    console.log('🚀 Starting database seeding...');
    
    // 检查环境变量
    console.log('Checking environment variables...');
    console.log('MONGODB_URI is set:', !!process.env.MONGODB_URI);
    
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined. Please check your .env.local file');
    }
    
    // 安全地显示连接字符串（隐藏密码）
    const maskedUri = MONGODB_URI.replace(
      /mongodb(\+srv)?:\/\/([^:]+):([^@]+)@/,
      'mongodb$1://***:***@'
    );
    console.log(`🔗 Using MongoDB: ${maskedUri}`);
    
    // 创建新的连接客户端
    client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    
    // 连接 MongoDB
    console.log('Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected to MongoDB successfully');
    
    // 测试连接
    await client.db().admin().ping();
    console.log('✅ MongoDB ping successful');
    
    const db = client.db(DATABASE_NAME);
    console.log(`📁 Using database: ${DATABASE_NAME}`);
    
    // 清空现有集合
    console.log('🗑️ Clearing existing collections...');
    await Promise.all([
      db.collection('users').deleteMany({}),
      db.collection('customers').deleteMany({}),
      db.collection('invoices').deleteMany({}),
      db.collection('revenue').deleteMany({})
    ]);
    console.log('✅ Collections cleared');

    // 1. 插入用户数据
    console.log('👤 Inserting users...');
    const userPromises = users.map(async (user) => {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      return {
        _id: user.id, // 直接使用 UUID 字符串作为 _id
        name: user.name,
        email: user.email,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });

    const usersToInsert = await Promise.all(userPromises);
    const usersResult = await db.collection('users').insertMany(usersToInsert);
    console.log(`✅ Inserted ${usersResult.insertedCount} users`);

    // 2. 插入客户数据
    console.log('👥 Inserting customers...');
    const customersToInsert = customers.map(customer => ({
      _id: customer.id, // 直接使用 UUID 字符串作为 _id
      name: customer.name,
      email: customer.email,
      image_url: customer.image_url,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    
    const customersResult = await db.collection('customers').insertMany(customersToInsert);
    console.log(`✅ Inserted ${customersResult.insertedCount} customers`);

    // 3. 插入发票数据
    console.log('🧾 Inserting invoices...');
    
    const invoicesToInsert = invoices.map((invoice, index) => {
      const customer = customers.find(c => c.id === invoice.customer_id);
      if (!customer) {
        throw new Error(`Customer not found for invoice at index ${index}`);
      }
      
      return {
        // 让 MongoDB 自动生成 _id
        customer_id: customer.id, // 使用客户的 UUID 字符串
        amount: invoice.amount,
        status: invoice.status,
        date: new Date(invoice.date),
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });
    
    const invoicesResult = await db.collection('invoices').insertMany(invoicesToInsert);
    console.log(`✅ Inserted ${invoicesResult.insertedCount} invoices`);

    // 4. 插入收入数据
    console.log('💰 Inserting revenue data...');
    const revenueToInsert = revenue.map(rev => ({
      month: rev.month,
      revenue: rev.revenue,
      year: 2023,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    
    const revenueResult = await db.collection('revenue').insertMany(revenueToInsert);
    console.log(`✅ Inserted ${revenueResult.insertedCount} revenue records`);

    console.log('🎉 Database seeding completed successfully!');
    
    return NextResponse.json({
      success: true,
      message: 'Database seeded successfully',
      counts: {
        users: usersResult.insertedCount,
        customers: customersResult.insertedCount,
        invoices: invoicesResult.insertedCount,
        revenue: revenueResult.insertedCount
      }
    });

  } catch (error: any) {
    console.error('❌ Error seeding database:', error);
    
    // 提供详细的错误信息
    let errorMessage = 'Unknown error';
    let errorDetails = '';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || '';
      
      // 检查是否是连接错误
      if (error.name === 'MongoParseError' || error.name === 'MongoServerSelectionError') {
        errorMessage = `MongoDB connection error: ${error.message}`;
      }
      
      // 检查是否是环境变量问题
      if (error.message.includes('MONGODB_URI') || error.message.includes('startsWith')) {
        errorMessage = `Environment variable error: ${error.message}. Please check your .env.local file.`;
      }
    }
    
    console.error('Error details:', errorDetails);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to seed database',
        message: errorMessage,
        suggestion: 'Please check: 1) MongoDB is running, 2) .env.local file has MONGODB_URI, 3) Network connection'
      },
      { status: 500 }
    );
  } finally {
    if (client) {
      try {
        await client.close();
        console.log('🔒 MongoDB connection closed');
      } catch (closeError) {
        console.error('Error closing MongoDB connection:', closeError);
      }
    }
  }
}