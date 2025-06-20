const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const s3Client = new S3Client({ 
  region: process.env.AWS_REGION || 'ap-southeast-2'
});

async function syncToS3Production() {
  try {
    const bucket = process.env.S3_BUCKET || 'rock-service-data';
    const key = 'config/production/test.json';  // 生产环境路径
    const filePath = path.join(process.cwd(), 'test.json');
    
    console.log(`开始同步文件到生产环境S3: ${bucket}/${key}`);
    console.log(`使用区域: ${process.env.AWS_REGION || 'ap-southeast-2'}`);
    
    // 检查本地文件是否存在
    if (!fs.existsSync(filePath)) {
      throw new Error(`本地文件不存在: ${filePath}`);
    }
    
    // 读取文件内容
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // 上传到S3生产环境
    const putObjectCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileContent,
      ContentType: 'application/json',
      Metadata: {
        'synced-from': 'github-master',
        'synced-at': new Date().toISOString(),
        'commit-sha': process.env.GITHUB_SHA || 'unknown',
        'environment': 'production'
      }
    });
    
    await s3Client.send(putObjectCommand);
    
    console.log(`✅ 成功同步文件到生产环境S3: ${bucket}/${key}`);
    
    // 验证上传
    console.log('验证上传...');
    const { HeadObjectCommand } = require('@aws-sdk/client-s3');
    const headCommand = new HeadObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    const headResult = await s3Client.send(headCommand);
    console.log(`文件大小: ${headResult.ContentLength} bytes`);
    console.log(`最后修改时间: ${headResult.LastModified}`);
    console.log(`生产环境同步完成！`);
    
  } catch (error) {
    console.error('❌ 同步到生产环境S3失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  syncToS3Production();
}

module.exports = { syncToS3Production }; 