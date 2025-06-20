const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

const s3Client = new S3Client({ 
  region: process.env.AWS_REGION || 'ap-southeast-2'
});

async function testCircularSyncProtection() {
  const bucket = process.env.S3_BUCKET || 'rock-service-data';
  
  console.log('🧪 测试循环同步防护机制');
  console.log('========================');
  
  // 测试场景1: 从GitHub同步的文件（应该被跳过）
  console.log('\n📋 测试场景1: 从GitHub同步的文件');
  await testGitHubSyncedFile(bucket);
  
  // 测试场景2: 手动修改的S3文件（应该同步到GitHub）
  console.log('\n📋 测试场景2: 手动修改的S3文件');
  await testManuallyModifiedFile(bucket);
  
  // 测试场景3: 最近同步的文件（应该被跳过）
  console.log('\n📋 测试场景3: 最近同步的文件');
  await testRecentlySyncedFile(bucket);
}

async function testGitHubSyncedFile(bucket) {
  const key = 'config/staging/test-circular.json';
  const content = JSON.stringify({
    name: 'test-circular',
    source: 'github-staging',
    timestamp: new Date().toISOString()
  }, null, 2);
  
  // 上传一个标记为从GitHub同步的文件
  const putCommand = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: content,
    ContentType: 'application/json',
    Metadata: {
      'synced-from': 'github-staging',
      'sync-direction': 'github-to-s3',
      'synced-at': new Date().toISOString(),
      'environment': 'staging'
    }
  });
  
  await s3Client.send(putCommand);
  console.log(`✅ 上传测试文件: ${key}`);
  
  // 模拟Lambda检查逻辑
  const getCommand = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });
  
  const response = await s3Client.send(getCommand);
  const metadata = response.Metadata || {};
  
  const isFromGitHub = metadata['synced-from'] && (
    metadata['synced-from'].includes('github') || 
    metadata['sync-direction'] === 'github-to-s3'
  );
  
  if (isFromGitHub) {
    console.log(`⏭️  正确跳过: 文件来源为GitHub (${metadata['synced-from']})`);
  } else {
    console.log(`❌ 错误: 应该跳过但未跳过`);
  }
}

async function testManuallyModifiedFile(bucket) {
  const key = 'config/staging/test-manual.json';
  const content = JSON.stringify({
    name: 'test-manual',
    source: 'manual-edit',
    timestamp: new Date().toISOString()
  }, null, 2);
  
  // 上传一个手动修改的文件（没有GitHub标记）
  const putCommand = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: content,
    ContentType: 'application/json',
    Metadata: {
      'synced-from': 'manual-edit',
      'synced-at': new Date().toISOString(),
      'environment': 'staging'
    }
  });
  
  await s3Client.send(putCommand);
  console.log(`✅ 上传手动修改文件: ${key}`);
  
  // 模拟Lambda检查逻辑
  const getCommand = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });
  
  const response = await s3Client.send(getCommand);
  const metadata = response.Metadata || {};
  
  const isFromGitHub = metadata['synced-from'] && (
    metadata['synced-from'].includes('github') || 
    metadata['sync-direction'] === 'github-to-s3'
  );
  
  if (!isFromGitHub) {
    console.log(`✅ 正确同步: 文件来源为手动修改 (${metadata['synced-from']})`);
  } else {
    console.log(`❌ 错误: 应该同步但被跳过了`);
  }
}

async function testRecentlySyncedFile(bucket) {
  const key = 'config/staging/test-recent.json';
  const content = JSON.stringify({
    name: 'test-recent',
    source: 'recent-sync',
    timestamp: new Date().toISOString()
  }, null, 2);
  
  // 上传一个最近同步的文件
  const putCommand = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: content,
    ContentType: 'application/json',
    Metadata: {
      'synced-from': 'github-staging',
      'sync-direction': 'github-to-s3',
      'synced-at': new Date().toISOString(), // 刚刚同步
      'environment': 'staging'
    }
  });
  
  await s3Client.send(putCommand);
  console.log(`✅ 上传最近同步文件: ${key}`);
  
  // 模拟Lambda检查逻辑
  const getCommand = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });
  
  const response = await s3Client.send(getCommand);
  const metadata = response.Metadata || {};
  
  const syncedAt = metadata['synced-at'];
  let isRecentSync = false;
  
  if (syncedAt) {
    const syncTime = new Date(syncedAt);
    const now = new Date();
    const timeDiff = now - syncTime;
    const fiveMinutes = 5 * 60 * 1000; // 5分钟
    isRecentSync = timeDiff < fiveMinutes;
  }
  
  if (isRecentSync) {
    console.log(`⏭️  正确跳过: 文件最近已同步 (${syncedAt})`);
  } else {
    console.log(`❌ 错误: 应该跳过但未跳过`);
  }
}

// 清理测试文件
async function cleanupTestFiles() {
  const bucket = process.env.S3_BUCKET || 'rock-service-data';
  const testFiles = [
    'config/staging/test-circular.json',
    'config/staging/test-manual.json',
    'config/staging/test-recent.json'
  ];
  
  console.log('\n🧹 清理测试文件...');
  
  for (const key of testFiles) {
    try {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      const deleteCommand = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key
      });
      await s3Client.send(deleteCommand);
      console.log(`✅ 删除: ${key}`);
    } catch (error) {
      console.log(`⚠️  删除失败: ${key} - ${error.message}`);
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--cleanup')) {
    cleanupTestFiles();
  } else {
    testCircularSyncProtection()
      .then(() => {
        console.log('\n🎉 循环同步防护测试完成！');
        console.log('💡 提示: 运行 node scripts/test-circular-sync.js --cleanup 清理测试文件');
      })
      .catch(console.error);
  }
}

module.exports = { testCircularSyncProtection, cleanupTestFiles }; 